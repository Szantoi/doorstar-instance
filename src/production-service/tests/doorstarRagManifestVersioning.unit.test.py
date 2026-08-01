"""Unit tests for the deterministic Doorstar RAG manifest versioner."""

from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "versionDoorstarNexusRagManifest.py"
SPEC = importlib.util.spec_from_file_location("doorstar_rag_manifest_versioner", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class DoorstarRagManifestVersioningTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.package = Path(self.temporary.name)
        self.source = self.package / "doorstar-rag-manifest.v1.json"
        self.manifest = self._manifest()
        self._write_source()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    @staticmethod
    def _manifest() -> dict[str, object]:
        return {
            "schemaVersion": "doorstar-rag-manifest.v1",
            "packageId": "doorstar-controlled-knowledge-rag",
            "packageVersion": "1.0.0",
            "targetIsland": "doorstar",
            "mode": "dry-run",
            "nexusWrite": False,
            "chromaWrite": False,
            "sourceInventoryFile": "SOURCE_INVENTORY.json",
            "evalFile": "RAG_EVAL_QUESTIONS.json",
            "idempotency": {
                "documentKeyAlgorithm": "sha256(id|version|canonicalSha256|policyVersion)",
                "duplicatePolicy": "reject",
                "baselineDocuments": [],
            },
            "documents": [
                {
                    "id": "doorstar.terminology",
                    "title": "Doorstar gyártási szótár – árvíztűrő tükörfúrógép",
                    "version": "1.0.0",
                    "domain": "terminology",
                    "tags": ["ajtó", "belső szóhasználat"],
                    "canonicalFile": "canonical/doorstar-terminology.v1.md",
                    "canonicalSha256": "a" * 64,
                    "sources": [
                        {
                            "sourceId": "SRC-TERMINOLOGY",
                            "relativePath": "docs/knowledge/terminology.md",
                            "sourceHash": "b" * 64,
                        }
                    ],
                    "sourceInventoryRefs": ["SRC-TERMINOLOGY"],
                    "reviewStatus": "READY_FOR_HUMAN_REVIEW",
                    "owner": "doorstar-root",
                    "sensitivity": "INTERNAL",
                    "validFrom": "2026-07-31",
                    "chunkingPolicy": dict(MODULE.V1_POLICY),
                }
            ],
        }

    def _write_source(self) -> None:
        self.source.write_text(json.dumps(self.manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def _run(self, *extra: str) -> subprocess.CompletedProcess[bytes]:
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--source-manifest",
                str(self.source),
                "--package-version",
                "1.1.0",
                "--document-version",
                "1.1.0",
                *extra,
            ],
            capture_output=True,
            check=False,
        )

    def _error_code(self, result: subprocess.CompletedProcess[bytes]) -> str:
        self.assertEqual(result.stdout, b"")
        return json.loads(result.stderr.decode("utf-8"))["error"]["code"]

    def test_preview_is_deterministic_utf8_and_writes_nothing(self) -> None:
        before = sorted(path.name for path in self.package.iterdir())
        source_before = self.source.read_bytes()
        first = self._run()
        second = self._run()

        self.assertEqual(first.returncode, 0, first.stderr.decode("utf-8"))
        self.assertEqual(first.stdout, second.stdout)
        self.assertEqual(first.stderr, b"")
        self.assertEqual(before, sorted(path.name for path in self.package.iterdir()))
        self.assertEqual(self.source.read_bytes(), source_before)
        self.assertIn("árvíztűrő tükörfúrógép".encode("utf-8"), first.stdout)

    def test_only_versions_and_policy_change_without_eval_override(self) -> None:
        result = MODULE.build_versioned_manifest(self.source, "2.3.4", "5.6.7")
        expected = copy.deepcopy(self.manifest)
        expected["packageVersion"] = "2.3.4"
        expected["documents"][0]["version"] = "5.6.7"
        expected["documents"][0]["chunkingPolicy"] = dict(MODULE.CLAIM_ROWS_V2_POLICY)

        self.assertEqual(result, expected)
        self.assertEqual(result["evalFile"], "RAG_EVAL_QUESTIONS.json")
        self.assertEqual(result["sourceInventoryFile"], "SOURCE_INVENTORY.json")

    def test_eval_override_changes_only_safe_eval_path(self) -> None:
        result = MODULE.build_versioned_manifest(
            self.source,
            "1.1.0",
            "1.1.0",
            eval_file="RAG_EVAL_QUESTIONS.v1.1.json",
        )

        self.assertEqual(result["evalFile"], "RAG_EVAL_QUESTIONS.v1.1.json")
        self.assertEqual(result["documents"][0]["title"], self.manifest["documents"][0]["title"])

    def test_inventory_override_changes_only_safe_inventory_path(self) -> None:
        result = MODULE.build_versioned_manifest(
            self.source,
            "1.1.0",
            "1.1.0",
            inventory_file="SOURCE_INVENTORY.v1.1.json",
        )

        self.assertEqual(result["sourceInventoryFile"], "SOURCE_INVENTORY.v1.1.json")
        self.assertEqual(result["evalFile"], self.manifest["evalFile"])

    def test_exact_v1_1_output_name_is_accepted_and_replace_is_explicit(self) -> None:
        output = self.package / "doorstar-rag-manifest.v1.1.json"
        source_before = self.source.read_bytes()
        first = self._run("--output", str(output))

        self.assertEqual(first.returncode, 0, first.stderr.decode("utf-8"))
        self.assertEqual(output.read_bytes(), first.stdout)
        blocked = self._run("--output", str(output))
        self.assertEqual(self._error_code(blocked), "OUTPUT_EXISTS")

        replaced = self._run("--output", str(output), "--replace", "--eval-file", "RAG_EVAL_QUESTIONS.v1.1.json")
        self.assertEqual(replaced.returncode, 0, replaced.stderr.decode("utf-8"))
        self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["evalFile"], "RAG_EVAL_QUESTIONS.v1.1.json")
        self.assertEqual(self.source.read_bytes(), source_before)
        self.assertEqual(list(self.package.glob(".*.tmp")), [])

    def test_output_outside_wrong_name_and_source_overwrite_are_rejected(self) -> None:
        outside = self.package.parent / "doorstar-rag-manifest.v1.1.json"
        self.assertEqual(self._error_code(self._run("--output", str(outside))), "OUTPUT_OUTSIDE_PACKAGE")
        wrong = self.package / "manifest.json"
        self.assertEqual(self._error_code(self._run("--output", str(wrong))), "OUTPUT_NAME_INVALID")

        source_same_name = self.package / "doorstar-rag-manifest.v1.1.json"
        source_same_name.write_bytes(self.source.read_bytes())
        self.source = source_same_name
        self.assertEqual(self._error_code(self._run("--output", str(source_same_name), "--replace")), "SOURCE_OVERWRITE_FORBIDDEN")

    def test_unsafe_package_paths_and_eval_override_are_rejected(self) -> None:
        cases = (
            ("sourceInventoryFile", "../SOURCE_INVENTORY.json"),
            ("evalFile", "C:/outside/eval.json"),
        )
        for field, value in cases:
            with self.subTest(field=field):
                self.manifest = self._manifest()
                self.manifest[field] = value
                self._write_source()
                self.assertEqual(self._error_code(self._run()), "PACKAGE_PATH_UNSAFE")

        self.manifest = self._manifest()
        self.manifest["documents"][0]["canonicalFile"] = "../canonical.md"
        self._write_source()
        self.assertEqual(self._error_code(self._run()), "PACKAGE_PATH_UNSAFE")

        self.manifest = self._manifest()
        self._write_source()
        self.assertEqual(self._error_code(self._run("--eval-file", "../eval.json")), "PACKAGE_PATH_UNSAFE")
        self.assertEqual(
            self._error_code(self._run("--inventory-file", "../inventory.json")),
            "PACKAGE_PATH_UNSAFE",
        )

    def test_invalid_dry_run_flags_target_and_schema_are_blocked(self) -> None:
        cases = (
            ("nexusWrite", True, "NEXUS_WRITE_FORBIDDEN"),
            ("chromaWrite", True, "CHROMA_WRITE_FORBIDDEN"),
            ("mode", "apply", "MODE_NOT_DRY_RUN"),
            ("targetIsland", "public", "TARGET_ISLAND_INVALID"),
            ("schemaVersion", "doorstar-rag-manifest.v2", "MANIFEST_SCHEMA_INVALID"),
        )
        for field, value, code in cases:
            with self.subTest(field=field):
                self.manifest = self._manifest()
                self.manifest[field] = value
                self._write_source()
                self.assertEqual(self._error_code(self._run()), code)

    def test_exact_schema_rejects_missing_and_unknown_fields(self) -> None:
        self.manifest["unexpected"] = True
        self._write_source()
        self.assertEqual(self._error_code(self._run()), "SCHEMA_FIELDS_INVALID")

        self.manifest = self._manifest()
        del self.manifest["documents"][0]["owner"]
        self._write_source()
        self.assertEqual(self._error_code(self._run()), "SCHEMA_FIELDS_INVALID")

    def test_duplicate_documents_and_invalid_source_versions_are_blocked(self) -> None:
        self.manifest["documents"].append(copy.deepcopy(self.manifest["documents"][0]))
        self._write_source()
        self.assertEqual(self._error_code(self._run()), "DUPLICATE_DOCUMENT")

        self.manifest = self._manifest()
        self.manifest["documents"][0]["version"] = "v1"
        self._write_source()
        self.assertEqual(self._error_code(self._run()), "SEMVER_INVALID")

        self.manifest = self._manifest()
        self.manifest["packageVersion"] = "01.0.0"
        self._write_source()
        self.assertEqual(self._error_code(self._run()), "SEMVER_INVALID")

    def test_invalid_requested_versions_and_profile_are_machine_readable(self) -> None:
        invalid_version = self._run("--package-version", "1.0")
        self.assertEqual(self._error_code(invalid_version), "SEMVER_INVALID")

        unsupported = self._run("--profile", "paragraphs-v3")
        self.assertEqual(self._error_code(unsupported), "PROFILE_UNSUPPORTED")


if __name__ == "__main__":
    unittest.main()
