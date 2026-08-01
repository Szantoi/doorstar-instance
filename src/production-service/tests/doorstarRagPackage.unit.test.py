"""Unit checks for the offline Doorstar Nexus RAG dry-run validator."""

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "prepareDoorstarNexusRag.py"
REPOSITORY = SCRIPT.parent.parent
RAG_PACKAGE = REPOSITORY / "docs" / "projects" / "doorstar-nexus-rag"
V1_REPORT_FIXTURE_SHA256 = "58d69eec867e8812d9f645b30940d3f4a952320780a0cecfc05b26f83718797b"
V2_POLICY = {
    "strategy": "markdown_claim_rows",
    "policyVersion": "v2",
    "maxChars": 1600,
    "overlapChars": 0,
    "headingDepth": 3,
    "claimRowsPerChunk": 1,
    "includeDocumentOverview": True,
}
SPEC = importlib.util.spec_from_file_location("doorstar_rag_dry_run", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


class DoorstarRagPackageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.package = Path(self.temporary.name)
        (self.package / ".git").mkdir()
        (self.package / "canonical").mkdir()
        self.source_file = self.package / "docs" / "projects" / "doorstar-order-data-chain" / "IMPORT_MAPPING.md"
        self.source_file.parent.mkdir(parents=True)
        self.source_file.write_bytes(b"immutable-source-evidence")
        self.source_hash = sha256(self.source_file.read_bytes())
        self.canonical = self.package / "canonical" / "order-process.md"
        self.canonical_text = (
            "# Rendelési folyamat\n\n"
            "A táblázat auditálható tudásállításokat tartalmaz.\n\n"
            "| Claim ID | Status | Statement | Source citation |\n"
            "| --- | --- | --- | --- |\n"
            "| CLAIM-001 | VERIFIED | A felmérés véglegesíti a műszaki adatokat. | "
            f"SRC-001@sha256:{self.source_hash}#IMPORT_MAPPING:rule-2 |\n"
        )
        self.canonical.write_text(self.canonical_text, encoding="utf-8", newline="\n")
        self.inventory = {
            "schemaVersion": "doorstar-rag-source-inventory.v1",
            "inventoryId": "doorstar-nexus-rag-source-inventory",
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
            "sourceCount": 1,
            "excludedSourceClasses": ["raw-binary"],
            "sources": [
                {
                    "sourceId": "SRC-001",
                    "relativePath": "docs/projects/doorstar-order-data-chain/IMPORT_MAPPING.md",
                    "fileType": "MD",
                    "sha256": self.source_hash,
                    "workflow": "order-intake",
                    "responsibleArea": "sales-and-survey",
                    "sensitivity": "INTERNAL",
                    "containsPersonalData": False,
                    "containsCustomerData": False,
                    "containsOrderData": False,
                    "disposition": "PROCESS",
                    "rationale": "Stable source for the unit-test claim.",
                }
            ],
        }
        self.document = {
            "id": "doorstar.order-process",
            "title": "Doorstar rendelési folyamat",
            "version": "1.0.0",
            "domain": "order-production-process",
            "tags": ["doorstar", "rendelés", "felmérés"],
            "canonicalFile": "canonical/order-process.md",
            "canonicalSha256": sha256(self.canonical.read_bytes()),
            "sources": [
                {
                    "sourceId": "SRC-001",
                    "relativePath": "docs/projects/doorstar-order-data-chain/IMPORT_MAPPING.md",
                    "sourceHash": self.source_hash,
                }
            ],
            "sourceInventoryRefs": ["SRC-001"],
            "reviewStatus": "READY_FOR_HUMAN_REVIEW",
            "owner": "doorstar-root",
            "sensitivity": "INTERNAL",
            "validFrom": "2026-07-31",
            "chunkingPolicy": {
                "strategy": "markdown_heading_paragraph",
                "policyVersion": "v1",
                "maxChars": 1600,
                "overlapChars": 0,
                "headingDepth": 3,
            },
        }
        self.manifest = {
            "schemaVersion": "doorstar-rag-manifest.v1",
            "packageId": "doorstar-canonical-knowledge",
            "packageVersion": "2026-07-31.1",
            "targetIsland": "doorstar",
            "mode": "dry-run",
            "nexusWrite": False,
            "chromaWrite": False,
            "sourceInventoryFile": "SOURCE_INVENTORY.json",
            "evalFile": "EVAL_QUESTIONS.json",
            "idempotency": {
                "documentKeyAlgorithm": "sha256(id|version|canonicalSha256|policyVersion)",
                "duplicatePolicy": "reject",
                "baselineDocuments": [],
            },
            "documents": [self.document],
        }
        self.eval = {
            "schemaVersion": "doorstar-rag-eval.v1",
            "packageId": "doorstar-canonical-knowledge",
            "targetIsland": "doorstar",
            "questions": [
                {
                    "id": f"EVAL-{index:03d}",
                    "question": f"Mi igazolja a felmérés authority-jét? ({index})",
                    "expectedDocumentIds": ["doorstar.order-process"],
                    "expectedSourceIds": ["SRC-001"],
                    "expectedClaimIds": ["CLAIM-001"],
                }
                for index in range(1, 21)
            ],
        }
        self.inventory_path = self.package / "SOURCE_INVENTORY.json"
        self.manifest_path = self.package / "doorstar-rag-manifest.v1.json"
        self.eval_path = self.package / "EVAL_QUESTIONS.json"
        self._write_inputs()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _write_inputs(self) -> None:
        self.inventory_path.write_text(
            json.dumps(self.inventory, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
        )
        self.manifest_path.write_text(
            json.dumps(self.manifest, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
        )
        self.eval_path.write_text(
            json.dumps(self.eval, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
        )

    def _enable_v2_policy(self) -> None:
        self.canonical_text = self.canonical_text.replace(
            "| Claim ID | Status | Statement | Source citation |",
            "## Claims\n\n| Claim ID | Status | Statement | Source citation |",
        )
        self.canonical.write_text(self.canonical_text, encoding="utf-8", newline="\n")
        self.document["canonicalSha256"] = sha256(self.canonical.read_bytes())
        self.document["chunkingPolicy"] = copy.deepcopy(V2_POLICY)
        self._write_inputs()

    def _prepare_current_corpus_v2(self, destination: Path) -> tuple[Path, Path]:
        """Copy only the canonical package text and repin mutable source hashes."""

        destination.mkdir()
        shutil.copytree(RAG_PACKAGE / "canonical", destination / "canonical")
        inventory = json.loads((RAG_PACKAGE / "SOURCE_INVENTORY.json").read_text(encoding="utf-8"))
        manifest = json.loads((RAG_PACKAGE / "doorstar-rag-manifest.v1.json").read_text(encoding="utf-8"))
        shutil.copy2(RAG_PACKAGE / manifest["evalFile"], destination / manifest["evalFile"])

        source_hashes: dict[str, str] = {}
        for source in inventory["sources"]:
            current_hash = sha256((REPOSITORY / source["relativePath"]).read_bytes())
            source["sha256"] = current_hash
            source_hashes[source["sourceId"]] = current_hash

        for document in manifest["documents"]:
            canonical_path = destination / document["canonicalFile"]
            canonical_text = canonical_path.read_text(encoding="utf-8")
            for source in document["sources"]:
                source_id = source["sourceId"]
                current_hash = source_hashes[source_id]
                source["sourceHash"] = current_hash
                canonical_text = re.sub(
                    rf"({re.escape(source_id)}@sha256:)[0-9a-fA-F]{{64}}",
                    rf"\g<1>{current_hash}",
                    canonical_text,
                )
            canonical_path.write_text(canonical_text, encoding="utf-8", newline="\n")
            document["canonicalSha256"] = sha256(canonical_path.read_bytes())
            document["chunkingPolicy"] = copy.deepcopy(V2_POLICY)

        inventory_path = destination / "SOURCE_INVENTORY.json"
        manifest_path = destination / "doorstar-rag-manifest.v1.json"
        inventory_path.write_text(
            json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
        )
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
        )
        return manifest_path, inventory_path

    def _validate(self) -> dict[str, object]:
        return MODULE.validate_package(self.manifest_path, self.inventory_path)

    def _error_codes(self, report: dict[str, object]) -> set[str]:
        return {error["code"] for error in report["errors"]}

    def test_happy_path_is_deterministic_and_contains_no_source_content(self) -> None:
        first = self._validate()
        second = self._validate()

        self.assertTrue(first["ok"], first["errors"])
        self.assertEqual(first, second)
        self.assertEqual(MODULE.render_report(first), MODULE.render_report(second))
        self.assertEqual(first["summary"]["documentCount"], 1)
        self.assertEqual(first["summary"]["evalQuestionCount"], 20)
        self.assertGreater(first["summary"]["chunkCount"], 0)
        self.assertEqual(first["documents"][0]["plannedAction"], "CREATE")
        self.assertFalse(first["dryRunProof"]["nexusWritePerformed"])
        self.assertFalse(first["dryRunProof"]["chromaWritePerformed"])
        self.assertFalse(first["dryRunProof"]["networkCallsPerformed"])
        self.assertNotIn("A felmérés véglegesíti", MODULE.render_report(first))
        self.assertNotIn("Rendelési folyamat", MODULE.render_report(first))

        expected_key = sha256(
            (
                "doorstar.order-process|1.0.0|"
                f"{self.document['canonicalSha256']}|v1"
            ).encode("utf-8")
        )
        self.assertEqual(first["documents"][0]["documentKey"], expected_key)

    def test_v1_rendered_report_byte_contract_is_unchanged(self) -> None:
        report = self._validate()
        rendered = MODULE.render_report(report).encode("utf-8")
        reconstructed = MODULE.build_chunks(
            self.canonical_text,
            self.document["id"],
            self.document["version"],
            self.document["chunkingPolicy"],
            include_content=True,
        )
        content_free_projection = [
            {
                key: value
                for key, value in chunk.items()
                if key not in {"content", "section", "chunkKind", "claimIds"}
            }
            for chunk in reconstructed
        ]

        self.assertEqual(sha256(rendered), V1_REPORT_FIXTURE_SHA256)
        self.assertEqual(content_free_projection, report["chunks"])
        self.assertTrue(all(chunk["chunkKind"] == "PARAGRAPH" for chunk in reconstructed))
        self.assertTrue(all(chunk["claimIds"] == [] and chunk["section"] for chunk in reconstructed))

    def test_v2_single_document_is_deterministic_and_content_free_in_report(self) -> None:
        self._enable_v2_policy()

        first = self._validate()
        second = self._validate()

        self.assertTrue(first["ok"], first["errors"])
        self.assertEqual(first, second)
        self.assertEqual(first["summary"]["claimCount"], 1)
        self.assertEqual(first["summary"]["chunkCount"], 2)
        chunks_by_kind = {chunk["chunkKind"]: chunk for chunk in first["chunks"]}
        self.assertEqual(set(chunks_by_kind), {"CLAIM", "OVERVIEW"})
        self.assertEqual(chunks_by_kind["CLAIM"]["claimIds"], ["CLAIM-001"])
        self.assertEqual(chunks_by_kind["OVERVIEW"]["claimIds"], [])
        self.assertTrue(all("content" not in chunk and "section" not in chunk for chunk in first["chunks"]))
        claim_statement = MODULE._split_table_row(
            next(line for line in self.canonical_text.splitlines() if line.startswith("| CLAIM-001 "))
        )[2]
        self.assertNotIn(claim_statement, MODULE.render_report(first))

        reconstructed = MODULE.build_chunks(
            self.canonical_text,
            self.document["id"],
            self.document["version"],
            self.document["chunkingPolicy"],
            include_content=True,
        )
        reconstructed_again = MODULE.build_chunks(
            self.canonical_text,
            self.document["id"],
            self.document["version"],
            self.document["chunkingPolicy"],
            include_content=True,
        )
        self.assertEqual(reconstructed, reconstructed_again)
        claim_chunk = next(chunk for chunk in reconstructed if chunk["chunkKind"] == "CLAIM")
        overview_chunk = next(chunk for chunk in reconstructed if chunk["chunkKind"] == "OVERVIEW")
        _, claim_rows, _ = MODULE._extract_v2_claim_rows(self.canonical_text, 3)
        claim_row = claim_rows[0]
        self.assertIn(MODULE._normalise_text(claim_row["rawRow"]), claim_chunk["content"])
        self.assertIn(MODULE._normalise_text(claim_row["tableHeader"]), claim_chunk["content"])
        self.assertIn("# Rendel", claim_chunk["content"])
        self.assertIn("## Claims", claim_chunk["content"])
        self.assertNotIn(MODULE._normalise_text(claim_row["rawRow"]), overview_chunk["content"])
        self.assertEqual(claim_chunk["section"], claim_row["sectionIdentity"])

    def test_current_six_document_corpus_has_98_intact_unique_v2_claims_and_104_chunks(self) -> None:
        projects_root = REPOSITORY / "docs" / "projects"
        with tempfile.TemporaryDirectory(dir=projects_root) as temporary:
            package = Path(temporary) / "v2-package"
            manifest_path, inventory_path = self._prepare_current_corpus_v2(package)

            first = MODULE.validate_package(manifest_path, inventory_path)
            second = MODULE.validate_package(manifest_path, inventory_path)

            self.assertTrue(first["ok"], first["errors"])
            self.assertEqual(first, second)
            self.assertEqual(first["summary"]["documentCount"], 6)
            self.assertEqual(first["summary"]["claimCount"], 98)
            self.assertEqual(first["summary"]["chunkCount"], 104)
            claim_chunks = [chunk for chunk in first["chunks"] if chunk["chunkKind"] == "CLAIM"]
            overview_chunks = [chunk for chunk in first["chunks"] if chunk["chunkKind"] == "OVERVIEW"]
            exact_claim_ids = [chunk["claimIds"][0] for chunk in claim_chunks]
            self.assertEqual(len(claim_chunks), 98)
            self.assertEqual(len(exact_claim_ids), len(set(exact_claim_ids)))
            self.assertEqual(len(overview_chunks), 6)
            self.assertTrue(all(chunk["claimIds"] == [] for chunk in overview_chunks))
            self.assertTrue(all("content" not in chunk and "section" not in chunk for chunk in first["chunks"]))

            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            reconstructed_count = 0
            for document in manifest["documents"]:
                canonical_text = (package / document["canonicalFile"]).read_text(encoding="utf-8")
                reconstructed = MODULE.build_chunks(
                    canonical_text,
                    document["id"],
                    document["version"],
                    document["chunkingPolicy"],
                    include_content=True,
                )
                self.assertEqual(
                    reconstructed,
                    MODULE.build_chunks(
                        canonical_text,
                        document["id"],
                        document["version"],
                        document["chunkingPolicy"],
                        include_content=True,
                    ),
                )
                reconstructed_count += len(reconstructed)
                title, claim_rows, _ = MODULE._extract_v2_claim_rows(canonical_text, 3)
                claims_by_id = {
                    chunk["claimIds"][0]: chunk
                    for chunk in reconstructed
                    if chunk["chunkKind"] == "CLAIM"
                }
                document_overviews = [
                    chunk for chunk in reconstructed if chunk["chunkKind"] == "OVERVIEW"
                ]
                self.assertEqual(len(claims_by_id), len(claim_rows))
                self.assertEqual(len(document_overviews), 1)
                for claim_row in claim_rows:
                    chunk = claims_by_id[claim_row["claimId"]]
                    normalised_row = MODULE._normalise_text(claim_row["rawRow"])
                    self.assertIn(title, chunk["content"])
                    self.assertIn(MODULE._normalise_text(claim_row["tableHeader"]), chunk["content"])
                    self.assertTrue(claim_row["sectionHeadings"])
                    for heading in claim_row["sectionHeadings"]:
                        self.assertIn(heading, chunk["content"])
                    self.assertIn(normalised_row, chunk["content"])
                    self.assertNotIn(normalised_row, document_overviews[0]["content"])
            self.assertEqual(reconstructed_count, 104)

    def test_v2_rejects_an_overlong_claim_without_splitting_its_row(self) -> None:
        self._enable_v2_policy()
        long_statement = "x" * 1700
        cells = self.canonical_text.splitlines()
        for index, line in enumerate(cells):
            if line.startswith("| CLAIM-001 "):
                row = line.split("|")
                row[3] = f" {long_statement} "
                cells[index] = "|".join(row)
                break
        self.canonical_text = "\n".join(cells) + "\n"
        self.canonical.write_text(self.canonical_text, encoding="utf-8", newline="\n")
        self.document["canonicalSha256"] = sha256(self.canonical.read_bytes())
        self._write_inputs()

        report = self._validate()

        self.assertFalse(report["ok"])
        self.assertIn("V2_CLAIM_CHUNK_TOO_LARGE", self._error_codes(report))
        claim_chunks = [chunk for chunk in report["chunks"] if chunk["chunkKind"] == "CLAIM"]
        self.assertEqual(len(claim_chunks), 1)
        self.assertEqual(claim_chunks[0]["claimIds"], ["CLAIM-001"])
        self.assertGreater(claim_chunks[0]["charCount"], 1600)
        reconstructed = MODULE.build_chunks(
            self.canonical_text,
            self.document["id"],
            self.document["version"],
            self.document["chunkingPolicy"],
            include_content=True,
        )
        claim_content = next(chunk["content"] for chunk in reconstructed if chunk["chunkKind"] == "CLAIM")
        self.assertIn(long_statement, claim_content)

    def test_rejects_non_doorstar_target_island(self) -> None:
        self.manifest["targetIsland"] = "public"
        self._write_inputs()

        report = self._validate()

        self.assertFalse(report["ok"])
        self.assertIn("TARGET_ISLAND_INVALID", self._error_codes(report))

    def test_rejects_duplicate_id_and_version(self) -> None:
        self.manifest["documents"].append(copy.deepcopy(self.document))
        self._write_inputs()

        report = self._validate()

        self.assertFalse(report["ok"])
        self.assertIn("DUPLICATE_DOCUMENT", self._error_codes(report))

    def test_detects_current_canonical_hash_drift(self) -> None:
        self.manifest["documents"][0]["canonicalSha256"] = "0" * 64
        self._write_inputs()

        report = self._validate()

        self.assertFalse(report["ok"])
        self.assertIn("CANONICAL_HASH_DRIFT", self._error_codes(report))

    def test_blocks_personal_data_in_canonical_markdown(self) -> None:
        changed = self.canonical_text.replace(
            "A táblázat auditálható tudásállításokat tartalmaz.",
            "Kapcsolat: valaki@example.com",
        )
        self.canonical.write_text(changed, encoding="utf-8", newline="\n")
        self.manifest["documents"][0]["canonicalSha256"] = sha256(self.canonical.read_bytes())
        self._write_inputs()

        report = self._validate()

        self.assertFalse(report["ok"])
        self.assertIn("CANONICAL_EMAIL_DETECTED", self._error_codes(report))

    def test_requires_full_source_citation_on_every_claim_row(self) -> None:
        changed = re_sub_citation(self.canonical_text, "-")
        self.canonical.write_text(changed, encoding="utf-8", newline="\n")
        self.manifest["documents"][0]["canonicalSha256"] = sha256(self.canonical.read_bytes())
        self._write_inputs()

        report = self._validate()

        self.assertFalse(report["ok"])
        self.assertIn("CLAIM_SOURCE_CITATION_MISSING", self._error_codes(report))

    def test_rejects_ambiguous_document_key_tokens(self) -> None:
        self.manifest["documents"][0]["id"] = "doorstar|ambiguous"
        self._write_inputs()

        report = self._validate()

        self.assertFalse(report["ok"])
        self.assertIn("DOCUMENT_ID_INVALID", self._error_codes(report))

    def test_verifies_current_inventory_source_hash(self) -> None:
        self.source_file.write_bytes(b"source-hash-drift")

        report = self._validate()

        self.assertFalse(report["ok"])
        self.assertIn("INVENTORY_SOURCE_HASH_DRIFT", self._error_codes(report))

    def test_duplicate_json_key_is_rejected_before_package_validation(self) -> None:
        raw = self.eval_path.read_text(encoding="utf-8")
        raw = raw.replace(
            '"targetIsland": "doorstar"',
            '"targetIsland": "doorstar",\n  "targetIsland": "other"',
            1,
        )
        self.eval_path.write_text(raw, encoding="utf-8")

        report = self._validate()

        self.assertFalse(report["ok"])
        self.assertIn("DUPLICATE_JSON_KEY", self._error_codes(report))

    def test_v2_unreferenced_inventory_snapshot_drift_warns_but_referenced_drift_blocks(self) -> None:
        unreferenced_file = self.package / "docs" / "unreferenced.md"
        unreferenced_file.write_bytes(b"inventory-snapshot")
        self.inventory["sources"].append({
            **copy.deepcopy(self.inventory["sources"][0]),
            "sourceId": "SRC-UNREFERENCED",
            "relativePath": "docs/unreferenced.md",
            "sha256": sha256(unreferenced_file.read_bytes()),
            "rationale": "Unreferenced inventory-only snapshot for drift policy coverage.",
        })
        self.inventory["sourceCount"] = 2
        self._enable_v2_policy()
        unreferenced_file.write_bytes(b"changed-after-snapshot")

        warning_report = self._validate()

        self.assertTrue(warning_report["ok"], warning_report["errors"])
        self.assertEqual(
            {warning["code"] for warning in warning_report["warnings"]},
            {"INVENTORY_UNREFERENCED_SOURCE_DRIFT"},
        )

        self.source_file.write_bytes(b"referenced-source-drift")
        blocking_report = self._validate()
        self.assertFalse(blocking_report["ok"])
        self.assertIn("INVENTORY_SOURCE_HASH_DRIFT", self._error_codes(blocking_report))

    def test_sensitive_source_cannot_be_classified_process(self) -> None:
        self.inventory["sources"][0]["containsOrderData"] = True
        self._write_inputs()

        report = self._validate()

        self.assertFalse(report["ok"])
        self.assertIn("INVENTORY_SENSITIVE_SOURCE_PROCESS_FORBIDDEN", self._error_codes(report))

    def test_output_cannot_overwrite_eval_or_other_package_inputs(self) -> None:
        original_eval = self.eval_path.read_bytes()

        with self.assertRaisesRegex(ValueError, "package-local DRY_RUN_REPORT"):
            MODULE.validate_package(self.manifest_path, self.inventory_path, self.eval_path)

        self.assertEqual(self.eval_path.read_bytes(), original_eval)

    def test_accepts_only_legacy_or_safe_semver_report_names_in_package_root(self) -> None:
        versioned_report = self.package / "DRY_RUN_REPORT.v2.0.0.json"

        report = MODULE.validate_package(self.manifest_path, self.inventory_path, versioned_report)

        self.assertTrue(report["ok"], report["errors"])
        self.assertEqual(versioned_report.read_text(encoding="utf-8"), MODULE.render_report(report))
        unsafe_directory = self.package / "reports"
        unsafe_directory.mkdir()
        for unsafe in (
            self.package / "DRY_RUN_REPORT.v2.json",
            self.package / "DRY_RUN_REPORT.v2.0.0.json.bak",
            unsafe_directory / "DRY_RUN_REPORT.v2.0.0.json",
        ):
            with self.assertRaisesRegex(ValueError, "DRY_RUN_REPORT.v<semver>"):
                MODULE.validate_package(self.manifest_path, self.inventory_path, unsafe)

    def test_report_hardlink_cannot_alias_an_input(self) -> None:
        report_path = self.package / "DRY_RUN_REPORT.json"
        original_eval = self.eval_path.read_bytes()
        os.link(self.eval_path, report_path)

        with self.assertRaisesRegex(ValueError, "must not alias"):
            MODULE.validate_package(self.manifest_path, self.inventory_path, report_path)

        self.assertEqual(self.eval_path.read_bytes(), original_eval)

    def test_eval_source_must_belong_to_expected_document_and_not_be_excluded(self) -> None:
        unused_source = copy.deepcopy(self.inventory["sources"][0])
        unused_source["sourceId"] = "SRC-UNUSED"
        unused_source["disposition"] = "EXCLUDE"
        unused_source["rationale"] = "Excluded source used to exercise eval-source policy."
        self.inventory["sources"].append(unused_source)
        self.inventory["sourceCount"] = 2
        self.eval["questions"][0]["expectedSourceIds"] = ["SRC-UNUSED"]
        self._write_inputs()

        report = self._validate()

        self.assertFalse(report["ok"])
        self.assertIn("EVAL_SOURCE_EXCLUDED", self._error_codes(report))
        self.assertIn("EVAL_SOURCE_NOT_DECLARED_BY_DOCUMENT", self._error_codes(report))

    def test_optional_expected_document_mode_accepts_all_or_any_and_rejects_other_values(self) -> None:
        for mode in ("ALL", "ANY"):
            with self.subTest(mode=mode):
                self.eval["questions"][0]["expectedDocumentMode"] = mode
                self._write_inputs()
                report = self._validate()
                self.assertTrue(report["ok"], report["errors"])

        self.eval["questions"][0]["expectedDocumentMode"] = "FIRST"
        self._write_inputs()

        report = self._validate()

        self.assertFalse(report["ok"])
        self.assertIn("EVAL_EXPECTED_DOCUMENT_MODE_INVALID", self._error_codes(report))


def re_sub_citation(text: str, replacement: str) -> str:
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if line.startswith("| CLAIM-001 "):
            cells = line.split("|")
            cells[-2] = f" {replacement} "
            lines[index] = "|".join(cells)
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    unittest.main()
