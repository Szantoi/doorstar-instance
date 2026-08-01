#!/usr/bin/env python3
"""Read cached deadline-workbook rows for one Doorstar work number.

This diagnostic uses the existing OOXML cache-only reader.  It never opens
Excel, runs a macro/formula/Power Query, calls an API, or writes a database.
The JSON result contains a source label and relative path only.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from previewLegacyOrderImport import display_value, header_row, normalized, parse_workbook


WORK_NUMBER = re.compile(r"(?<!\d)([12]\d{4})(?!\d)")


def row_work_numbers(row: list[object]) -> set[str]:
    numbers: set[str] = set()
    for value in row:
        if isinstance(value, (int, float)) and not isinstance(value, bool) and int(value) == value:
            numeric = str(int(value))
            if WORK_NUMBER.fullmatch(numeric):
                numbers.add(numeric)
        numbers.update(match.group(1) for match in WORK_NUMBER.finditer(display_value(value)))
    return numbers


def is_work_number_header(header: str | None) -> bool:
    value = normalized(header)
    return ("megr" in value and "szam" in value) or "munkaszam" in value or "projekt" in value


def field_value(header: str | None, value: object) -> str:
    if is_work_number_header(header) and isinstance(value, (int, float)) and not isinstance(value, bool) and int(value) == value:
        return str(int(value))
    return display_value(value)


def row_match_reason(row: list[object], work_number: str, text_query: str | None) -> str | None:
    if work_number in row_work_numbers(row):
        return "WORK_NUMBER_EXACT"
    row_text = " ".join(display_value(value) for value in row).casefold()
    return "TEXT_FALLBACK" if text_query and text_query.casefold() in row_text else None


def row_matches(row: list[object], work_number: str, text_query: str | None) -> bool:
    return row_match_reason(row, work_number, text_query) is not None


def inspect_work_number(workbook: dict[str, Any], work_number: str, source_label: str, relative_path: str, text_query: str | None = None) -> dict[str, Any]:
    matches: list[dict[str, Any]] = []
    for sheet in workbook.get("sheets", []):
        rows = sheet.get("rows", [])
        header_index, headers = header_row(rows)
        for row_index, row in enumerate(rows, start=1):
            match_reason = row_match_reason(row, work_number, text_query)
            if not match_reason:
                continue
            fields = [
                {
                    "columnIndex": index + 1,
                    "header": headers[index] if header_index is not None and index < len(headers) and headers[index] else None,
                    "rawValue": field_value(headers[index] if header_index is not None and index < len(headers) else None, value),
                }
                for index, value in enumerate(row)
                if display_value(value)
            ]
            matches.append({
                "sourceLabel": source_label,
                "relativePath": relative_path,
                "sheet": sheet.get("name"),
                "row": row_index,
                "headerRow": header_index + 1 if header_index is not None else None,
                "matchReason": match_reason,
                "fields": fields,
                "reviewRequired": True,
            })
    return {
        "mode": "preview",
        "databaseWrite": False,
        "macroExecution": False,
        "workNumber": work_number,
        "textQuery": text_query or None,
        "containsVba": bool(workbook.get("containsVba")),
        "matches": matches,
        "summary": {
            "matchCount": len(matches),
            "exactWorkNumberMatchCount": sum(item["matchReason"] == "WORK_NUMBER_EXACT" for item in matches),
            "textFallbackMatchCount": sum(item["matchReason"] == "TEXT_FALLBACK" for item in matches),
            "reviewRequired": True,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-xlsx", required=True, type=Path)
    parser.add_argument("--source-label", required=True)
    parser.add_argument("--source-relative-path", required=True)
    parser.add_argument("--work-number", required=True)
    parser.add_argument("--text-query", help="Optional customer/name fallback; rows match the work number OR this text")
    parser.add_argument("--output-json", required=True, type=Path)
    args = parser.parse_args()
    if not WORK_NUMBER.fullmatch(args.work_number):
        raise ValueError("work number must be a 5-digit Doorstar identifier beginning with 1 or 2")
    result = inspect_work_number(
        parse_workbook(args.input_xlsx, row_limit=None),
        args.work_number,
        args.source_label,
        args.source_relative_path,
        args.text_query,
    )
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
