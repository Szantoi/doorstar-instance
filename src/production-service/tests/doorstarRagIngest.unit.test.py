"""Adversarial unit tests for the read-only Doorstar RAG ingest planner."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[3]
PLANNER_SCRIPT = REPOSITORY / "scripts" / "prepareDoorstarNexusRagIngest.py"
VALIDATOR_SCRIPT = REPOSITORY / "scripts" / "prepareDoorstarNexusRag.py"
EXPECTED_METADATA_FIELDS = {
    "source",
    "doc",
    "file_sha256",
    "category",
    "chunk_index",
    "type",
    "language",
    "name",
    "targetIsland",
    "targetCollection",
    "packageHash",
    "documentId",
    "documentVersion",
    "documentKey",
    "canonicalSha256",
    "domain",
    "title",
    "tags",
    "owner",
    "reviewStatus",
    "sensitivity",
    "validFrom",
    "sources",
    "policy",
    "section",
    "sectionKey",
    "chunkIndex",
    "chunkKey",
    "contentSha256",
    "charCount",
}


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


PLANNER = load_module("doorstar_rag_ingest_planner_test", PLANNER_SCRIPT)
VALIDATOR = load_module("doorstar_rag_validator_for_ingest_test", VALIDATOR_SCRIPT)


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


class DoorstarRagIngestPlannerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.repository = Path(self.temporary.name)
        (self.repository / ".git").mkdir()
        self.package = self.repository / "docs" / "projects" / "doorstar-nexus-rag"
        (self.package / "canonical").mkdir(parents=True)

        self.primary_source = self.repository / "docs" / "source.md"
        self.primary_source.parent.mkdir(parents=True, exist_ok=True)
        self.primary_source.write_bytes(b"immutable-primary-source")
        self.openapi_source = (
            self.repository
            / "src"
            / "production-service"
            / "openapi"
            / "production-service.openapi.json"
        )
        self.openapi_source.parent.mkdir(parents=True)
        self.openapi_source.write_bytes(b'{"openapi":"3.1.0"}\n')

        self.canonical = self.package / "canonical" / "controlled.md"
        sections = [
            (
                "# Szakasz 01\n\n"
                "| Claim ID | Status | Statement | Source citation |\n"
                "| --- | --- | --- | --- |\n"
                "| CLAIM-001 | VERIFIED | Az auditĂˇlt folyamat determinisztikus. | "
                f"SRC-PRIMARY@sha256:{sha256(self.primary_source.read_bytes())}#source:rule-1 |\n"
            )
        ]
        sections.extend(
            f"# Szakasz {index:02d}\n\nA(z) {index}. ellenĹ‘rzĂ¶tt tudĂˇsrĂ©szlet.\n"
            for index in range(2, 42)
        )
        self.canonical_text = "\n".join(sections)
        self.canonical.write_text(self.canonical_text, encoding="utf-8", newline="\n")

        self.inventory = {
            "schemaVersion": "doorstar-rag-source-inventory.v1",
            "inventoryId": "doorstar-ingest-test-inventory",
            "inventoryVersion": "1.0.0",
            "snapshotDate": "2026-07-31",
            "targetIsland": "doorstar",
            "dryRunOnly": True,
            "ragIndexable": False,
            "mutationPolicy": {"nexus": "FORBIDDEN", "chromaDb": "FORBIDDEN"},
            "artifactSensitivity": "INTERNAL",
            "hashAlgorithm": "sha256",
            "pathBase": "repository-root",
            "pathFormat": "POSIX relative",
            "sourceCount": 2,
            "excludedSourceClasses": ["raw-binary"],
            "sources": [
                {
                    "sourceId": "SRC-PRIMARY",
                    "relativePath": "docs/source.md",
                    "fileType": "MD",
                    "sha256": sha256(self.primary_source.read_bytes()),
                    "workflow": "CONTROLLED_TEST",
                    "responsibleArea": "ROOT",
                    "sensitivity": "INTERNAL",
                    "containsPersonalData": False,
                    "containsCustomerData": False,
                    "containsOrderData": False,
                    "disposition": "PROCESS",
                    "rationale": "Immutable referenced test source.",
                },
                {
                    "sourceId": "SRC-BACKEND-OPENAPI",
                    "relativePath": "src/production-service/openapi/production-service.openapi.json",
                    "fileType": "JSON",
                    "sha256": sha256(self.openapi_source.read_bytes()),
                    "workflow": "API_CONTRACT",
                    "responsibleArea": "BACKEND",
                    "sensitivity": "INTERNAL",
                    "containsPersonalData": False,
                    "containsCustomerData": False,
                    "containsOrderData": False,
                    "disposition": "PROCESS",
                    "rationale": "Non-manifest OpenAPI source for the describe-only drift test.",
                },
            ],
        }
        self.document = {
            "id": "doorstar.controlled-test",
            "title": "Doorstar kontrollĂˇlt tesztdokumentum",
            "version": "1.0.0",
            "domain": "controlled-ingest-test",
            "tags": ["doorstar", "controlled", "test"],
            "canonicalFile": "canonical/controlled.md",
            "canonicalSha256": sha256(self.canonical.read_bytes()),
            "sources": [
                {
                    "sourceId": "SRC-PRIMARY",
                    "relativePath": "docs/source.md",
                    "sourceHash": sha256(self.primary_source.read_bytes()),
                }
            ],
            "sourceInventoryRefs": ["SRC-PRIMARY"],
            "reviewStatus": "READY_FOR_HUMAN_REVIEW",
            "owner": "doorstar-root",
            "sensitivity": "INTERNAL",
            "validFrom": "2026-07-31",
            "chunkingPolicy": dict(PLANNER.EXPECTED_POLICY),
        }
        self.manifest = {
            "schemaVersion": "doorstar-rag-manifest.v1",
            # Deliberately differs from production to prove category is passed
            # through from matching manifest/report evidence, not hard-coded.
            "packageId": "doorstar-controlled-ingest-test",
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
            "documents": [self.document],
        }
        self.evaluation = {
            "schemaVersion": "doorstar-rag-eval.v1",
            "packageId": self.manifest["packageId"],
            "targetIsland": "doorstar",
            "questions": [
                {
                    "id": f"EVAL-{index:03d}",
                    "question": f"Melyik claim igazolja a kontrollĂˇlt folyamatot? ({index})",
                    "expectedDocumentIds": [self.document["id"]],
                    "expectedSourceIds": ["SRC-PRIMARY"],
                    "expectedClaimIds": ["CLAIM-001"],
                }
                for index in range(1, 21)
            ],
        }

        self.manifest_path = self.package / "doorstar-rag-manifest.v1.json"
        self.inventory_path = self.package / "SOURCE_INVENTORY.json"
        self.eval_path = self.package / "RAG_EVAL_QUESTIONS.json"
        self.report_path = self.package / "DRY_RUN_REPORT.json"
        self.authorization_path = self.package / "EXECUTION_AUTHORIZATION.json"
        self.baseline_path = self.package / "READ_ONLY_BASELINE.json"
        self._write_package_inputs()

        report = VALIDATOR.validate_package(self.manifest_path, self.inventory_path)
        self.assertTrue(report["ok"], report["errors"])
        self.assertEqual(report["summary"]["chunkCount"], 41)
        self.report_path.write_text(VALIDATOR.render_report(report), encoding="utf-8", newline="\n")
        self.report = report
        self.authorization = self._new_authorization()
        self.baseline = {
            "schemaVersion": PLANNER.BASELINE_SCHEMA,
            "targetIsland": "doorstar",
            "targetCollection": "doorstar-knowledge",
            "documents": [],
            "chunks": [],
        }
        self._write_authorization()
        self._write_baseline()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _write_package_inputs(self) -> None:
        self.manifest_path.write_text(
            json.dumps(self.manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
            newline="\n",
        )
        self.inventory_path.write_text(
            json.dumps(self.inventory, ensure_ascii=False, indent=2),
            encoding="utf-8",
            newline="\n",
        )
        self.eval_path.write_text(
            json.dumps(self.evaluation, ensure_ascii=False, indent=2),
            encoding="utf-8",
            newline="\n",
        )

    def _new_authorization(self) -> dict[str, object]:
        return {
            "schemaVersion": PLANNER.AUTHORIZATION_SCHEMA,
            "decision": "APPROVED",
            "packageHash": self.report["packageHash"],
            "dryRunReportSha256": sha256(self.report_path.read_bytes()),
            "manifestSha256": sha256(self.manifest_path.read_bytes()),
            "inventorySha256": sha256(self.inventory_path.read_bytes()),
            "evalSha256": sha256(self.eval_path.read_bytes()),
            "targetIsland": "doorstar",
            "targetCollection": "doorstar-knowledge",
            "approvedBy": "doorstar-owner:test",
            "approvedAt": "2026-07-31T20:30:00+02:00",
        }

    def _write_authorization(self) -> None:
        self.authorization_path.write_text(
            json.dumps(self.authorization, ensure_ascii=False, indent=2),
            encoding="utf-8",
            newline="\n",
        )

    def _write_baseline(self) -> None:
        self.baseline_path.write_text(
            json.dumps(self.baseline, ensure_ascii=False, indent=2),
            encoding="utf-8",
            newline="\n",
        )

    def _plan(
        self,
        *,
        with_authorization: bool = True,
        with_baseline: bool = True,
        payload: bool = False,
    ) -> dict[str, object]:
        return PLANNER.build_ingest_plan(
            self.manifest_path,
            self.inventory_path,
            self.report_path,
            self.authorization_path if with_authorization else None,
            self.baseline_path if with_baseline else None,
            emit_payload_to_stdout=payload,
        )

    @staticmethod
    def _codes(plan: dict[str, object], field: str) -> set[str]:
        return {item["code"] for item in plan[field]}

    def test_valid_plan_is_deterministic_content_free_and_scalar_safe(self) -> None:
        before = sorted(path.relative_to(self.repository) for path in self.repository.rglob("*"))

        first = self._plan()
        second = self._plan()

        self.assertTrue(first["readyForSeparateExecutor"], first["errors"])
        self.assertEqual(first, second)
        self.assertEqual(PLANNER.render_plan(first), PLANNER.render_plan(second))
        self.assertEqual(first["summary"]["chunkCount"], 41)
        self.assertNotIn("payloads", first)
        self.assertNotIn("Az auditĂˇlt folyamat determinisztikus.", PLANNER.render_plan(first))
        expected_source = (
            f"{PLANNER.EXPECTED_PACKAGE_SOURCE_PREFIX}/{self.document['canonicalFile']}"
        )
        self.assertEqual(len(first["chunks"]), 41)
        for chunk in first["chunks"]:
            metadata = chunk["metadata"]
            self.assertEqual(set(metadata), EXPECTED_METADATA_FIELDS)
            self.assertTrue(
                all(isinstance(value, (str, int, float, bool)) for value in metadata.values())
            )
            self.assertEqual(metadata["source"], expected_source)
            self.assertEqual(metadata["doc"], self.document["id"])
            self.assertEqual(metadata["file_sha256"], self.document["canonicalSha256"])
            self.assertEqual(metadata["category"], self.manifest["packageId"])
            self.assertEqual(metadata["chunk_index"], metadata["chunkIndex"])
            self.assertEqual(metadata["doc"], metadata["documentId"])
            self.assertEqual(metadata["file_sha256"], metadata["canonicalSha256"])
            self.assertEqual(metadata["type"], "doc")
            self.assertEqual(metadata["language"], "markdown")
            self.assertEqual(metadata["name"], self.document["title"])
            self.assertEqual(metadata["name"], metadata["title"])
            self.assertIsInstance(metadata["tags"], str)
            self.assertIsInstance(metadata["sources"], str)
            self.assertIsInstance(metadata["policy"], str)
        after = sorted(path.relative_to(self.repository) for path in self.repository.rglob("*"))
        self.assertEqual(before, after, "The planner must not create files.")

    def test_explicit_stdout_payload_mode_reconstructs_all_41_chunks(self) -> None:
        plan = self._plan(payload=True)

        self.assertTrue(plan["readyForSeparateExecutor"], plan["errors"])
        self.assertEqual(plan["mode"], "STDOUT_PAYLOAD")
        self.assertEqual(len(plan["payloads"]), 41)
        self.assertTrue(all(item["content"] for item in plan["payloads"]))
        self.assertTrue(all(item["payloadIncluded"] for item in plan["chunks"]))
        self.assertEqual(len(plan["chunks"]), 41)
        expected_source = (
            f"{PLANNER.EXPECTED_PACKAGE_SOURCE_PREFIX}/{self.document['canonicalFile']}"
        )
        payloads_by_id = {item["id"]: item for item in plan["payloads"]}
        self.assertEqual(len(payloads_by_id), 41)
        for chunk in plan["chunks"]:
            payload = payloads_by_id[chunk["chunkKey"]]
            self.assertEqual(payload["metadata"], chunk["metadata"])
            self.assertEqual(payload["metadata"]["source"], expected_source)
            self.assertEqual(
                payload["metadata"]["file_sha256"], self.document["canonicalSha256"]
            )
            self.assertEqual(payload["metadata"]["doc"], self.document["id"])
            self.assertEqual(payload["metadata"]["category"], self.manifest["packageId"])
            self.assertEqual(
                payload["metadata"]["chunk_index"], payload["metadata"]["chunkIndex"]
            )
        self.assertFalse(plan["writeProof"]["payloadFileWriteSupported"])

    def test_canonical_file_path_attacks_fail_closed_before_payload_metadata(self) -> None:
        unsafe_paths = (
            "canonical/../../outside.md",
            "/canonical/controlled.md",
            "C:/canonical/controlled.md",
            "docs/projects/doorstar-nexus-rag/canonical/controlled.md",
            "canonical//controlled.md",
        )
        for unsafe_path in unsafe_paths:
            with self.subTest(canonical_file=unsafe_path):
                self.document["canonicalFile"] = unsafe_path
                self._write_package_inputs()

                plan = self._plan(payload=True)

                self.assertFalse(plan["readyForSeparateExecutor"])
                self.assertIn("CANONICAL_PATH_UNSAFE", self._codes(plan, "errors"))
                self.assertEqual(plan["payloads"], [])
                self.assertEqual(plan["chunks"], [])

    def test_report_package_id_mismatch_cannot_supply_metadata_category(self) -> None:
        report = json.loads(self.report_path.read_text(encoding="utf-8"))
        report["packageId"] = "unapproved-package"
        self.report_path.write_text(
            VALIDATOR.render_report(report),
            encoding="utf-8",
            newline="\n",
        )
        self.authorization["dryRunReportSha256"] = sha256(self.report_path.read_bytes())
        self._write_authorization()

        plan = self._plan()

        self.assertFalse(plan["readyForSeparateExecutor"])
        self.assertIn("PACKAGE_ID_MISMATCH", self._codes(plan, "errors"))
        self.assertTrue(all(chunk["metadata"] == {} for chunk in plan["chunks"]))

    def test_wrong_package_authorization_fails_closed(self) -> None:
        self.authorization["packageHash"] = "0" * 64
        self._write_authorization()

        plan = self._plan()

        self.assertFalse(plan["readyForSeparateExecutor"])
        self.assertIn("EXECUTION_AUTHORIZATION_PIN_MISMATCH", self._codes(plan, "errors"))

    def test_wrong_island_and_collection_fail_closed(self) -> None:
        self.authorization["targetIsland"] = "public"
        self.baseline["targetCollection"] = "other-knowledge"
        self._write_authorization()
        self._write_baseline()

        plan = self._plan()

        codes = self._codes(plan, "errors")
        self.assertFalse(plan["readyForSeparateExecutor"])
        self.assertIn("EXECUTION_AUTHORIZATION_PIN_MISMATCH", codes)
        self.assertIn("BASELINE_TARGET_COLLECTION_INVALID", codes)

    def test_duplicate_json_key_is_rejected_before_baseline_actions(self) -> None:
        self.baseline_path.write_text(
            '{"schemaVersion":"doorstar-nexus-rag-readonly-baseline.v1",'
            '"targetIsland":"doorstar","targetIsland":"other",'
            '"targetCollection":"doorstar-knowledge","documents":[],"chunks":[]}',
            encoding="utf-8",
        )

        plan = self._plan()

        self.assertFalse(plan["readyForSeparateExecutor"])
        self.assertIn("DUPLICATE_JSON_KEY", self._codes(plan, "errors"))
        self.assertEqual(plan["payloads"] if "payloads" in plan else [], [])

    def test_missing_approval_and_baseline_withhold_payload(self) -> None:
        plan = self._plan(with_authorization=False, with_baseline=False, payload=True)

        self.assertFalse(plan["readyForSeparateExecutor"])
        self.assertEqual(plan["payloads"], [])
        codes = self._codes(plan, "blockers")
        self.assertIn("EXECUTION_AUTHORIZATION_MISSING", codes)
        self.assertIn("READ_ONLY_BASELINE_MISSING", codes)
        self.assertIn("PAYLOAD_EMISSION_BLOCKED", codes)

    def test_drift_override_cannot_cover_a_manifest_source(self) -> None:
        self.primary_source.write_bytes(b"changed-referenced-source")
        self.authorization["postApprovalSourceDriftOverride"] = {
            "mode": "DESCRIBE_ONLY",
            "sourceId": "SRC-PRIMARY",
            "inventorySha256": self.inventory["sources"][0]["sha256"],
            "observedSha256": sha256(self.primary_source.read_bytes()),
            "reason": "This misuse must be rejected.",
            "manifestMutation": False,
        }
        self._write_authorization()

        plan = self._plan()

        self.assertFalse(plan["readyForSeparateExecutor"])
        codes = self._codes(plan, "errors")
        self.assertTrue(
            {"SOURCE_DRIFT_OVERRIDE_VALUE_INVALID", "SOURCE_DRIFT_OVERRIDE_SOURCE_FORBIDDEN"} & codes
        )
        self.assertIn("INVENTORY_SOURCE_HASH_DRIFT", codes)

    def test_exact_non_manifest_openapi_drift_can_only_be_described(self) -> None:
        self.openapi_source.write_bytes(b'{"openapi":"3.1.0","operations":83}\n')
        self.authorization["postApprovalSourceDriftOverride"] = {
            "mode": "DESCRIBE_ONLY",
            "sourceId": "SRC-BACKEND-OPENAPI",
            "inventorySha256": self.inventory["sources"][1]["sha256"],
            "observedSha256": sha256(self.openapi_source.read_bytes()),
            "reason": "OpenAPI changed after package approval and is not a manifest source.",
            "manifestMutation": False,
        }
        self._write_authorization()

        plan = self._plan()

        self.assertTrue(plan["readyForSeparateExecutor"], plan["errors"])
        overlay = plan["authorization"]["postApprovalSourceDriftOverride"]
        self.assertEqual(overlay["mode"], "DESCRIBE_ONLY")
        self.assertFalse(overlay["manifestMutationPerformed"])
        self.assertFalse(overlay["sourceMutationPerformed"])
        self.assertFalse(plan["writeProof"]["manifestMutationPerformed"])

    def test_unused_drift_override_is_rejected(self) -> None:
        self.authorization["postApprovalSourceDriftOverride"] = {
            "mode": "DESCRIBE_ONLY",
            "sourceId": "SRC-BACKEND-OPENAPI",
            "inventorySha256": self.inventory["sources"][1]["sha256"],
            "observedSha256": self.inventory["sources"][1]["sha256"],
            "reason": "There is no drift, therefore this must not be accepted.",
            "manifestMutation": False,
        }
        self._write_authorization()

        plan = self._plan()

        self.assertFalse(plan["readyForSeparateExecutor"])
        self.assertIn("SOURCE_DRIFT_OVERRIDE_UNUSED", self._codes(plan, "errors"))

    def test_stored_chunk_tamper_is_detected_even_when_report_hash_is_reapproved(self) -> None:
        report = json.loads(self.report_path.read_text(encoding="utf-8"))
        report["chunks"][0]["chunkKey"] = "f" * 64
        self.report_path.write_text(
            VALIDATOR.render_report(report),
            encoding="utf-8",
            newline="\n",
        )
        self.authorization["dryRunReportSha256"] = sha256(self.report_path.read_bytes())
        self._write_authorization()

        plan = self._plan()

        self.assertFalse(plan["readyForSeparateExecutor"])
        self.assertIn("DRY_RUN_CHUNK_TAMPER", self._codes(plan, "errors"))

    def test_baseline_chunk_key_collision_is_blocking(self) -> None:
        chunk = self.report["chunks"][0]
        document = self.report["documents"][0]
        self.baseline["chunks"] = [
            {
                "chunkKey": chunk["chunkKey"],
                "contentSha256": "0" * 64,
                "documentKey": document["documentKey"],
            }
        ]
        self._write_baseline()

        plan = self._plan()

        self.assertFalse(plan["readyForSeparateExecutor"])
        self.assertIn("BASELINE_CHUNK_KEY_COLLISION", self._codes(plan, "errors"))

    def test_sensitive_canonical_content_is_blocking(self) -> None:
        changed = self.canonical_text.replace(
            "Az auditĂˇlt folyamat determinisztikus.",
            "Kapcsolat: valaki@example.com",
        )
        self.canonical.write_text(changed, encoding="utf-8", newline="\n")

        plan = self._plan()

        self.assertFalse(plan["readyForSeparateExecutor"])
        self.assertIn("CANONICAL_EMAIL_DETECTED", self._codes(plan, "errors"))
        self.assertNotIn("valaki@example.com", PLANNER.render_plan(plan))


class DoorstarRagV11IngestPlannerTests(unittest.TestCase):
    """RAG 1.1 remains an exact, content-free preview pending v2 approval."""

    CLAIM_DISTRIBUTION = (17, 17, 16, 16, 16, 16)

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.repository = Path(self.temporary.name)
        (self.repository / ".git").mkdir()
        self.package = self.repository / "docs" / "projects" / "doorstar-nexus-rag"
        (self.package / "canonical").mkdir(parents=True)

        self.source = self.repository / "docs" / "source.md"
        self.source.parent.mkdir(parents=True, exist_ok=True)
        self.source.write_bytes(b"immutable-rag-v11-source")
        self.source_hash = sha256(self.source.read_bytes())
        self.unreferenced_handoff = (
            self.repository / "terminals" / "import-discovery" / "inbox" / "handoff.md"
        )
        self.unreferenced_handoff.parent.mkdir(parents=True)
        self.unreferenced_handoff.write_bytes(b"append-only-handoff-snapshot")
        self.unreferenced_openapi = (
            self.repository
            / "src"
            / "production-service"
            / "openapi"
            / "production-service.openapi.json"
        )
        self.unreferenced_openapi.parent.mkdir(parents=True)
        self.unreferenced_openapi.write_bytes(b'{"openapi":"3.1.0"}\n')
        self.expected_claim_ids: list[str] = []
        self.documents: list[dict[str, object]] = []
        for document_index, claim_count in enumerate(self.CLAIM_DISTRIBUTION, start=1):
            document_id = f"doorstar.v11-document-{document_index:02d}"
            canonical_relative = f"canonical/v11-document-{document_index:02d}.md"
            canonical = self.package / canonical_relative
            rows: list[str] = []
            for claim_index in range(1, claim_count + 1):
                claim_id = f"CLAIM-V11-{document_index:02d}-{claim_index:03d}"
                self.expected_claim_ids.append(claim_id)
                rows.append(
                    f"| {claim_id} | VERIFIED | V11_TEST_STATEMENT_{document_index:02d}_{claim_index:03d} | "
                    f"SRC-V11@sha256:{self.source_hash}#source:claim-{document_index:02d}-{claim_index:03d} |"
                )
            canonical_text = "\n".join(
                [
                    f"# Doorstar RAG 1.1 dokumentum {document_index:02d}",
                    "",
                    f"Ellenőrzött, személytelen dokumentum-áttekintés {document_index:02d}.",
                    "",
                    "## Auditált állítások",
                    "",
                    "| Claim ID | Status | Statement | Source citation |",
                    "| --- | --- | --- | --- |",
                    *rows,
                    "",
                ]
            )
            canonical.write_text(canonical_text, encoding="utf-8", newline="\n")
            self.documents.append(
                {
                    "id": document_id,
                    "title": f"Doorstar RAG 1.1 tesztdokumentum {document_index:02d}",
                    "version": "1.1.0",
                    "domain": "controlled-v11-test",
                    "tags": ["doorstar", "rag-1.1", "test"],
                    "canonicalFile": canonical_relative,
                    "canonicalSha256": sha256(canonical.read_bytes()),
                    "sources": [
                        {
                            "sourceId": "SRC-V11",
                            "relativePath": "docs/source.md",
                            "sourceHash": self.source_hash,
                        }
                    ],
                    "sourceInventoryRefs": ["SRC-V11"],
                    "reviewStatus": "READY_FOR_HUMAN_REVIEW",
                    "owner": "doorstar-root",
                    "sensitivity": "INTERNAL",
                    "validFrom": "2026-08-01",
                    "chunkingPolicy": dict(PLANNER.EXPECTED_V2_POLICY),
                }
            )

        self.inventory = {
            "schemaVersion": "doorstar-rag-source-inventory.v1",
            "inventoryId": "doorstar-ingest-v11-test-inventory",
            "inventoryVersion": "1.1.0",
            "snapshotDate": "2026-08-01",
            "targetIsland": "doorstar",
            "dryRunOnly": True,
            "ragIndexable": False,
            "mutationPolicy": {"nexus": "FORBIDDEN", "chromaDb": "FORBIDDEN"},
            "artifactSensitivity": "INTERNAL",
            "hashAlgorithm": "sha256",
            "pathBase": "repository-root",
            "pathFormat": "POSIX relative",
            "sourceCount": 3,
            "excludedSourceClasses": ["raw-binary"],
            "sources": [
                {
                    "sourceId": "SRC-V11",
                    "relativePath": "docs/source.md",
                    "fileType": "MD",
                    "sha256": self.source_hash,
                    "workflow": "CONTROLLED_V11_TEST",
                    "responsibleArea": "ROOT",
                    "sensitivity": "INTERNAL",
                    "containsPersonalData": False,
                    "containsCustomerData": False,
                    "containsOrderData": False,
                    "disposition": "PROCESS",
                    "rationale": "Immutable v1.1 planner test source.",
                },
                {
                    "sourceId": "SRC-UNREFERENCED-HANDOFF",
                    "relativePath": "terminals/import-discovery/inbox/handoff.md",
                    "fileType": "MD",
                    "sha256": sha256(self.unreferenced_handoff.read_bytes()),
                    "workflow": "APPEND_ONLY_HANDOFF",
                    "responsibleArea": "IMPORT_DISCOVERY",
                    "sensitivity": "INTERNAL",
                    "containsPersonalData": False,
                    "containsCustomerData": False,
                    "containsOrderData": True,
                    "disposition": "EXCLUDE",
                    "rationale": "Snapshot-only handoff is not canonical knowledge.",
                },
                {
                    "sourceId": "SRC-UNREFERENCED-OPENAPI",
                    "relativePath": "src/production-service/openapi/production-service.openapi.json",
                    "fileType": "JSON",
                    "sha256": sha256(self.unreferenced_openapi.read_bytes()),
                    "workflow": "API_CONTRACT",
                    "responsibleArea": "BACKEND",
                    "sensitivity": "INTERNAL",
                    "containsPersonalData": False,
                    "containsCustomerData": False,
                    "containsOrderData": False,
                    "disposition": "PROCESS",
                    "rationale": "Inventory-only API snapshot is not referenced by canonical knowledge.",
                },
            ],
        }
        self.manifest = {
            "schemaVersion": "doorstar-rag-manifest.v1",
            "packageId": "doorstar-controlled-ingest-v11-test",
            "packageVersion": "1.1.0",
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
            "documents": self.documents,
        }
        first_document_id = str(self.documents[0]["id"])
        first_claim_id = self.expected_claim_ids[0]
        self.evaluation = {
            "schemaVersion": "doorstar-rag-eval.v1",
            "packageId": self.manifest["packageId"],
            "targetIsland": "doorstar",
            "questions": [
                {
                    "id": f"EVAL-V11-{index:03d}",
                    "question": f"Melyik kontrollált RAG 1.1 állítás igazolt? ({index})",
                    "expectedDocumentIds": [first_document_id],
                    "expectedSourceIds": ["SRC-V11"],
                    "expectedClaimIds": [first_claim_id],
                }
                for index in range(1, 21)
            ],
        }
        self.manifest_path = self.package / "doorstar-rag-manifest.v1.1.json"
        self.inventory_path = self.package / "SOURCE_INVENTORY.json"
        self.eval_path = self.package / "RAG_EVAL_QUESTIONS.json"
        self.report_path = self.package / "DRY_RUN_REPORT.v1.1.0.json"
        self.baseline_path = self.package / "READ_ONLY_BASELINE.json"
        self._write_json(self.manifest_path, self.manifest)
        self._write_json(self.inventory_path, self.inventory)
        self._write_json(self.eval_path, self.evaluation)

        self.report = VALIDATOR.validate_package(self.manifest_path, self.inventory_path)
        self.assertTrue(self.report["ok"], self.report["errors"])
        self.assertEqual(self.report["summary"]["claimCount"], 98)
        self.assertEqual(self.report["summary"]["chunkCount"], 104)
        self.report_path.write_text(
            VALIDATOR.render_report(self.report),
            encoding="utf-8",
            newline="\n",
        )
        self.baseline = {
            "schemaVersion": PLANNER.BASELINE_SCHEMA,
            "targetIsland": "doorstar",
            "targetCollection": "doorstar-knowledge",
            "documents": [],
            "chunks": [],
        }
        self._write_json(self.baseline_path, self.baseline)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    @staticmethod
    def _write_json(path: Path, value: object) -> None:
        path.write_text(
            json.dumps(value, ensure_ascii=False, indent=2),
            encoding="utf-8",
            newline="\n",
        )

    @staticmethod
    def _codes(plan: dict[str, object], field: str) -> set[str]:
        return {item["code"] for item in plan[field]}

    def _plan(self, *, payload: bool = False) -> dict[str, object]:
        return PLANNER.build_ingest_plan(
            self.manifest_path,
            self.inventory_path,
            self.report_path,
            None,
            self.baseline_path,
            emit_payload_to_stdout=payload,
        )

    def _exact_v1_baseline(self) -> dict[str, object]:
        documents: list[dict[str, object]] = []
        chunks: list[dict[str, str]] = []
        for document_index, current_document in enumerate(self.documents, start=1):
            canonical_hash = sha256(f"v1-canonical-{document_index}".encode("utf-8"))
            document_key = sha256(
                "|".join(
                    [str(current_document["id"]), "1.0.0", canonical_hash, "v1"]
                ).encode("utf-8")
            )
            count = 7 if document_index < 6 else 6
            chunk_keys: list[str] = []
            for chunk_index in range(1, count + 1):
                content_hash = sha256(
                    f"v1-content-{document_index}-{chunk_index}".encode("utf-8")
                )
                chunk_key = sha256(f"chunk|{content_hash}".encode("utf-8"))
                chunk_keys.append(chunk_key)
                chunks.append(
                    {
                        "chunkKey": chunk_key,
                        "contentSha256": content_hash,
                        "documentKey": document_key,
                    }
                )
            documents.append(
                {
                    "documentKey": document_key,
                    "documentId": current_document["id"],
                    "documentVersion": "1.0.0",
                    "canonicalSha256": canonical_hash,
                    "chunkKeys": chunk_keys,
                }
            )
        return {
            "schemaVersion": PLANNER.BASELINE_SCHEMA,
            "targetIsland": "doorstar",
            "targetCollection": "doorstar-knowledge",
            "documents": documents,
            "chunks": chunks,
        }

    def test_v11_preview_has_104_exact_scalar_descriptors_and_no_content(self) -> None:
        first = self._plan()
        second = self._plan()

        self.assertEqual(first, second)
        self.assertEqual(PLANNER.render_plan(first), PLANNER.render_plan(second))
        self.assertEqual(first["status"], "HUMAN_APPROVAL_REQUIRED")
        self.assertFalse(first["readyForSeparateExecutor"])
        self.assertTrue(first["ok"], first["errors"])
        self.assertEqual(first["summary"]["chunkCount"], 104)
        self.assertEqual(len(first["chunks"]), 104)
        self.assertEqual(sum(item["metadata"]["chunkKind"] == "CLAIM" for item in first["chunks"]), 98)
        self.assertEqual(sum(item["metadata"]["chunkKind"] == "OVERVIEW" for item in first["chunks"]), 6)
        self.assertEqual({item["action"] for item in first["documents"]}, {"CREATE"})
        self.assertEqual({item["action"] for item in first["chunks"]}, {"CREATE"})
        self.assertEqual(first["replacement"]["mode"], "CREATE_ONLY")
        self.assertTrue(first["replacement"]["valid"])
        self.assertTrue(all(value is False for value in first["writeProof"].values()))
        self.assertIn("V2_EXECUTION_AUTHORIZATION_REQUIRED", self._codes(first, "blockers"))

        observed_claim_ids: list[str] = []
        report_by_key = {item["chunkKey"]: item for item in self.report["chunks"]}
        for descriptor in first["chunks"]:
            metadata = descriptor["metadata"]
            self.assertEqual(set(metadata), EXPECTED_METADATA_FIELDS | {"chunkKind", "claimIds"})
            self.assertTrue(
                all(isinstance(value, (str, int, float, bool)) for value in metadata.values())
            )
            claim_ids = json.loads(metadata["claimIds"])
            report_chunk = report_by_key[descriptor["chunkKey"]]
            self.assertEqual(metadata["chunkKind"], report_chunk["chunkKind"])
            self.assertEqual(claim_ids, report_chunk["claimIds"])
            if metadata["chunkKind"] == "CLAIM":
                self.assertEqual(len(claim_ids), 1)
                observed_claim_ids.extend(claim_ids)
            else:
                self.assertEqual(claim_ids, [])
        self.assertEqual(sorted(observed_claim_ids), sorted(self.expected_claim_ids))
        rendered = PLANNER.render_plan(first)
        self.assertNotIn("V11_TEST_STATEMENT", rendered)

    def test_unreferenced_inventory_drift_is_content_free_nonblocking_diagnostic(self) -> None:
        self.unreferenced_handoff.write_bytes(b"CHANGED_HANDOFF_PRIVATE_CONTENT")
        self.unreferenced_openapi.write_bytes(b'{"openapi":"3.1.0","changed":true}\n')

        plan = self._plan()

        self.assertTrue(plan["ok"], plan["errors"])
        self.assertEqual(plan["status"], "HUMAN_APPROVAL_REQUIRED")
        self.assertEqual(plan["summary"]["diagnosticCount"], 2)
        self.assertEqual(len(plan["diagnostics"]), 2)
        self.assertEqual(
            {item["sourceId"] for item in plan["diagnostics"]},
            {"SRC-UNREFERENCED-HANDOFF", "SRC-UNREFERENCED-OPENAPI"},
        )
        self.assertTrue(all(item["blocking"] is False for item in plan["diagnostics"]))
        self.assertTrue(
            all(
                len(item["inventorySha256"]) == 64 and len(item["observedSha256"]) == 64
                for item in plan["diagnostics"]
            )
        )
        rendered = PLANNER.render_plan(plan)
        self.assertNotIn("CHANGED_HANDOFF_PRIVATE_CONTENT", rendered)
        self.assertNotIn('"changed":true', rendered)

    def test_manifest_referenced_source_drift_remains_blocking_in_v11(self) -> None:
        self.source.write_bytes(b"CHANGED_REFERENCED_PRIVATE_CONTENT")

        plan = self._plan()

        self.assertFalse(plan["ok"])
        self.assertEqual(plan["status"], "BLOCKED")
        self.assertIn("INVENTORY_SOURCE_HASH_DRIFT", self._codes(plan, "errors"))
        self.assertEqual(plan["diagnostics"], [])
        self.assertNotIn("CHANGED_REFERENCED_PRIVATE_CONTENT", PLANNER.render_plan(plan))

    def test_v11_payload_flag_is_explicitly_withheld_without_v2_authorization(self) -> None:
        plan = self._plan(payload=True)

        self.assertEqual(plan["status"], "HUMAN_APPROVAL_REQUIRED")
        self.assertEqual(plan["payloads"], [])
        codes = self._codes(plan, "blockers")
        self.assertIn("V2_EXECUTION_AUTHORIZATION_REQUIRED", codes)
        self.assertIn("V2_PAYLOAD_CONTENT_WITHHELD", codes)
        self.assertIn("PAYLOAD_EMISSION_BLOCKED", codes)
        self.assertNotIn("V11_TEST_STATEMENT", PLANNER.render_plan(plan))

    def test_legacy_v1_authorization_cannot_unlock_v11(self) -> None:
        authorization_path = self.package / "EXECUTION_AUTHORIZATION.v1.json"
        self._write_json(
            authorization_path,
            {
                "schemaVersion": PLANNER.AUTHORIZATION_SCHEMA,
                "decision": "APPROVED",
                "packageHash": self.report["packageHash"],
                "dryRunReportSha256": sha256(self.report_path.read_bytes()),
                "manifestSha256": sha256(self.manifest_path.read_bytes()),
                "inventorySha256": sha256(self.inventory_path.read_bytes()),
                "evalSha256": sha256(self.eval_path.read_bytes()),
                "targetIsland": "doorstar",
                "targetCollection": "doorstar-knowledge",
                "approvedBy": "doorstar-owner:test",
                "approvedAt": "2026-08-01T12:00:00+02:00",
            },
        )

        plan = PLANNER.build_ingest_plan(
            self.manifest_path,
            self.inventory_path,
            self.report_path,
            authorization_path,
            self.baseline_path,
            emit_payload_to_stdout=True,
        )

        self.assertEqual(plan["status"], "HUMAN_APPROVAL_REQUIRED")
        self.assertFalse(plan["authorization"]["valid"])
        self.assertEqual(plan["payloads"], [])
        self.assertTrue(all(value is False for value in plan["writeProof"].values()))

    def test_v11_missing_baseline_is_blocked_beyond_human_approval(self) -> None:
        plan = PLANNER.build_ingest_plan(
            self.manifest_path,
            self.inventory_path,
            self.report_path,
            None,
            None,
        )

        self.assertEqual(plan["status"], "BLOCKED")
        self.assertIn("READ_ONLY_BASELINE_MISSING", self._codes(plan, "blockers"))
        self.assertFalse(plan["replacement"]["valid"])

    def test_exact_41_to_104_replacement_is_hash_scoped_and_create_only(self) -> None:
        self.baseline = self._exact_v1_baseline()
        self._write_json(self.baseline_path, self.baseline)

        plan = self._plan()

        self.assertTrue(plan["ok"], plan["errors"])
        self.assertEqual(plan["status"], "HUMAN_APPROVAL_REQUIRED")
        self.assertEqual({item["action"] for item in plan["documents"]}, {"CREATE"})
        self.assertEqual({item["action"] for item in plan["chunks"]}, {"CREATE"})
        replacement = plan["replacement"]
        self.assertEqual(replacement["mode"], "EXACT_V1_TO_V2_REPLACEMENT")
        self.assertTrue(replacement["valid"])
        self.assertFalse(replacement["broadDeleteAllowed"])
        self.assertFalse(replacement["deleteActionsEmitted"])
        expected_old_documents = sorted(item["documentKey"] for item in self.baseline["documents"])
        expected_old_chunks = sorted(item["chunkKey"] for item in self.baseline["chunks"])
        self.assertEqual(replacement["supersededDocuments"]["keys"], expected_old_documents)
        self.assertEqual(replacement["supersededChunks"]["keys"], expected_old_chunks)
        self.assertEqual(replacement["supersededDocuments"]["count"], 6)
        self.assertEqual(replacement["supersededChunks"]["count"], 41)
        self.assertEqual(replacement["createDocuments"]["count"], 6)
        self.assertEqual(replacement["createChunks"]["count"], 104)
        self.assertNotIn('"action": "DELETE"', PLANNER.render_plan(plan))

    def test_wrong_or_mixed_v1_replacement_baseline_fails_closed(self) -> None:
        mutations = {
            "wrong-version": lambda baseline: baseline["documents"][0].update(
                {"documentVersion": "0.9.0"}
            ),
            "orphan-chunk": lambda baseline: baseline["chunks"][0].update(
                {"documentKey": "f" * 64}
            ),
            "mixed-current-version": lambda baseline: baseline["documents"][0].update(
                {"documentVersion": "1.1.0"}
            ),
            "document-key-proof-mismatch": lambda baseline: baseline["documents"][0].update(
                {"canonicalSha256": "e" * 64}
            ),
            "chunk-key-proof-mismatch": lambda baseline: baseline["chunks"][0].update(
                {"contentSha256": "d" * 64}
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                self.baseline = self._exact_v1_baseline()
                mutate(self.baseline)
                self._write_json(self.baseline_path, self.baseline)

                plan = self._plan()

                self.assertFalse(plan["ok"])
                self.assertEqual(plan["status"], "BLOCKED")
                self.assertTrue(
                    {
                        "V2_REPLACEMENT_BASELINE_INVALID",
                        "BASELINE_DOCUMENT_VERSION_DRIFT",
                    }
                    & self._codes(plan, "errors")
                )
                self.assertFalse(plan["replacement"]["valid"])
                self.assertEqual(plan["replacement"]["supersededChunks"]["count"], 0)
                self.assertNotIn('"action": "DELETE"', PLANNER.render_plan(plan))

    def test_versioned_report_name_must_use_full_semver(self) -> None:
        invalid_report = self.package / "DRY_RUN_REPORT.v1.1.json"
        invalid_report.write_bytes(self.report_path.read_bytes())

        plan = PLANNER.build_ingest_plan(
            self.manifest_path,
            self.inventory_path,
            invalid_report,
            None,
            self.baseline_path,
        )

        self.assertFalse(plan["ok"])
        self.assertIn("DRY_RUN_REPORT_PATH_INVALID", self._codes(plan, "errors"))

    def test_v11_report_filename_and_embedded_version_are_exactly_bound(self) -> None:
        wrong_name = self.package / "DRY_RUN_REPORT.v9.9.9.json"
        wrong_name.write_bytes(self.report_path.read_bytes())
        wrong_name_plan = PLANNER.build_ingest_plan(
            self.manifest_path,
            self.inventory_path,
            wrong_name,
            None,
            self.baseline_path,
        )
        self.assertFalse(wrong_name_plan["ok"])
        self.assertIn(
            "V2_DRY_RUN_REPORT_VERSION_MISMATCH",
            self._codes(wrong_name_plan, "errors"),
        )

        stored_report = json.loads(self.report_path.read_text(encoding="utf-8"))
        stored_report["packageVersion"] = "9.9.9"
        self.report_path.write_text(
            VALIDATOR.render_report(stored_report),
            encoding="utf-8",
            newline="\n",
        )
        embedded_version_plan = self._plan()
        self.assertFalse(embedded_version_plan["ok"])
        self.assertEqual(embedded_version_plan["status"], "BLOCKED")
        self.assertIn("V2_PACKAGE_VERSION_MISMATCH", self._codes(embedded_version_plan, "errors"))


if __name__ == "__main__":
    unittest.main()
