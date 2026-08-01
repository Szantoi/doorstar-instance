#!/usr/bin/env python3
"""Build a deterministic, read-only SharePoint folder/catalog simulation.

The input is the metadata-only preview from previewSharePointDocumentMetadata.
It models only paths and document metadata available in the `.iqy` export. It
does not call SharePoint, open the source workbook, fetch file binaries, run a
macro, or connect to a Doorstar database.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

from previewIo import write_json_atomic
from sharePointMetadataRules import derive_document_mapping


INPUT_PROFILE = "sharepoint-iqy-metadata-preview/v3"
INPUT_MAPPING_RULESET = "sharepoint-iqy-work-number-mapping/2026-07-30.2"
SIMULATION_PROFILE = "sharepoint-metadata-folder-simulation/v3"
SIMULATION_RULESET = "sharepoint-folder-catalog-mapping/2026-07-30.3"
WORK_NUMBER_VALUE = re.compile(r"^\d{5}$")
RELEVANCE_VALUES = {"POTENTIAL_IMPORT_DOCUMENT", "DOCUMENT_METADATA_ONLY"}
RESOLUTION_VALUES = {"FILENAME", "PATH", "CONFLICT", "MULTIPLE", "UNRESOLVED"}
PACKAGE_EVIDENCE_VALUES = {"FILENAME_DSMR", "PROJECT_FOLDER"}


def stable_id(prefix: str, value: str) -> str:
    return f"{prefix}_{hashlib.sha256(value.encode('utf-8')).hexdigest()[:20]}"


def path_parts(value: object) -> list[str]:
    normalized = str(value or "").replace("\\", "/").strip("/")
    parts = [part for part in normalized.split("/") if part]
    if any(part in {".", ".."} or ":" in part for part in parts):
        raise ValueError(f"unsafe source-relative path: {value}")
    return parts


def source_snapshot_fingerprint(payload: dict[str, Any]) -> str:
    fingerprint = str(payload.get("sourceWorkbookSha256") or "").lower()
    if len(fingerprint) != 64 or any(character not in "0123456789abcdef" for character in fingerprint):
        raise ValueError("sourceWorkbookSha256 must be a lowercase SHA-256 value")
    return fingerprint


def transformation_fingerprint(payload: dict[str, Any]) -> str:
    canonical = json.dumps({
        "inputProfile": payload.get("profile"),
        "inputMappingRuleset": payload.get("mappingRuleset"),
        "simulatorProfile": SIMULATION_PROFILE,
        "simulatorRuleset": SIMULATION_RULESET,
        "sourceWorkbookSha256": source_snapshot_fingerprint(payload),
        "folders": sorted(
            payload["folders"],
            key=lambda item: json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
        ),
        "records": sorted(
            payload["records"],
            key=lambda item: json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
        ),
    }, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def validate_input_contract(payload: dict[str, Any]) -> None:
    if payload.get("profile") != INPUT_PROFILE:
        raise ValueError(f"input profile must be {INPUT_PROFILE}")
    if payload.get("mappingRuleset") != INPUT_MAPPING_RULESET:
        raise ValueError(f"input mappingRuleset must be {INPUT_MAPPING_RULESET}")
    if payload.get("sourceContainsVba") is not False:
        raise ValueError("sourceContainsVba must be false")
    if payload.get("mode") != "preview" or payload.get("databaseWrite") is not False or payload.get("macroExecution") is not False:
        raise ValueError("input must be a macro-free, database-write-free metadata preview")
    if not isinstance(payload.get("folders"), list) or not isinstance(payload.get("records"), list):
        raise ValueError("input folders and records must be lists")
    if any(not isinstance(item, dict) for key in ("folders", "records") for item in payload[key]):
        raise ValueError("input folders and records must contain objects only")
    source_snapshot_fingerprint(payload)
    summary = payload.get("summary")
    if not isinstance(summary, dict):
        raise ValueError("input summary must be an object")
    excluded = summary.get("excludedByExtension")
    if not isinstance(excluded, dict) or any(
        not isinstance(value, int) or isinstance(value, bool) or value < 0
        for value in excluded.values()
    ):
        raise ValueError("excludedByExtension must contain non-negative integer counts")
    blank_count = summary.get("blankFilenameRowCount")
    if not isinstance(blank_count, int) or isinstance(blank_count, bool) or blank_count < 0:
        raise ValueError("blankFilenameRowCount must be a non-negative integer")
    accounted = (
        len(payload["folders"])
        + len(payload["records"])
        + sum(excluded.values())
        + blank_count
    )
    if summary.get("sourceRowAccountingMatches") is not True:
        raise ValueError("source row accounting is not confirmed")
    if summary.get("accountedSourceRowCount") != accounted or summary.get("sourceDataRowCount") != accounted:
        raise ValueError("source row accounting does not match the input collections")
    if summary.get("sourceExcelDateSystem") not in {"1900", "1904"}:
        raise ValueError("sourceExcelDateSystem must be 1900 or 1904")
    for item in payload["folders"]:
        validate_folder_record(item)
    for item in payload["records"]:
        validate_document_record(item)
    expected_summary = metadata_summary(payload["records"], payload["folders"], summary)
    for field, expected in expected_summary.items():
        if summary.get(field) != expected:
            raise ValueError(
                f"input summary {field} mismatch: expected {expected}, got {summary.get(field)}"
            )


def valid_work_number(value: object) -> bool:
    return isinstance(value, str) and WORK_NUMBER_VALUE.fullmatch(value) is not None


def validate_candidate_list(value: object, field: str) -> list[str]:
    if not isinstance(value, list) or any(not valid_work_number(item) for item in value):
        raise ValueError(f"{field} must be a list of five-digit work numbers")
    if len(value) != len(set(value)):
        raise ValueError(f"{field} must not contain duplicates")
    return value


def validate_folder_record(item: dict[str, Any]) -> None:
    relative_path = "/".join(path_parts(item.get("sourceRelativePath")))
    name = item.get("folderName")
    if not isinstance(name, str) or not name or "/" in name or "\\" in name:
        raise ValueError("every folder record requires a safe folderName")
    if relative_path.split("/")[-1] != name:
        raise ValueError("folderName must match the sourceRelativePath tail")
    expected_parent = "/".join(relative_path.split("/")[:-1]) or None
    if item.get("parentRelativePath") != expected_parent:
        raise ValueError("folder parentRelativePath does not match its path")
    if item.get("sourceLastModifiedTimezone") != "UNKNOWN_EXPORT_TIMEZONE":
        raise ValueError("folder source timezone provenance is required")


def validate_document_record(item: dict[str, Any]) -> None:
    relative_path = "/".join(path_parts(item.get("sourceRelativePath")))
    filename = item.get("filename")
    if not isinstance(filename, str) or not filename or "/" in filename or "\\" in filename:
        raise ValueError("every document record requires a safe filename")
    if relative_path.split("/")[-1] != filename:
        raise ValueError("filename must match the sourceRelativePath tail")
    expected_extension = Path(filename).suffix.lower() or None
    if item.get("extension") != expected_extension:
        raise ValueError("document extension does not match filename")
    parent_path = "/".join(relative_path.split("/")[:-1])
    expected_mapping = derive_document_mapping(filename, parent_path)
    if item.get("relevance") != expected_mapping["relevance"]:
        raise ValueError("document relevance does not match filename extension")
    if item.get("sourceLastModifiedTimezone") != "UNKNOWN_EXPORT_TIMEZONE":
        raise ValueError("document source timezone provenance is required")
    resolution = item.get("workNumberResolution")
    if resolution not in RESOLUTION_VALUES:
        raise ValueError("invalid work-number resolution")
    filename_candidates = validate_candidate_list(
        item.get("filenameWorkNumberCandidates"),
        "filenameWorkNumberCandidates",
    )
    path_candidates = validate_candidate_list(
        item.get("pathWorkNumberCandidates"),
        "pathWorkNumberCandidates",
    )
    selected = item.get("workNumberCandidate")
    filename_selected = item.get("filenameWorkNumberCandidate")
    path_selected = item.get("pathWorkNumberCandidate")
    for value in (selected, filename_selected, path_selected):
        if value is not None and not valid_work_number(value):
            raise ValueError("selected work-number fields must be null or five digits")
    if resolution == "MULTIPLE":
        if max(len(filename_candidates), len(path_candidates)) <= 1:
            raise ValueError("MULTIPLE requires more than one distinct candidate")
        if any(value is not None for value in (selected, filename_selected, path_selected)):
            raise ValueError("MULTIPLE must not select a work number")
    else:
        expected_filename = filename_candidates[0] if len(filename_candidates) == 1 else None
        expected_path = path_candidates[0] if len(path_candidates) == 1 else None
        if filename_selected != expected_filename or path_selected != expected_path:
            raise ValueError("singular candidate fields do not match candidate arrays")
        if resolution == "UNRESOLVED" and (filename_candidates or path_candidates or selected):
            raise ValueError("UNRESOLVED must have no work-number candidate")
        if resolution == "PATH" and (filename_candidates or selected != expected_path):
            raise ValueError("PATH resolution invariants failed")
        if resolution == "FILENAME" and (
            selected != expected_filename
            or expected_filename is None
            or (expected_path is not None and expected_path != expected_filename)
        ):
            raise ValueError("FILENAME resolution invariants failed")
        if resolution == "CONFLICT" and (
            expected_filename is None
            or expected_path is None
            or expected_filename == expected_path
            or selected != expected_filename
        ):
            raise ValueError("CONFLICT resolution invariants failed")
    package_candidate = item.get("projectPackageWorkNumberCandidate")
    package_evidence = item.get("projectPackageEvidence")
    if (package_candidate is None) != (package_evidence is None):
        raise ValueError("package candidate and evidence must both be present or absent")
    if package_candidate is not None:
        if (
            not valid_work_number(package_candidate)
            or package_evidence not in PACKAGE_EVIDENCE_VALUES
            or item.get("relevance") != "POTENTIAL_IMPORT_DOCUMENT"
            or package_candidate != selected
        ):
            raise ValueError("invalid project-package candidate")
        if package_evidence == "FILENAME_DSMR" and package_candidate not in filename_candidates:
            raise ValueError("filename package evidence does not match filename candidates")
        if package_evidence == "PROJECT_FOLDER" and package_candidate not in path_candidates:
            raise ValueError("folder package evidence does not match path candidates")
    for field, expected in expected_mapping.items():
        if item.get(field) != expected:
            raise ValueError(
                f"document mapping {field} does not match deterministic filename/path rules"
            )


def metadata_summary(
    records: list[dict[str, Any]],
    folders: list[dict[str, Any]],
    source_summary: dict[str, Any],
) -> dict[str, Any]:
    return {
        "metadataRecordCount": len(records),
        "folderMetadataRecordCount": len(folders),
        "folderMetadataExcludedFromDocumentCount": len(folders),
        "potentialImportDocumentCount": sum(
            item.get("relevance") == "POTENTIAL_IMPORT_DOCUMENT" for item in records
        ),
        "workNumberCandidateCount": len({
            item.get("workNumberCandidate") for item in records if item.get("workNumberCandidate")
        }),
        "filenamePathWorkNumberConflictCount": sum(
            item.get("workNumberResolution") == "CONFLICT" for item in records
        ),
        "multipleWorkNumberCandidateCount": sum(
            item.get("workNumberResolution") == "MULTIPLE" for item in records
        ),
        "pathFallbackWorkNumberCount": sum(
            item.get("workNumberResolution") == "PATH" for item in records
        ),
        "candidateProjectPackageCount": len({
            item.get("projectPackageWorkNumberCandidate")
            for item in records
            if item.get("projectPackageWorkNumberCandidate")
        }),
        "potentialImportProjectLinkCandidateCount": sum(
            item.get("relevance") == "POTENTIAL_IMPORT_DOCUMENT"
            and item.get("workNumberResolution") in {"FILENAME", "PATH"}
            for item in records
        ),
        "potentialImportProjectLinkConflictCount": sum(
            item.get("relevance") == "POTENTIAL_IMPORT_DOCUMENT"
            and item.get("workNumberResolution") == "CONFLICT"
            for item in records
        ),
        "potentialImportPathFallbackCount": sum(
            item.get("relevance") == "POTENTIAL_IMPORT_DOCUMENT"
            and item.get("workNumberResolution") == "PATH"
            for item in records
        ),
        "potentialImportUnresolvedCount": sum(
            item.get("relevance") == "POTENTIAL_IMPORT_DOCUMENT"
            and item.get("workNumberResolution") == "UNRESOLVED"
            for item in records
        ),
        "extensions": dict(sorted(Counter(
            item.get("extension") or "no_extension" for item in records
        ).items())),
        "sourceDataRowCount": (
            len(records)
            + len(folders)
            + sum(source_summary["excludedByExtension"].values())
            + source_summary["blankFilenameRowCount"]
        ),
        "accountedSourceRowCount": (
            len(records)
            + len(folders)
            + sum(source_summary["excludedByExtension"].values())
            + source_summary["blankFilenameRowCount"]
        ),
        "sourceRowAccountingMatches": True,
    }


def project_link_state(record: dict[str, Any]) -> str:
    if record.get("workNumberResolution") in {"CONFLICT", "MULTIPLE"}:
        return "REVIEW"
    if record.get("workNumberCandidate"):
        return "CANDIDATE"
    return "UNRESOLVED"


def document_state(record: dict[str, Any]) -> str:
    if project_link_state(record) == "REVIEW":
        return "PROJECT_LINK_REVIEW"
    if record.get("relevance") != "POTENTIAL_IMPORT_DOCUMENT":
        return "METADATA_ONLY"
    if project_link_state(record) == "CANDIDATE":
        return "PROJECT_LINK_CANDIDATE"
    return "DOCUMENT_REVIEW"


def add_folder(
    folders: dict[str, dict[str, Any]],
    folder_path: str,
    source: dict[str, Any] | None = None,
) -> None:
    """Add every ancestor and upgrade a derived node with exported metadata."""
    parts = path_parts(folder_path)
    for index in range(1, len(parts) + 1):
        current_path = "/".join(parts[:index])
        current_key = current_path.casefold()
        parent_path = "/".join(parts[:index - 1]) or None
        existing = folders.get(current_key)
        if existing and existing["relativePath"] != current_path:
            raise ValueError(
                f"case-insensitive folder path collision: "
                f"{existing['relativePath']} versus {current_path}"
            )
        folders.setdefault(current_key, {
            "recordType": "SharePointFolderSimulation",
            "id": stable_id("spfolder", current_path.casefold()),
            "relativePath": current_path,
            "parentRelativePath": parent_path,
            "name": parts[index - 1],
            "derivedFromDocumentMetadata": True,
            "emptyFolderCoverage": "DERIVED_ANCESTOR_ONLY",
        })
    if source and parts:
        node = folders["/".join(parts).casefold()]
        node.update({
            "sourceLastModifiedAt": source.get("sourceLastModifiedAt"),
            "sourceLastModifiedTimezone": source.get("sourceLastModifiedTimezone"),
            "sourceLastModifiedBy": source.get("sourceLastModifiedBy"),
            "sourceLogicalRow": source.get("sourceLogicalRow"),
            "derivedFromDocumentMetadata": False,
            "emptyFolderCoverage": "EXPORTED_FOLDER_RECORD",
        })


def simulate(payload: dict[str, Any]) -> dict[str, Any]:
    validate_input_contract(payload)
    folders: dict[str, dict[str, Any]] = {}
    documents: list[dict[str, Any]] = []
    document_paths: set[str] = set()
    packages: dict[str, dict[str, Any]] = {}
    exported_folder_paths: set[str] = set()
    for folder in payload.get("folders", []):
        folder_path = "/".join(path_parts(folder.get("sourceRelativePath")))
        folder_key = folder_path.casefold()
        if folder_key in exported_folder_paths:
            raise ValueError(f"duplicate exported folder path: {folder_path}")
        exported_folder_paths.add(folder_key)
        add_folder(folders, folder_path, folder)
    for record in payload.get("records", []):
        relative_path = "/".join(path_parts(record.get("sourceRelativePath")))
        path_key = relative_path.casefold()
        if path_key in document_paths:
            raise ValueError(f"duplicate document path cannot be simulated safely: {relative_path}")
        document_paths.add(path_key)
        parts = path_parts(relative_path)
        parent_parts = parts[:-1]
        add_folder(folders, "/".join(parent_parts))
        document_id = stable_id("spdoc", relative_path.casefold())
        state = document_state(record)
        link_state = project_link_state(record)
        document = {
            "recordType": "SharePointDocumentSimulation",
            "id": document_id,
            "relativePath": relative_path,
            "parentRelativePath": "/".join(parent_parts) or None,
            "filename": record.get("filename"),
            "extension": record.get("extension"),
            "sourceLastModifiedAt": record.get("sourceLastModifiedAt"),
            "sourceLastModifiedTimezone": record.get("sourceLastModifiedTimezone"),
            "sourceLastModifiedBy": record.get("sourceLastModifiedBy"),
            "workNumberCandidate": record.get("workNumberCandidate"),
            "filenameWorkNumberCandidate": record.get("filenameWorkNumberCandidate"),
            "pathWorkNumberCandidate": record.get("pathWorkNumberCandidate"),
            "filenameWorkNumberCandidates": record.get("filenameWorkNumberCandidates", []),
            "pathWorkNumberCandidates": record.get("pathWorkNumberCandidates", []),
            "workNumberResolution": record.get("workNumberResolution", "UNRESOLVED"),
            "projectPackageWorkNumberCandidate": record.get("projectPackageWorkNumberCandidate"),
            "projectPackageEvidence": record.get("projectPackageEvidence"),
            "state": state,
            "sharePointIdentity": "PATH_SIMULATION_ONLY",
            "catalogLifecycleState": "ACTIVE",
            "identityState": "PATH_SIMULATION_ONLY",
            "linkReviewState": link_state,
            "versionState": "SNAPSHOT_ONLY",
            "relevance": record.get("relevance"),
            "reviewRequired": (
                record.get("relevance") == "POTENTIAL_IMPORT_DOCUMENT"
                or link_state == "REVIEW"
            ),
        }
        documents.append(document)
        package_work_number = record.get("projectPackageWorkNumberCandidate")
        if package_work_number:
            package = packages.setdefault(str(package_work_number), {
                "documentIds": [],
                "evidence": set(),
            })
            package["documentIds"].append(document_id)
            if record.get("projectPackageEvidence"):
                package["evidence"].add(str(record["projectPackageEvidence"]))
    documents.sort(key=lambda item: item["relativePath"].casefold())
    package_records = [{
        "recordType": "SharePointProjectPackageSimulation",
        "workNumber": work_number,
        "documentIds": sorted(package["documentIds"]),
        "candidateEvidence": sorted(package["evidence"]),
        "state": "PROJECT_LINK_REVIEW",
        "reason": "Strong naming evidence proposes a package, but snapshot paths cannot establish a project link.",
    } for work_number, package in sorted(packages.items())]
    source_fingerprint = source_snapshot_fingerprint(payload)
    run_fingerprint = transformation_fingerprint(payload)
    return {
        "mode": "preview",
        "databaseWrite": False,
        "macroExecution": False,
        "profile": SIMULATION_PROFILE,
        "mappingRuleset": SIMULATION_RULESET,
        "sourceSnapshotKey": stable_id("spsnapshot", source_fingerprint),
        "sourceSnapshotFingerprint": source_fingerprint,
        "transformationFingerprint": run_fingerprint,
        "catalogRunKey": stable_id("spcatalog", run_fingerprint),
        "limitations": [
            "Folder nodes use exported folder rows when present and derive missing ancestors from document paths.",
            "Document identity is path simulation only; it is not a SharePoint drive/item/version identity.",
            "Last modified is document-version metadata, not an order or delivery event.",
            "The export has no content hash, byte size or item ID, so binary duplicates cannot be proven.",
            "Cached modification timestamps have no timezone evidence in the export.",
        ],
        "realIntegrationPrerequisites": [
            "siteId, driveId and itemId for stable identity",
            "eTag or versionId and Microsoft Graph delta token for incremental change detection",
            "createdDateTime, lastModifiedDateTime and version history where lifecycle reporting is required",
            "least-privilege read-only access and a reviewed project-link rule",
        ],
        "summary": {
            "folderCount": len(folders),
            "documentCount": len(documents),
            "projectPackageCount": len(package_records),
            "candidateProjectPackageCount": len(package_records),
            "weakWorkNumberDocumentCount": sum(
                bool(item["workNumberCandidate"])
                and not bool(item["projectPackageWorkNumberCandidate"])
                for item in documents
            ),
            "projectLinkCandidateCount": sum(item["state"] == "PROJECT_LINK_CANDIDATE" for item in documents),
            "projectLinkReviewCount": sum(item["state"] == "PROJECT_LINK_REVIEW" for item in documents),
            "potentialImportProjectLinkReviewCount": sum(
                item["state"] == "PROJECT_LINK_REVIEW"
                and item["relevance"] == "POTENTIAL_IMPORT_DOCUMENT"
                for item in documents
            ),
            "metadataOnlyProjectLinkReviewCount": sum(
                item["state"] == "PROJECT_LINK_REVIEW"
                and item["relevance"] != "POTENTIAL_IMPORT_DOCUMENT"
                for item in documents
            ),
            "documentReviewCount": sum(item["state"] == "DOCUMENT_REVIEW" for item in documents),
            "metadataOnlyCount": sum(
                item["relevance"] != "POTENTIAL_IMPORT_DOCUMENT"
                for item in documents
            ),
            "exportedFolderCount": sum(
                item["emptyFolderCoverage"] == "EXPORTED_FOLDER_RECORD"
                for item in folders.values()
            ),
        },
        "folders": sorted(folders.values(), key=lambda item: item["relativePath"].casefold()),
        "documents": documents,
        "projectPackages": package_records,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-json", required=True, type=Path)
    parser.add_argument("--output-json", required=True, type=Path)
    args = parser.parse_args()
    if args.input_json.resolve() == args.output_json.resolve():
        raise ValueError("output-json must not overwrite input-json")
    result = simulate(json.loads(args.input_json.read_text(encoding="utf-8")))
    write_json_atomic(args.output_json, result)
    print(json.dumps(result["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
