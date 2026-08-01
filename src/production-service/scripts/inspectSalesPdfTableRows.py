#!/usr/bin/env python3
"""Export raw candidate rows from a Sales PDF table for parser diagnostics.

This is a read-only diagnostic. It preserves the PDF table extractor's cell
order so layout-specific parser rules can be tested without altering a source
PDF, spreadsheet, database or API.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pdfplumber


POSITION = re.compile(r"^\s*\d{1,3}\s*[.)]\s*$")


def clean(value: object) -> str:
    return " ".join(str(value or "").replace("\n", " ").split())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-pdf", type=Path, help="PDF to inspect; omit only when the current folder has exactly one PDF")
    parser.add_argument("--output-json", required=True, type=Path)
    args = parser.parse_args()
    if args.input_pdf is None:
        matches = list(Path(".").glob("*.pdf"))
        if len(matches) != 1:
            raise SystemExit("--input-pdf is required unless the current folder has exactly one PDF")
        args.input_pdf = matches[0]
    if args.input_pdf.suffix.casefold() != ".pdf" or not args.input_pdf.is_file():
        raise SystemExit("input must be an existing PDF")
    rows = []
    with pdfplumber.open(args.input_pdf) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            for table_index, table in enumerate(page.extract_tables() or [], start=1):
                for row_index, row in enumerate(table, start=1):
                    if row and POSITION.match(clean(row[0])):
                        rows.append({
                            "page": page_number,
                            "table": table_index,
                            "row": row_index,
                            "cellCount": len(row),
                            "cells": [clean(value) or None for value in row],
                        })
    result = {"mode": "preview", "databaseWrite": False, "macroExecution": False, "rows": rows, "summary": {"positionRowCount": len(rows)}}
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
