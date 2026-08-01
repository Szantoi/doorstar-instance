#!/usr/bin/env python3
"""Validate a Doorstar SharePoint metadata snapshot and folder simulation.

The validator reads JSON previews only. It has no SharePoint, Excel, macro or
database client and never opens a business document binary.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from previewIo import write_json_atomic
from simulateSharePointMetadataCatalog import (
    INPUT_MAPPING_RULESET,
    INPUT_PROFILE,
    SIMULATION_PROFILE,
    SIMULATION_RULESET,
    simulate,
    stable_id,
    transformation_fingerprint,
)


WINDOWS_ABSOLUTE = re.compile(r"^[A-Za-z]:[/\\]")


def safe_relative_path(value: object) -> bool:
    text = str(value or "")
    normalized = text.replace("\\", "/")
    parts = normalized.split("/")
    return bool(text) and not (
        text.startswith(("/", "\\"))
        or WINDOWS_ABSOLUTE.match(text)
        or "\\" in text
        or any(part in {"", ".", ".."} or ":" in part for part in parts)
    )


def validate(metadata: dict[str, Any], catalog: dict[str, Any]) -> dict[str, Any]:
    errors: list[dict[str, str]] = []

    def add_error(code: str, location: str, message: str) -> None:
        errors.append({"code": code, "location": location, "message": message})

    for name, payload in (("metadata", metadata), ("catalog", catalog)):
        if payload.get("mode") != "preview":
            add_error("UNSAFE_MODE", name, "mode must be preview")
        if payload.get("databaseWrite") is not False:
            add_error("DATABASE_WRITE_NOT_FALSE", name, "databaseWrite must be false")
        if payload.get("macroExecution") is not False:
            add_error("MACRO_EXECUTION_NOT_FALSE", name, "macroExecution must be false")
    if metadata.get("profile") != INPUT_PROFILE or metadata.get("mappingRuleset") != INPUT_MAPPING_RULESET:
        add_error("METADATA_PROFILE_MISMATCH", "metadata", "profile or mapping ruleset differs")
    if catalog.get("profile") != SIMULATION_PROFILE or catalog.get("mappingRuleset") != SIMULATION_RULESET:
        add_error("CATALOG_PROFILE_MISMATCH", "catalog", "profile or mapping ruleset differs")
    expected_catalog: dict[str, Any] | None = None
    try:
        expected_catalog = simulate(metadata)
    except (TypeError, ValueError) as error:
        add_error("INPUT_CONTRACT_INVALID", "metadata", str(error))

    records = [item for item in metadata.get("records", []) if isinstance(item, dict)]
    source_folders = [item for item in metadata.get("folders", []) if isinstance(item, dict)]
    documents = [item for item in catalog.get("documents", []) if isinstance(item, dict)]
    folders = [item for item in catalog.get("folders", []) if isinstance(item, dict)]
    packages = [item for item in catalog.get("projectPackages", []) if isinstance(item, dict)]

    metadata_summary = metadata.get("summary", {})
    catalog_summary = catalog.get("summary", {})
    excluded_count = sum(
        value for value in metadata_summary.get("excludedByExtension", {}).values()
        if isinstance(value, int)
    )
    accounted = (
        len(records)
        + len(source_folders)
        + excluded_count
        + int(metadata_summary.get("blankFilenameRowCount", 0))
    )
    source_rows = metadata_summary.get("sourceDataRowCount")
    if accounted != source_rows:
        add_error(
            "SOURCE_ROW_ACCOUNTING_MISMATCH",
            "metadata.summary",
            f"accounted {accounted} rows but source reports {source_rows}",
        )

    expected_counts = {
        "metadataRecordCount": len(records),
        "folderMetadataRecordCount": len(source_folders),
        "accountedSourceRowCount": accounted,
        "potentialImportDocumentCount": sum(
            item.get("relevance") == "POTENTIAL_IMPORT_DOCUMENT"
            for item in records
        ),
        "filenamePathWorkNumberConflictCount": sum(
            item.get("workNumberResolution") == "CONFLICT"
            for item in records
        ),
        "multipleWorkNumberCandidateCount": sum(
            item.get("workNumberResolution") == "MULTIPLE"
            for item in records
        ),
        "pathFallbackWorkNumberCount": sum(
            item.get("workNumberResolution") == "PATH"
            for item in records
        ),
        "candidateProjectPackageCount": len({
            item.get("projectPackageWorkNumberCandidate")
            for item in records
            if item.get("projectPackageWorkNumberCandidate")
        }),
    }
    for field, expected in expected_counts.items():
        if metadata_summary.get(field) != expected:
            add_error(
                "METADATA_SUMMARY_MISMATCH",
                f"metadata.summary.{field}",
                f"expected {expected}, got {metadata_summary.get(field)}",
            )

    for collection_name, items, path_field, id_prefix in (
        ("documents", documents, "relativePath", "spdoc"),
        ("folders", folders, "relativePath", "spfolder"),
    ):
        seen_paths: set[str] = set()
        seen_ids: set[str] = set()
        for index, item in enumerate(items):
            path = item.get(path_field)
            location = f"catalog.{collection_name}[{index}]"
            if not safe_relative_path(path):
                add_error("UNSAFE_RELATIVE_PATH", location, "path must be normalized and relative")
                continue
            path_key = str(path).casefold()
            if path_key in seen_paths:
                add_error("DUPLICATE_RELATIVE_PATH", location, str(path))
            seen_paths.add(path_key)
            expected_id = stable_id(id_prefix, path_key)
            if item.get("id") != expected_id:
                add_error("UNSTABLE_ID", location, f"expected {expected_id}")
            if item.get("id") in seen_ids:
                add_error("DUPLICATE_ID", location, str(item.get("id")))
            seen_ids.add(str(item.get("id")))

    folder_paths = {str(item.get("relativePath")).casefold() for item in folders}
    for index, folder in enumerate(folders):
        parent = folder.get("parentRelativePath")
        if parent and str(parent).casefold() not in folder_paths:
            add_error("ORPHAN_FOLDER_PARENT", f"catalog.folders[{index}]", str(parent))
    for index, document in enumerate(documents):
        parent = document.get("parentRelativePath")
        if parent and str(parent).casefold() not in folder_paths:
            add_error("ORPHAN_DOCUMENT_PARENT", f"catalog.documents[{index}]", str(parent))

    document_ids = {item.get("id") for item in documents}
    package_work_numbers: set[str] = set()
    for index, package in enumerate(packages):
        work_number = str(package.get("workNumber") or "")
        if work_number in package_work_numbers:
            add_error("DUPLICATE_PROJECT_PACKAGE", f"catalog.projectPackages[{index}]", work_number)
        package_work_numbers.add(work_number)
        missing = [item for item in package.get("documentIds", []) if item not in document_ids]
        if missing:
            add_error(
                "UNKNOWN_PACKAGE_DOCUMENT",
                f"catalog.projectPackages[{index}]",
                f"{len(missing)} document IDs are missing",
            )

    fingerprint = str(metadata.get("sourceWorkbookSha256") or "")
    if catalog.get("sourceSnapshotFingerprint") != fingerprint:
        add_error("FINGERPRINT_MISMATCH", "catalog.sourceSnapshotFingerprint", "metadata hash differs")
    if len(fingerprint) != 64 or any(character not in "0123456789abcdef" for character in fingerprint.lower()):
        add_error("INVALID_FINGERPRINT", "metadata.sourceWorkbookSha256", "expected SHA-256")
    elif expected_catalog is not None:
        if catalog.get("sourceSnapshotKey") != stable_id("spsnapshot", fingerprint.lower()):
            add_error("SOURCE_SNAPSHOT_KEY_MISMATCH", "catalog.sourceSnapshotKey", "source key is not fingerprint-derived")
        expected_transformation = transformation_fingerprint(metadata)
        if catalog.get("transformationFingerprint") != expected_transformation:
            add_error(
                "TRANSFORMATION_FINGERPRINT_MISMATCH",
                "catalog.transformationFingerprint",
                "transformation input/profile hash differs",
            )
        if catalog.get("catalogRunKey") != stable_id("spcatalog", expected_transformation):
            add_error(
                "CATALOG_RUN_KEY_MISMATCH",
                "catalog.catalogRunKey",
                "run key is not transformation-fingerprint-derived",
            )
    if expected_catalog is not None and catalog != expected_catalog:
        add_error(
            "CATALOG_PAYLOAD_MISMATCH",
            "catalog",
            "catalog content is not the exact deterministic transformation of metadata",
        )

    derived_catalog_counts = {
        "documentCount": len(documents),
        "folderCount": len(folders),
        "projectPackageCount": len(packages),
        "candidateProjectPackageCount": len(packages),
        "weakWorkNumberDocumentCount": sum(
            bool(item.get("workNumberCandidate"))
            and not bool(item.get("projectPackageWorkNumberCandidate"))
            for item in documents
        ),
        "projectLinkCandidateCount": sum(item.get("state") == "PROJECT_LINK_CANDIDATE" for item in documents),
        "projectLinkReviewCount": sum(item.get("linkReviewState") == "REVIEW" for item in documents),
        "potentialImportProjectLinkReviewCount": sum(
            item.get("linkReviewState") == "REVIEW"
            and item.get("relevance") == "POTENTIAL_IMPORT_DOCUMENT"
            for item in documents
        ),
        "metadataOnlyProjectLinkReviewCount": sum(
            item.get("linkReviewState") == "REVIEW"
            and item.get("relevance") != "POTENTIAL_IMPORT_DOCUMENT"
            for item in documents
        ),
        "documentReviewCount": sum(item.get("state") == "DOCUMENT_REVIEW" for item in documents),
        "metadataOnlyCount": sum(
            item.get("relevance") != "POTENTIAL_IMPORT_DOCUMENT"
            for item in documents
        ),
        "exportedFolderCount": sum(
            item.get("emptyFolderCoverage") == "EXPORTED_FOLDER_RECORD"
            for item in folders
        ),
    }
    for field, expected in derived_catalog_counts.items():
        if catalog_summary.get(field) != expected:
            add_error(
                "CATALOG_SUMMARY_MISMATCH",
                f"catalog.summary.{field}",
                f"expected {expected}, got {catalog_summary.get(field)}",
            )

    return {
        "profile": "sharepoint-metadata-catalog-validation/v1",
        "mode": "preview",
        "databaseWrite": False,
        "macroExecution": False,
        "valid": not errors,
        "summary": {
            "errorCount": len(errors),
            "sourceDataRowCount": source_rows,
            "documentCount": len(documents),
            "folderCount": len(folders),
            "projectPackageCount": len(packages),
            "catalogRunKey": catalog.get("catalogRunKey"),
        },
        "errors": sorted(errors, key=lambda item: (item["code"], item["location"], item["message"])),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata-json", required=True, type=Path)
    parser.add_argument("--catalog-json", required=True, type=Path)
    parser.add_argument("--output-json", required=True, type=Path)
    parser.add_argument("--fail-on-error", action="store_true")
    args = parser.parse_args()
    input_paths = {args.metadata_json.resolve(), args.catalog_json.resolve()}
    if args.output_json.resolve() in input_paths:
        raise ValueError("output-json must not overwrite an input preview")
    result = validate(
        json.loads(args.metadata_json.read_text(encoding="utf-8")),
        json.loads(args.catalog_json.read_text(encoding="utf-8")),
    )
    write_json_atomic(args.output_json, result)
    print(json.dumps(result["summary"], ensure_ascii=False, sort_keys=True))
    return 1 if args.fail_on_error and not result["valid"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
