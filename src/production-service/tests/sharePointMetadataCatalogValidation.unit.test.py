"""Unit checks for the SharePoint metadata catalog validator."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))


def load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SIMULATOR = load("simulateSharePointMetadataCatalog")
VALIDATOR = load("validateSharePointMetadataCatalog")


class SharePointMetadataCatalogValidationTests(unittest.TestCase):
    def fixture(self):
        fingerprint = "a" * 64
        metadata = {
            "profile": "sharepoint-iqy-metadata-preview/v3",
            "mappingRuleset": "sharepoint-iqy-work-number-mapping/2026-07-30.2",
            "mode": "preview",
            "databaseWrite": False,
            "macroExecution": False,
            "sourceContainsVba": False,
            "sourceWorkbookSha256": fingerprint,
            "summary": {
                "sourceDataRowCount": 2,
                "accountedSourceRowCount": 2,
                "sourceRowAccountingMatches": True,
                "metadataRecordCount": 1,
                "folderMetadataRecordCount": 1,
                "folderMetadataExcludedFromDocumentCount": 1,
                "potentialImportDocumentCount": 1,
                "workNumberCandidateCount": 1,
                "filenamePathWorkNumberConflictCount": 0,
                "multipleWorkNumberCandidateCount": 0,
                "pathFallbackWorkNumberCount": 0,
                "candidateProjectPackageCount": 1,
                "potentialImportProjectLinkCandidateCount": 1,
                "potentialImportProjectLinkConflictCount": 0,
                "potentialImportPathFallbackCount": 0,
                "potentialImportUnresolvedCount": 0,
                "extensions": {".pdf": 1},
                "sourceExcelDateSystem": "1900",
                "blankFilenameRowCount": 0,
                "excludedByExtension": {},
            },
            "folders": [{
                "sourceRelativePath": "sites/Gyartas/26107",
                "sourceLastModifiedAt": "2026-07-29T12:00:00",
                "sourceLastModifiedTimezone": "UNKNOWN_EXPORT_TIMEZONE",
                "folderName": "26107",
                "parentRelativePath": "sites/Gyartas",
            }],
            "records": [{
                "sourceRelativePath": "sites/Gyartas/26107/DSMR 26107.pdf",
                "filename": "DSMR 26107.pdf",
                "extension": ".pdf",
                "relevance": "POTENTIAL_IMPORT_DOCUMENT",
                "workNumberCandidate": "26107",
                "filenameWorkNumberCandidate": "26107",
                "pathWorkNumberCandidate": "26107",
                "filenameWorkNumberCandidates": ["26107"],
                "pathWorkNumberCandidates": ["26107"],
                "workNumberResolution": "FILENAME",
                "projectPackageWorkNumberCandidate": "26107",
                "projectPackageEvidence": "FILENAME_DSMR",
                "sourceLastModifiedTimezone": "UNKNOWN_EXPORT_TIMEZONE",
            }],
        }
        return metadata, SIMULATOR.simulate(metadata)

    def test_accepts_a_reconciled_snapshot(self) -> None:
        metadata, catalog = self.fixture()
        result = VALIDATOR.validate(metadata, catalog)
        self.assertTrue(result["valid"])
        self.assertEqual(result["summary"]["errorCount"], 0)

    def test_rejects_summary_and_path_drift(self) -> None:
        metadata, catalog = self.fixture()
        catalog["summary"]["folderCount"] = 999
        catalog["documents"][0]["relativePath"] = r"C:\unsafe.pdf"
        result = VALIDATOR.validate(metadata, catalog)
        self.assertFalse(result["valid"])
        self.assertEqual(
            {item["code"] for item in result["errors"]},
            {
                "CATALOG_PAYLOAD_MISMATCH",
                "CATALOG_SUMMARY_MISMATCH",
                "UNSAFE_RELATIVE_PATH",
            },
        )

    def test_rejects_semantic_catalog_mutation(self) -> None:
        metadata, catalog = self.fixture()
        catalog["documents"][0]["filename"] = "tampered.pdf"
        result = VALIDATOR.validate(metadata, catalog)
        self.assertFalse(result["valid"])
        self.assertIn(
            "CATALOG_PAYLOAD_MISMATCH",
            {item["code"] for item in result["errors"]},
        )


if __name__ == "__main__":
    unittest.main()
