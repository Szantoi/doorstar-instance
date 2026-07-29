#!/usr/bin/env python3
"""Turn a SharePoint .iqy Excel export into reviewable document metadata.

This is a read-only preview tool.  It reads cached OOXML values, never opens
Excel, runs no macro/formula/query and has no database client.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from previewLegacyOrderImport import is_excluded, normalized, parse_workbook


WORK_NUMBER = re.compile(r"(?<!\d)(?:DSMR[_ -]?)?(\d{5})(?!\d)", re.IGNORECASE)
RELEVANT_EXTENSIONS = {".pdf", ".dwg", ".xlsx", ".xlsm"}


def header_index(header: list[object], name: str) -> int | None:
    sought = normalized(name)
    return next((index for index, value in enumerate(header) if normalized(value) == sought), None)


def cell(row: list[object], index: int | None) -> object | None:
    return row[index] if index is not None and index < len(row) else None


def excel_datetime(value: object) -> str | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    # Excel's 1900 serial system, including the conventional 1899-12-30 epoch.
    return (datetime(1899, 12, 30) + timedelta(days=float(value))).isoformat(timespec="seconds")


def work_number(filename: str, server_path: str) -> str | None:
    # An explicit work number in a file name wins over an enclosing archive
    # folder: a later order may be stored in an earlier project's package.
    match = WORK_NUMBER.search(filename)
    if match:
        return match.group(1)
    match = WORK_NUMBER.search(server_path)
    return match.group(1) if match else None


def preview(workbook: dict[str, Any]) -> dict[str, Any]:
    if not workbook["sheets"]:
        raise ValueError("workbook has no sheets")
    rows = workbook["sheets"][0]["rows"]
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
    excluded: Counter[str] = Counter()
    folder_count = 0
    for logical_row, row in enumerate(rows[1:], start=2):
        filename = str(cell(row, columns["filename"]) or "").strip()
        if not filename:
            continue
        item_type = cell(row, columns["itemType"])
        if normalized(item_type) == "mappa":
            folder_count += 1
            continue
        path = Path(filename)
        if is_excluded(path):
            excluded[path.suffix.lower() or "temporary"] += 1
            continue
        server_path = str(cell(row, columns["serverPath"]) or "").strip().strip("/")
        extension = path.suffix.lower()
        records.append({
            "recordType": "DocumentSourceMetadata",
            "action": "REVIEW",
            "sourceSystem": "SHAREPOINT_IQY_EXPORT",
            "sourceRelativePath": f"{server_path}/{filename}" if server_path else filename,
            "filename": filename,
            "extension": extension or None,
            "sourceLastModifiedAt": excel_datetime(cell(row, columns["modified"])),
            "sourceLastModifiedBy": cell(row, columns["modifiedBy"]),
            "sharePointItemType": item_type,
            "workNumberCandidate": work_number(filename, server_path),
            "relevance": "POTENTIAL_IMPORT_DOCUMENT" if extension in RELEVANT_EXTENSIONS else "DOCUMENT_METADATA_ONLY",
            "sourceSheet": workbook["sheets"][0]["name"],
            "sourceLogicalRow": logical_row,
            "errors": ["source_created_at_not_present_in_export", "requires_project_link_review"],
        })
    records.sort(key=lambda item: (item["sourceRelativePath"].lower(), item["filename"].lower()))
    return {
        "mode": "preview",
        "databaseWrite": False,
        "macroExecution": False,
        "summary": {
            "metadataRecordCount": len(records),
            "folderMetadataExcludedCount": folder_count,
            "excludedByExtension": dict(sorted(excluded.items())),
            "potentialImportDocumentCount": sum(record["relevance"] == "POTENTIAL_IMPORT_DOCUMENT" for record in records),
            "workNumberCandidateCount": len({record["workNumberCandidate"] for record in records if record["workNumberCandidate"]}),
            "extensions": dict(sorted(Counter(record["extension"] or "no_extension" for record in records).items())),
        },
        "records": records,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Preview SharePoint .iqy metadata export without database writes")
    parser.add_argument("--input-xlsx", required=True, type=Path)
    parser.add_argument("--output-json", required=True, type=Path)
    parser.add_argument("--max-rows", type=int, default=20000)
    args = parser.parse_args()
    workbook = parse_workbook(args.input_xlsx, row_limit=args.max_rows)
    payload = preview(workbook)
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
