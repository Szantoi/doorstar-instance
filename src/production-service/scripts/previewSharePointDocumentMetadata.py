#!/usr/bin/env python3
"""Turn a SharePoint .iqy Excel export into reviewable document metadata.

This is a read-only preview tool.  It reads cached OOXML values, never opens
Excel, runs no macro/formula/query and has no database client.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from previewIo import require_output_outside_source_tree, write_json_atomic
from previewLegacyOrderImport import is_excluded, normalized, parse_workbook, source_file_hash
from sharePointMetadataRules import (
    RELEVANT_EXTENSIONS,
    derive_document_mapping,
    project_package_candidate,
    resolve_work_number,
    work_numbers_from,
)


REQUIRED_HEADERS = {"nev", "modositva", "modositotta", "elemtipus", "eleresi ut"}
METADATA_PROFILE = "sharepoint-iqy-metadata-preview/v3"
MAPPING_RULESET = "sharepoint-iqy-work-number-mapping/2026-07-30.2"


def header_index(header: list[object], name: str) -> int | None:
    sought = normalized(name)
    return next((index for index, value in enumerate(header) if normalized(value) == sought), None)


def cell(row: list[object], index: int | None) -> object | None:
    return row[index] if index is not None and index < len(row) else None


def source_relative_path(parent: object, name: object) -> str:
    raw = f"{str(parent or '').strip().strip('/')}/{str(name or '').strip()}".strip("/")
    parts = [part for part in raw.replace("\\", "/").split("/") if part]
    if any(part in {".", ".."} or ":" in part for part in parts):
        raise ValueError(f"unsafe source-relative path: {raw}")
    return "/".join(parts)


def excel_datetime(value: object, date_system: str = "1900") -> str | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    epoch = datetime(1904, 1, 1) if date_system == "1904" else datetime(1899, 12, 30)
    return (epoch + timedelta(days=float(value))).isoformat(timespec="seconds")


def select_query_sheet(workbook: dict[str, Any], requested_name: str | None = None) -> dict[str, Any]:
    if not workbook["sheets"]:
        raise ValueError("workbook has no sheets")
    if requested_name:
        matches = [sheet for sheet in workbook["sheets"] if sheet["name"] == requested_name]
        if len(matches) != 1:
            raise ValueError(f"requested sheet not found exactly once: {requested_name}")
        return matches[0]
    matches = []
    for sheet in workbook["sheets"]:
        if not sheet["rows"]:
            continue
        normalized_headers = {normalized(value) for value in sheet["rows"][0]}
        if REQUIRED_HEADERS.issubset(normalized_headers):
            matches.append(sheet)
    if len(matches) != 1:
        raise ValueError(f"expected exactly one SharePoint query sheet, found {len(matches)}")
    return matches[0]


def preview(workbook: dict[str, Any], requested_sheet: str | None = None) -> dict[str, Any]:
    sheet = select_query_sheet(workbook, requested_sheet)
    rows = sheet["rows"]
    if not rows:
        raise ValueError("workbook has no rows")
    header = rows[0]
    columns = {
        "filename": header_index(header, "nev"),
        "modified": header_index(header, "modositva"),
        "modifiedBy": header_index(header, "modositotta"),
        "itemType": header_index(header, "elemtipus"),
        "serverPath": header_index(header, "eleresi ut"),
    }
    missing = [name for name, index in columns.items() if index is None]
    if missing:
        raise ValueError(f"missing required SharePoint export columns: {', '.join(missing)}")

    records: list[dict[str, Any]] = []
    folders: list[dict[str, Any]] = []
    excluded: Counter[str] = Counter()
    folder_count = 0
    blank_filename_count = 0
    for logical_row, row in enumerate(rows[1:], start=2):
        filename = str(cell(row, columns["filename"]) or "").strip()
        if not filename:
            blank_filename_count += 1
            continue
        item_type = cell(row, columns["itemType"])
        if normalized(item_type) == "mappa":
            folder_count += 1
            server_path = str(cell(row, columns["serverPath"]) or "").strip().strip("/")
            folder_path = source_relative_path(server_path, filename)
            folders.append({
                "recordType": "DocumentSourceFolderMetadata",
                "sourceSystem": "SHAREPOINT_IQY_EXPORT",
                "sourceRelativePath": folder_path,
                "parentRelativePath": "/".join(folder_path.split("/")[:-1]) or None,
                "folderName": filename,
                "sourceLastModifiedAt": excel_datetime(cell(row, columns["modified"]), workbook.get("dateSystem", "1900")),
                "sourceLastModifiedTimezone": "UNKNOWN_EXPORT_TIMEZONE",
                "sourceLastModifiedBy": cell(row, columns["modifiedBy"]),
                "sourceSheet": sheet["name"],
                "sourceLogicalRow": logical_row,
                "errors": ["source_created_at_not_present_in_export"],
            })
            continue
        path = Path(filename)
        if is_excluded(path):
            excluded[path.suffix.lower() or "temporary"] += 1
            continue
        server_path = str(cell(row, columns["serverPath"]) or "").strip().strip("/")
        extension = path.suffix.lower()
        mapping = derive_document_mapping(filename, server_path)
        resolution = mapping["workNumberResolution"]
        errors = ["source_created_at_not_present_in_export", "requires_project_link_review"]
        if resolution == "CONFLICT":
            errors.append("filename_path_work_number_conflict")
        if resolution == "MULTIPLE":
            errors.append("multiple_work_number_candidates")
        records.append({
            "recordType": "DocumentSourceMetadata",
            "action": "REVIEW",
            "sourceSystem": "SHAREPOINT_IQY_EXPORT",
            "sourceRelativePath": source_relative_path(server_path, filename),
            "filename": filename,
            "extension": extension or None,
            "sourceLastModifiedAt": excel_datetime(cell(row, columns["modified"]), workbook.get("dateSystem", "1900")),
            "sourceLastModifiedTimezone": "UNKNOWN_EXPORT_TIMEZONE",
            "sourceLastModifiedBy": cell(row, columns["modifiedBy"]),
            "sharePointItemType": item_type,
            "workNumberCandidate": mapping["workNumberCandidate"],
            "filenameWorkNumberCandidate": mapping["filenameWorkNumberCandidate"],
            "pathWorkNumberCandidate": mapping["pathWorkNumberCandidate"],
            "filenameWorkNumberCandidates": mapping["filenameWorkNumberCandidates"],
            "pathWorkNumberCandidates": mapping["pathWorkNumberCandidates"],
            "workNumberResolution": resolution,
            "projectPackageWorkNumberCandidate": mapping["projectPackageWorkNumberCandidate"],
            "projectPackageEvidence": mapping["projectPackageEvidence"],
            "relevance": mapping["relevance"],
            "sourceSheet": sheet["name"],
            "sourceLogicalRow": logical_row,
            "errors": errors,
        })
    records.sort(key=lambda item: (item["sourceRelativePath"].lower(), item["filename"].lower()))
    folders.sort(key=lambda item: (item["sourceRelativePath"].lower(), item["folderName"].lower()))
    source_data_row_count = len(rows) - 1
    accounted_row_count = len(records) + len(folders) + sum(excluded.values()) + blank_filename_count
    return {
        "profile": METADATA_PROFILE,
        "mappingRuleset": MAPPING_RULESET,
        "sourceContainsVba": workbook.get("containsVba") is True,
        "mode": "preview",
        "databaseWrite": False,
        "macroExecution": False,
        "summary": {
            "metadataRecordCount": len(records),
            "folderMetadataRecordCount": len(folders),
            "folderMetadataExcludedFromDocumentCount": folder_count,
            "sourceDataRowCount": source_data_row_count,
            "accountedSourceRowCount": accounted_row_count,
            "sourceRowAccountingMatches": accounted_row_count == source_data_row_count,
            "blankFilenameRowCount": blank_filename_count,
            "sourceExcelDateSystem": workbook.get("dateSystem", "1900"),
            "excludedByExtension": dict(sorted(excluded.items())),
            "potentialImportDocumentCount": sum(record["relevance"] == "POTENTIAL_IMPORT_DOCUMENT" for record in records),
            "workNumberCandidateCount": len({record["workNumberCandidate"] for record in records if record["workNumberCandidate"]}),
            "filenamePathWorkNumberConflictCount": sum(record["workNumberResolution"] == "CONFLICT" for record in records),
            "multipleWorkNumberCandidateCount": sum(record["workNumberResolution"] == "MULTIPLE" for record in records),
            "pathFallbackWorkNumberCount": sum(record["workNumberResolution"] == "PATH" for record in records),
            "candidateProjectPackageCount": len({
                record["projectPackageWorkNumberCandidate"]
                for record in records
                if record["projectPackageWorkNumberCandidate"]
            }),
            "potentialImportProjectLinkCandidateCount": sum(
                record["relevance"] == "POTENTIAL_IMPORT_DOCUMENT"
                and record["workNumberResolution"] in {"FILENAME", "PATH"}
                for record in records
            ),
            "potentialImportProjectLinkConflictCount": sum(
                record["relevance"] == "POTENTIAL_IMPORT_DOCUMENT"
                and record["workNumberResolution"] == "CONFLICT"
                for record in records
            ),
            "potentialImportPathFallbackCount": sum(
                record["relevance"] == "POTENTIAL_IMPORT_DOCUMENT"
                and record["workNumberResolution"] == "PATH"
                for record in records
            ),
            "potentialImportUnresolvedCount": sum(
                record["relevance"] == "POTENTIAL_IMPORT_DOCUMENT"
                and record["workNumberResolution"] == "UNRESOLVED"
                for record in records
            ),
            "extensions": dict(sorted(Counter(record["extension"] or "no_extension" for record in records).items())),
        },
        "folders": folders,
        "records": records,
    }


def enforce_selected_sheet_row_limit(
    workbook: dict[str, Any],
    requested_sheet: str | None,
    max_rows: int,
) -> None:
    if max_rows <= 0:
        return
    selected_sheet = select_query_sheet(workbook, requested_sheet)
    if len(selected_sheet["rows"]) > max_rows + 1:
        raise ValueError(
            f"source has more than --max-rows={max_rows} data rows; "
            "refusing a silently truncated preview"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Preview SharePoint .iqy metadata export without database writes")
    parser.add_argument("--input-xlsx", required=True, type=Path)
    parser.add_argument("--output-json", required=True, type=Path)
    parser.add_argument("--sheet", help="Exact query sheet name; otherwise required headers select it.")
    parser.add_argument(
        "--max-rows",
        type=int,
        default=0,
        help="Optional positive data-row guard; 0 reads the complete cached query.",
    )
    args = parser.parse_args()
    require_output_outside_source_tree(args.input_xlsx, args.output_json)
    if args.max_rows < 0:
        raise ValueError("max-rows must be zero or positive")
    row_limit = args.max_rows + 2 if args.max_rows else None
    source_hash_before = source_file_hash(args.input_xlsx)
    workbook = parse_workbook(args.input_xlsx, row_limit=row_limit)
    enforce_selected_sheet_row_limit(workbook, args.sheet, args.max_rows)
    payload = preview(workbook, args.sheet)
    source_hash_after = source_file_hash(args.input_xlsx)
    if source_hash_before != source_hash_after:
        raise ValueError("source workbook changed while the preview was being read")
    payload["sourceWorkbookSha256"] = source_hash_after
    write_json_atomic(args.output_json, payload)
    print(json.dumps(payload["summary"], ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
