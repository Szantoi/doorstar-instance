from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
MODULE_PATH = ROOT / "scripts" / "versionDoorstarNexusRagInputs.py"
SPEC = importlib.util.spec_from_file_location("versionDoorstarNexusRagInputs", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DoorstarRagInputVersioningTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / ".git").mkdir()
        self.package = self.root / "docs" / "projects" / "doorstar-nexus-rag"
        self.package.mkdir(parents=True)
        source_file = self.root / "docs" / "unreferenced.md"
        source_file.parent.mkdir(exist_ok=True)
        source_file.write_text("updated metadata source\n", encoding="utf-8")
        referenced_file = self.root / "docs" / "referenced.md"
        referenced_file.write_text("canonical source\n", encoding="utf-8")
        self.inventory_path = self.package / "SOURCE_INVENTORY.json"
        self.inventory_path.write_text(json.dumps({
            "schemaVersion": "1.0.0",
            "inventoryId": "doorstar-nexus-rag-source-inventory",
            "inventoryVersion": "1.0.0",
            "snapshotDate": "2026-07-31",
            "targetIsland": "doorstar",
            "dryRunOnly": True,
            "ragIndexable": False,
            "mutationPolicy": {"nexus": "FORBIDDEN", "chromaDb": "FORBIDDEN"},
            "sourceCount": 2,
            "sources": [
                {"sourceId": "SRC-UNREFERENCED", "relativePath": "docs/unreferenced.md", "sha256": "0" * 64, "sizeBytes": 1},
                {"sourceId": "SRC-REFERENCED", "relativePath": "docs/referenced.md", "sha256": "1" * 64, "sizeBytes": 2},
            ],
        }), encoding="utf-8")
        self.manifest_path = self.package / "doorstar-rag-manifest.v1.json"
        self.manifest_path.write_text(json.dumps({
            "targetIsland": "doorstar",
            "mode": "dry-run",
            "nexusWrite": False,
            "chromaWrite": False,
            "documents": [{"sources": [{"sourceId": "SRC-REFERENCED"}]}],
        }), encoding="utf-8")
        self.eval_path = self.package / "RAG_EVAL_QUESTIONS.json"
        questions = [{
            "id": f"Q-{index:03d}",
            "question": "Kérdés?",
            "expectedDocumentIds": ["doc"],
            "expectedSourceIds": ["SRC"],
            "expectedClaimIds": [f"CLAIM-{index:03d}"],
        } for index in range(1, 21)]
        self.eval_path.write_text(json.dumps({
            "schemaVersion": "doorstar-rag-eval.v1",
            "packageId": "doorstar-company-knowledge",
            "targetIsland": "doorstar",
            "questions": questions,
        }), encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_inventory_refreshes_only_requested_unreferenced_source(self) -> None:
        first = MODULE.version_inventory(
            self.inventory_path, self.manifest_path, "1.1.0", "2026-08-01", ["SRC-UNREFERENCED"]
        )
        second = MODULE.version_inventory(
            self.inventory_path, self.manifest_path, "1.1.0", "2026-08-01", ["SRC-UNREFERENCED"]
        )
        self.assertEqual(first, second)
        self.assertEqual(first["inventoryVersion"], "1.1.0")
        self.assertEqual(first["snapshotDate"], "2026-08-01")
        self.assertNotEqual(first["sources"][0]["sha256"], "0" * 64)
        self.assertEqual(first["sources"][1]["sha256"], "1" * 64)

    def test_inventory_rejects_refresh_of_canonical_source(self) -> None:
        with self.assertRaisesRegex(ValueError, "Referenced canonical source"):
            MODULE.version_inventory(
                self.inventory_path, self.manifest_path, "1.1.0", "2026-08-01", ["SRC-REFERENCED"]
            )

    def test_inventory_rejects_write_enabled_manifest_and_duplicate_json_keys(self) -> None:
        manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        manifest["mode"] = "apply"
        manifest["nexusWrite"] = True
        self.manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "dry-run"):
            MODULE.version_inventory(
                self.inventory_path, self.manifest_path, "1.1.0", "2026-08-01", ["SRC-UNREFERENCED"]
            )

        self.manifest_path.write_text(
            '{"targetIsland":"doorstar","targetIsland":"other"}', encoding="utf-8"
        )
        with self.assertRaisesRegex(ValueError, "Invalid UTF-8 JSON"):
            MODULE._load_json(self.manifest_path)

    def test_inventory_rejects_duplicate_or_non_increasing_version(self) -> None:
        with self.assertRaisesRegex(ValueError, "unique refresh"):
            MODULE.version_inventory(
                self.inventory_path, self.manifest_path, "1.1.0", "2026-08-01",
                ["SRC-UNREFERENCED", "SRC-UNREFERENCED"]
            )
        with self.assertRaisesRegex(ValueError, "greater"):
            MODULE.version_inventory(
                self.inventory_path, self.manifest_path, "1.0.0", "2026-08-01", ["SRC-UNREFERENCED"]
            )

    def test_eval_adds_explicit_all_mode_without_mutating_source(self) -> None:
        before = self.eval_path.read_bytes()
        projected = MODULE.version_eval(self.eval_path, "1.1.0")
        self.assertEqual(projected["evalVersion"], "1.1.0")
        self.assertTrue(all(item["expectedDocumentMode"] == "ALL" for item in projected["questions"]))
        self.assertEqual(self.eval_path.read_bytes(), before)

    def test_eval_supports_explicit_any_and_rejects_invalid_mode(self) -> None:
        projected = MODULE.version_eval(self.eval_path, "1.1.0", "ANY")
        self.assertTrue(all(item["expectedDocumentMode"] == "ANY" for item in projected["questions"]))
        with self.assertRaisesRegex(ValueError, "ALL or ANY"):
            MODULE.version_eval(self.eval_path, "1.1.0", "SOME")

    def test_exact_versioned_output_is_atomic_and_overwrite_guarded(self) -> None:
        projected = MODULE.version_eval(self.eval_path, "1.1.0")
        output = self.package / "RAG_EVAL_QUESTIONS.v1.1.json"
        MODULE._write_exact_versioned(projected, self.eval_path, output, output.name, False)
        self.assertEqual(json.loads(output.read_text(encoding="utf-8")), projected)
        with self.assertRaisesRegex(ValueError, "already exists"):
            MODULE._write_exact_versioned(projected, self.eval_path, output, output.name, False)
        with self.assertRaisesRegex(ValueError, "named exactly"):
            MODULE._write_exact_versioned(projected, self.eval_path, self.package / "wrong.json", output.name, False)

    def test_live_baseline_requires_and_projects_exact_created_hash_set(self) -> None:
        documents = []
        chunks = []
        for document_index in range(6):
            document_id = f"doorstar.doc-{document_index}"
            document_key = f"{document_index + 1:064x}"
            documents.append({
                "id": document_id,
                "version": "1.0.0",
                "canonicalSha256": f"{document_index + 11:064x}",
                "documentKey": document_key,
            })
            count = 7 if document_index < 5 else 6
            for chunk_index in range(count):
                ordinal = len(chunks) + 101
                chunks.append({
                    "chunkKey": f"{ordinal:064x}",
                    "contentSha256": f"{ordinal + 100:064x}",
                    "documentId": document_id,
                    "documentVersion": "1.0.0",
                })
        report = {
            "schemaVersion": "doorstar-nexus-rag-dry-run-report.v1",
            "packageVersion": "1.0.0",
            "packageHash": "a" * 64,
            "ok": True,
            "summary": {"documentCount": 6, "chunkCount": 41},
            "documents": documents,
            "chunks": chunks,
        }
        report_path = self.package / "DRY_RUN_REPORT.json"
        report_path.write_text(json.dumps(report), encoding="utf-8")
        created_hash = MODULE.hashlib.sha256(
            json.dumps(sorted(item["chunkKey"] for item in chunks), separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        audit = {
            "schemaVersion": "doorstar-nexus-rag-live-apply-audit.v1",
            "package": {
                "packageHash": "a" * 64,
                "dryRunReportSha256": MODULE._sha256_file(report_path),
            },
            "target": {"island": "doorstar", "collection": "doorstar-knowledge"},
            "successfulRun": {
                "status": "APPLIED", "createdCount": 41, "createdIdsSha256": created_hash, "postCount": 2016,
            },
        }
        audit_path = self.package / "LIVE_APPLY.json"
        audit_path.write_text(json.dumps(audit), encoding="utf-8")

        projected = MODULE.build_live_baseline(report_path, audit_path)

        self.assertEqual(len(projected["documents"]), 6)
        self.assertEqual(len(projected["chunks"]), 41)
        self.assertEqual(sum(len(item["chunkKeys"]) for item in projected["documents"]), 41)
        report["documents"][0]["canonicalSha256"] = "f" * 64
        report_path.write_text(json.dumps(report), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Live apply audit"):
            MODULE.build_live_baseline(report_path, audit_path)
        report["documents"][0]["canonicalSha256"] = f"{11:064x}"
        report_path.write_text(json.dumps(report), encoding="utf-8")
        audit["successfulRun"]["createdIdsSha256"] = "f" * 64
        audit["package"]["dryRunReportSha256"] = MODULE._sha256_file(report_path)
        audit_path.write_text(json.dumps(audit), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "created-ID"):
            MODULE.build_live_baseline(report_path, audit_path)


if __name__ == "__main__":
    unittest.main()
