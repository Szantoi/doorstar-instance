from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "prepareDoorstarNexusRagCandidateEval.py"
PACKAGE = ROOT / "docs" / "projects" / "doorstar-nexus-rag"
SPEC = importlib.util.spec_from_file_location("doorstarRagCandidateEvalInput", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class DoorstarRagCandidateEvalInputTest(unittest.TestCase):
    def test_actual_v11_package_stream_has_exact_claim_mapping(self) -> None:
        value = MODULE.build_candidate_input(
            PACKAGE / "doorstar-rag-manifest.v1.1.json",
            PACKAGE / "SOURCE_INVENTORY.v1.1.json",
            PACKAGE / "DRY_RUN_REPORT.v1.1.0.json",
        )

        self.assertEqual(len(value["chunks"]), 104)
        self.assertEqual(len(value["questions"]), 35)
        self.assertEqual(sum(item["chunkKind"] == "CLAIM" for item in value["chunks"]), 98)
        self.assertEqual(sum(item["chunkKind"] == "OVERVIEW" for item in value["chunks"]), 6)
        claim_ids = [claim_id for item in value["chunks"] for claim_id in item["claimIds"]]
        self.assertEqual(len(claim_ids), len(set(claim_ids)))
        self.assertEqual(
            sorted(claim_ids),
            [item["claimId"] for item in value["claimCitations"]],
        )
        self.assertTrue(all(item["sourceIds"] for item in value["claimCitations"]))
        self.assertTrue(all(item["expectedDocumentMode"] in {"ALL", "ANY"} for item in value["questions"]))

    def test_cli_stream_is_deterministic_and_writes_no_artifact(self) -> None:
        command = [
            sys.executable, str(SCRIPT),
            "--manifest", str(PACKAGE / "doorstar-rag-manifest.v1.1.json"),
            "--inventory", str(PACKAGE / "SOURCE_INVENTORY.v1.1.json"),
            "--dry-run-report", str(PACKAGE / "DRY_RUN_REPORT.v1.1.0.json"),
        ]
        first = subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        second = subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(first.stdout, second.stdout)
        self.assertEqual(first.stderr, b"")
        parsed = json.loads(first.stdout)
        self.assertNotIn("payloads", parsed)

    def test_tampered_stored_report_is_rejected_before_content_projection(self) -> None:
        original_loader = MODULE._load_json

        def tampered_loader(path: Path):
            value = original_loader(path)
            if path.name == "DRY_RUN_REPORT.v1.1.0.json":
                value = copy.deepcopy(value)
                value["packageHash"] = "0" * 64
            return value

        MODULE._load_json = tampered_loader
        try:
            with self.assertRaisesRegex(ValueError, "differs"):
                MODULE.build_candidate_input(
                    PACKAGE / "doorstar-rag-manifest.v1.1.json",
                    PACKAGE / "SOURCE_INVENTORY.v1.1.json",
                    PACKAGE / "DRY_RUN_REPORT.v1.1.0.json",
                )
        finally:
            MODULE._load_json = original_loader

    def test_duplicate_json_key_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "duplicate.json"
            path.write_text('{"targetIsland":"doorstar","targetIsland":"other"}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Invalid UTF-8 JSON"):
                MODULE._load_json(path)

    def test_unreferenced_inventory_drift_warning_does_not_change_candidate_package(self) -> None:
        report = json.loads((PACKAGE / "DRY_RUN_REPORT.v1.1.0.json").read_text(encoding="utf-8"))
        drifted = copy.deepcopy(report)
        drifted["warnings"].append({
            "code": "INVENTORY_UNREFERENCED_SOURCE_DRIFT",
            "location": "inventory.sources[0].sha256",
            "message": "Content-free unreferenced snapshot diagnostic.",
        })
        drifted["summary"]["warningCount"] += 1

        self.assertEqual(
            MODULE._content_free_report(drifted, True),
            MODULE._content_free_report(report, True),
        )


if __name__ == "__main__":
    unittest.main()
