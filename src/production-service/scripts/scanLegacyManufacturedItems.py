#!/usr/bin/env python3
"""Read-only panel/front evidence scanner for legacy XLSX/XLSM workbooks.

This is deliberately a preview tool: it reads cached OOXML values only,
ignores ``vbaProject.bin`` and formulas, writes JSON evidence, and has no
database client.  A keyword hit alone is schema evidence; a candidate also
needs an explicit numeric value in the same row and remains human-reviewable.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from previewLegacyOrderImport import is_excluded, normalized, parse_workbook, safe_relative, source_file_hash


ITEM_KINDS = {
    "WALL_PANEL": ("falpanel", "wall panel"),
    "FURNITURE_FRONT": ("butorfront", "bútorfront", "fiokelo", "fiókelő", "butorajto", "bútorajtó"),
}
NUMERIC_VALUE = re.compile(r"(?<![A-Za-z])\d+(?:[.,]\d+)?")
DATA_SHEET_TERMS = ("keszmeret", "falpanel", "butorfront", "tetelek")
CONFIG_SHEET_TERMS = ("valtozo", "parameter", "beallitas", "seged")


def item_kind(row: list[object]) -> str | None:
    source = normalized(" ".join(str(value) for value in row if value not in (None, "")))
    for kind, terms in ITEM_KINDS.items():
        if any(normalized(term) in source for term in terms):
            return kind
    return None


def has_explicit_numeric_value(row: list[object]) -> bool:
    return any(isinstance(value, (int, float)) and not isinstance(value, bool) or NUMERIC_VALUE.search(str(value)) for value in row if value not in (None, ""))


def is_data_sheet(sheet_name: str) -> bool:
    name = normalized(sheet_name)
    return any(term in name for term in DATA_SHEET_TERMS) and not any(term in name for term in CONFIG_SHEET_TERMS)


def numeric_value(value: object) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    try:
        return float(str(value).strip().replace(",", "."))
    except ValueError:
        return None


def structured_columns(rows: list[list[object]]) -> dict[str, int] | None:
    """Find a real manufactured-item table header, not generic workbook text."""
    for row in rows[:20]:
        columns = structured_columns_in_row(row)
        if columns:
            return columns
    return None


def structured_columns_in_row(row: list[object]) -> dict[str, int] | None:
    labels = [normalized(value) for value in row]
    width = next((index for index, label in enumerate(labels) if "szelesseg" in label), None)
    height = next((index for index, label in enumerate(labels) if "hosszusag" in label or "magassag" in label), None)
    quantity = next((index for index, label in enumerate(labels) if "darab" in label or "mennyiseg" in label), None)
    if width is not None and height is not None and quantity is not None:
        return {"width": width, "height": height, "quantity": quantity}
    return None


def structured_header_rows(rows: list[list[object]]) -> list[object] | None:
    return next((row for row in rows[:20] if structured_columns_in_row(row)), None)


def sheet_measurement_unit(rows: list[list[object]]) -> str | None:
    preamble = normalized(" ".join(str(value) for row in rows[:5] for value in row if value not in (None, "")))
    if "cm" in preamble:
        return "cm"
    if " mm" in f" {preamble}":
        return "mm"
    return None


def structured_measurements(row: list[object], columns: dict[str, int]) -> dict[str, float] | None:
    values = {name: numeric_value(row[index]) if index < len(row) else None for name, index in columns.items()}
    if any(value is None or value <= 0 for value in values.values()):
        return None
    return {"width": values["width"], "height": values["height"], "quantity": values["quantity"]}


def structured_field_values(row: list[object], header: list[object] | None) -> dict[str, object] | None:
    """Keep the visible source fields beside a candidate; do not infer fields."""
    if not header:
        return None
    fields: dict[str, object] = {}
    for index, label in enumerate(header):
        name = str(label).strip() if label is not None else ""
        if not name or index >= len(row) or row[index] in (None, ""):
            continue
        fields[name] = row[index]
    return fields or None


def scan_workbook(path: Path, root: Path, max_rows_per_sheet: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]], bool]:
    workbook = parse_workbook(path, row_limit=max_rows_per_sheet)
    relative_path = safe_relative(path, root)
    source_file = f"archive/{relative_path}"
    content_hash = source_file_hash(path)
    evidence: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    for sheet in workbook["sheets"]:
        columns = structured_columns(sheet["rows"])
        header = structured_header_rows(sheet["rows"])
        measurement_unit = sheet_measurement_unit(sheet["rows"])
        for logical_row, row in enumerate(sheet["rows"], start=1):
            kind = item_kind(row)
            if not kind:
                continue
            cells = [str(value).strip() for value in row if str(value).strip()]
            record = {
                "recordType": "ManufacturedItemEvidence",
                "itemKind": kind,
                "sourceFile": source_file,
                "relativePath": relative_path,
                "contentSha256": content_hash,
                "sheet": sheet["name"],
                "logicalRow": logical_row,
                "extractionState": "UNVERIFIED",
                "rawCells": cells,
            }
            evidence.append(record)
            # Shared templates and parameter sheets contain defaults, not work items.
            measurements = structured_measurements(row, columns) if columns else None
            if is_data_sheet(sheet["name"]) and (measurements is not None if columns else has_explicit_numeric_value(row)):
                candidates.append({
                    **record,
                    "recordType": "ManufacturedItemCandidate",
                    "action": "REVIEW",
                    "cachedMeasurements": measurements,
                    "cachedMeasurementUnit": measurement_unit,
                    "cachedFields": structured_field_values(row, header),
                    "errors": ["requires_dimension_and_quantity_field_mapping", "requires_human_review"],
                })
    return evidence, candidates, bool(workbook["containsVba"])


def main() -> int:
    parser = argparse.ArgumentParser(description="Macro-free panel/front evidence scan for legacy workbooks")
    parser.add_argument("--archive-root", required=True, type=Path, help="Read-only legacy archive root")
    parser.add_argument("--output-json", required=True, type=Path, help="JSON evidence output")
    parser.add_argument("--max-rows-per-sheet", type=int, default=500, help="Cached rows to inspect per sheet (default: 500)")
    args = parser.parse_args()
    if not args.archive_root.is_dir():
        print(f"archive root does not exist: {args.archive_root}", file=sys.stderr)
        return 2
    if args.max_rows_per_sheet < 1:
        print("max rows per sheet must be positive", file=sys.stderr)
        return 2

    excluded: Counter[str] = Counter()
    evidence: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    macro_containers: list[str] = []
    workbook_count = 0
    for path in sorted(args.archive_root.rglob("*"), key=lambda item: item.as_posix().lower()):
        if not path.is_file():
            continue
        if is_excluded(path):
            excluded[path.suffix.lower() or "temporary"] += 1
            continue
        if path.suffix.lower() not in {".xlsx", ".xlsm"}:
            continue
        workbook_count += 1
        try:
            rows, item_candidates, contains_vba = scan_workbook(path, args.archive_root, args.max_rows_per_sheet)
        except Exception as error:  # Preview should report malformed legacy files rather than stop the batch.
            evidence.append({"recordType": "ScanIssue", "sourceFile": f"archive/{safe_relative(path, args.archive_root)}", "error": str(error)})
            continue
        evidence.extend(rows)
        candidates.extend(item_candidates)
        if contains_vba:
            macro_containers.append(safe_relative(path, args.archive_root))

    payload = {
        "mode": "preview",
        "databaseWrite": False,
        "macroExecution": False,
        "summary": {
            "workbookCount": workbook_count,
            "schemaEvidenceCount": len(evidence),
            "reviewCandidateCount": len(candidates),
            "macroContainerCount": len(macro_containers),
            "excludedByExtension": dict(sorted(excluded.items())),
        },
        "records": sorted(evidence + candidates, key=lambda item: (item.get("sourceFile", ""), item.get("sheet", ""), item.get("logicalRow", 0), item["recordType"])),
        "macroContainersIgnored": macro_containers,
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
