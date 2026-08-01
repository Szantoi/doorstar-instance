"""Unit checks for the no-write SharePoint metadata folder simulation."""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "simulateSharePointMetadataCatalog.py"
sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location("sharepoint_catalog_simulation", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SharePointMetadataCatalogSimulationTests(unittest.TestCase):
    def payload(self, folders=None, records=None):
        folders = folders or []
        records = records or []
        normalized_folders = []
        for item in folders:
            path = item["sourceRelativePath"].replace("\\", "/")
            normalized_folders.append({
                "folderName": path.split("/")[-1],
                "parentRelativePath": "/".join(path.split("/")[:-1]) or None,
                "sourceLastModifiedTimezone": "UNKNOWN_EXPORT_TIMEZONE",
                **item,
            })
        normalized_records = []
        for item in records:
            if not isinstance(item, dict):
                normalized_records.append(item)
                continue
            filename = item.get("filename") or item["sourceRelativePath"].replace("\\", "/").split("/")[-1]
            extension = Path(filename).suffix.lower() or None
            relative_path = item["sourceRelativePath"].replace("\\", "/").strip("/")
            parent_path = "/".join(relative_path.split("/")[:-1])
            mapping = MODULE.derive_document_mapping(filename, parent_path)
            normalized = {
                "filename": filename,
                "extension": extension,
                **mapping,
                "sourceLastModifiedTimezone": "UNKNOWN_EXPORT_TIMEZONE",
                **item,
            }
            if "filenameWorkNumberCandidates" not in item and normalized["filenameWorkNumberCandidate"]:
                normalized["filenameWorkNumberCandidates"] = [normalized["filenameWorkNumberCandidate"]]
            if "pathWorkNumberCandidates" not in item and normalized["pathWorkNumberCandidate"]:
                normalized["pathWorkNumberCandidates"] = [normalized["pathWorkNumberCandidate"]]
            normalized_records.append(normalized)
        folders = normalized_folders
        records = normalized_records
        summary = {
            "excludedByExtension": {},
            "blankFilenameRowCount": 0,
            "sourceExcelDateSystem": "1900",
        }
        summary.update(MODULE.metadata_summary(records, folders, summary))
        return {
            "profile": "sharepoint-iqy-metadata-preview/v3",
            "mappingRuleset": "sharepoint-iqy-work-number-mapping/2026-07-30.2",
            "mode": "preview",
            "databaseWrite": False,
            "macroExecution": False,
            "sourceContainsVba": False,
            "sourceWorkbookSha256": "a" * 64,
            "summary": summary,
            "folders": folders,
            "records": records,
        }

    def test_builds_path_only_folders_and_keeps_conflicts_reviewable(self) -> None:
        folders = [{
                "sourceRelativePath": "sites/Gyartas/2026/11111",
                "sourceLastModifiedAt": "2026-07-29T12:00:00",
                "sourceLastModifiedBy": "Gyártás Doorstar",
                "sourceLogicalRow": 10,
            }, {
                "sourceRelativePath": "sites/Gyartas/2026/empty",
                "sourceLastModifiedAt": "2026-07-29T12:00:00",
                "sourceLastModifiedBy": "Gyártás Doorstar",
                "sourceLogicalRow": 11,
            }]
        records = [{
                "sourceRelativePath": "sites/Gyartas/2026/11111/DSMR 26107.pdf",
                "filename": "DSMR 26107.pdf", "extension": ".pdf",
                "relevance": "POTENTIAL_IMPORT_DOCUMENT", "workNumberCandidate": "26107",
                "filenameWorkNumberCandidate": "26107",
                "pathWorkNumberCandidate": "11111",
                "workNumberResolution": "CONFLICT",
            }, {
                "sourceRelativePath": "sites/Gyartas/archive/99999/DSMR 88888.dxf",
                "filename": "DSMR 88888.dxf", "extension": ".dxf",
                "relevance": "DOCUMENT_METADATA_ONLY", "workNumberCandidate": "88888",
                "filenameWorkNumberCandidate": "88888",
                "pathWorkNumberCandidate": "99999",
                "workNumberResolution": "CONFLICT",
            }]
        result = MODULE.simulate(self.payload(folders, records))
        self.assertEqual(result["summary"]["folderCount"], 7)
        self.assertEqual(result["summary"]["documentCount"], 2)
        self.assertEqual(result["summary"]["projectLinkCandidateCount"], 0)
        self.assertEqual(result["summary"]["projectLinkReviewCount"], 2)
        self.assertEqual(result["summary"]["potentialImportProjectLinkReviewCount"], 1)
        self.assertEqual(result["summary"]["metadataOnlyProjectLinkReviewCount"], 1)
        self.assertEqual(result["summary"]["documentReviewCount"], 0)
        self.assertEqual(result["summary"]["metadataOnlyCount"], 1)
        self.assertEqual(result["summary"]["exportedFolderCount"], 2)
        self.assertRegex(result["catalogRunKey"], r"^spcatalog_[0-9a-f]{20}$")
        self.assertRegex(result["sourceSnapshotFingerprint"], r"^[0-9a-f]{64}$")
        self.assertEqual(result["documents"][0]["state"], "PROJECT_LINK_REVIEW")
        self.assertEqual(result["documents"][0]["sharePointIdentity"], "PATH_SIMULATION_ONLY")
        self.assertEqual(result["documents"][0]["filenameWorkNumberCandidate"], "26107")
        self.assertEqual(result["documents"][0]["pathWorkNumberCandidate"], "11111")
        self.assertEqual(result["documents"][1]["state"], "PROJECT_LINK_REVIEW")
        self.assertEqual(result["documents"][1]["relevance"], "DOCUMENT_METADATA_ONLY")
        exported = {
            item["relativePath"]: item
            for item in result["folders"]
            if item["emptyFolderCoverage"] == "EXPORTED_FOLDER_RECORD"
        }
        self.assertEqual(set(exported), {
            "sites/Gyartas/2026/11111",
            "sites/Gyartas/2026/empty",
        })
        self.assertFalse(exported["sites/Gyartas/2026/empty"]["derivedFromDocumentMetadata"])

    def test_rejects_unsafe_and_duplicate_paths(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsafe source-relative path"):
            MODULE.simulate(self.payload(records=[{
                "sourceRelativePath": r"C:\source\order.pdf",
                "filename": "order.pdf",
            }]))
        duplicate = {
            "sourceRelativePath": "sites/Gyartas/order.pdf",
            "filename": "order.pdf",
        }
        with self.assertRaisesRegex(ValueError, "duplicate document path"):
            MODULE.simulate(self.payload(records=[duplicate, duplicate.copy()]))

    def test_rejects_duplicate_folders_and_invalid_contracts(self) -> None:
        folder = {"sourceRelativePath": "sites/Gyartas/Foo"}
        with self.assertRaisesRegex(ValueError, "duplicate exported folder path"):
            MODULE.simulate(self.payload(folders=[folder, {
                "sourceRelativePath": "sites/Gyartas/foo",
            }]))
        invalid = self.payload()
        invalid["profile"] = "unknown/v99"
        with self.assertRaisesRegex(ValueError, "input profile"):
            MODULE.simulate(invalid)
        invalid = self.payload(records=[{
            "sourceRelativePath": "sites/Gyartas/order.pdf",
            "filename": "order.pdf",
        }])
        invalid["records"].append(None)
        invalid["summary"]["metadataRecordCount"] = 2
        invalid["summary"]["sourceDataRowCount"] = 2
        invalid["summary"]["accountedSourceRowCount"] = 2
        with self.assertRaisesRegex(ValueError, "objects only"):
            MODULE.simulate(invalid)

    def test_run_key_covers_the_transformed_payload(self) -> None:
        first = self.payload(records=[{
            "sourceRelativePath": "sites/Gyartas/a.pdf",
            "filename": "a.pdf",
        }])
        second = self.payload(records=[{
            "sourceRelativePath": "sites/Gyartas/b.pdf",
            "filename": "b.pdf",
        }])
        first_result = MODULE.simulate(first)
        second_result = MODULE.simulate(second)
        self.assertEqual(
            first_result["sourceSnapshotFingerprint"],
            second_result["sourceSnapshotFingerprint"],
        )
        self.assertNotEqual(
            first_result["transformationFingerprint"],
            second_result["transformationFingerprint"],
        )
        self.assertNotEqual(first_result["catalogRunKey"], second_result["catalogRunKey"])

    def test_rejects_semantically_invalid_document_contracts(self) -> None:
        invalid_relevance = self.payload(records=[{
            "sourceRelativePath": "sites/Gyartas/order.jpg",
            "filename": "order.jpg",
            "relevance": "POTENTIAL_IMPORT_DOCUMENT",
        }])
        with self.assertRaisesRegex(ValueError, "relevance does not match"):
            MODULE.simulate(invalid_relevance)

        invalid_filename = self.payload(records=[{
            "sourceRelativePath": "sites/Gyartas/order.pdf",
            "filename": "different.pdf",
        }])
        with self.assertRaisesRegex(ValueError, "filename must match"):
            MODULE.simulate(invalid_filename)

        invalid_package = self.payload(records=[{
            "sourceRelativePath": "sites/Gyartas/DSMR 26107.pdf",
            "filename": "DSMR 26107.pdf",
            "relevance": "POTENTIAL_IMPORT_DOCUMENT",
            "workNumberCandidate": "26107",
            "filenameWorkNumberCandidate": "26107",
            "filenameWorkNumberCandidates": ["26107"],
            "workNumberResolution": "FILENAME",
            "projectPackageWorkNumberCandidate": "26107",
            "projectPackageEvidence": "MADE_UP",
        }])
        with self.assertRaisesRegex(ValueError, "invalid project-package candidate"):
            MODULE.simulate(invalid_package)

    def test_recomputes_relevance_and_strong_package_evidence(self) -> None:
        fake_filename_evidence = self.payload(records=[{
            "sourceRelativePath": "sites/Gyartas/26107.pdf",
            "filename": "26107.pdf",
            "projectPackageWorkNumberCandidate": "26107",
            "projectPackageEvidence": "FILENAME_DSMR",
        }])
        with self.assertRaisesRegex(ValueError, "projectPackageWorkNumberCandidate"):
            MODULE.simulate(fake_filename_evidence)

        fake_folder_evidence = self.payload(records=[{
            "sourceRelativePath": "sites/misc/26107/order.pdf",
            "filename": "order.pdf",
            "workNumberCandidate": "26107",
            "pathWorkNumberCandidate": "26107",
            "pathWorkNumberCandidates": ["26107"],
            "workNumberResolution": "PATH",
            "projectPackageWorkNumberCandidate": "26107",
            "projectPackageEvidence": "PROJECT_FOLDER",
        }])
        with self.assertRaisesRegex(ValueError, "projectPackageWorkNumberCandidate"):
            MODULE.simulate(fake_folder_evidence)


if __name__ == "__main__":
    unittest.main()
