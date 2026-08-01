#!/usr/bin/env python3
"""Validate a Sales-PDF batch preview without writing to Doorstar data stores."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


ABSOLUTE_PATH = re.compile(r"^(?:[A-Za-z]:[\\/]|[\\/])")
HASH = re.compile(r"^[a-f0-9]{64}$", re.IGNORECASE)
OPENING_REVIEW_RANGES = {
    "openingWidthMm": (300, 5000),
    "openingHeightMm": (1200, 5000),
    "openingDepthMm": (30, 2000),
}


def finding(severity: str, code: str, locator: str, message: str) -> dict[str, str]:
    return {"severity": severity, "code": code, "locator": locator, "message": message}


def is_positive_integer(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def validate(data: dict[str, Any]) -> dict[str, Any]:
    findings: list[dict[str, str]] = []
    if data.get("mode") != "preview":
        findings.append(finding("ERROR", "mode_not_preview", "batch", "batch mode must be preview"))
    if data.get("databaseWrite") is not False:
        findings.append(finding("ERROR", "database_write_not_disabled", "batch", "databaseWrite must be false"))
    if data.get("macroExecution") is not False:
        findings.append(finding("ERROR", "macro_execution_not_disabled", "batch", "macroExecution must be false"))

    documents = data.get("salesOrderPdfPreviews", [])
    for index, preview in enumerate(documents, start=1):
        document = preview.get("document", {})
        relative_path = str(document.get("relativePath") or "")
        locator = f"document[{index}]/{relative_path or 'unknown'}"
        if not relative_path or ABSOLUTE_PATH.search(relative_path) or ".." in relative_path.replace("\\", "/").split("/"):
            findings.append(finding("ERROR", "invalid_relative_path", locator, "document path must be a safe relative path"))
        content_hash = document.get("contentSha256")
        if content_hash and not HASH.fullmatch(str(content_hash)):
            findings.append(finding("ERROR", "invalid_content_hash", locator, "content hash is not SHA-256"))
        sales_order = preview.get("salesOrder", {})
        for field in ("workNumber", "customerName"):
            if not sales_order.get(field):
                findings.append(finding("WARNING", f"sales_{field}_missing", locator, f"Sales PDF has no extracted {field}"))
        for position_index, candidate in enumerate(preview.get("positionCandidates", []), start=1):
            target = candidate.get("target", {})
            position_locator = f"{locator}/position[{position_index}]"
            for field in ("code", "name"):
                if not target.get(field):
                    findings.append(finding("ERROR", f"position_{field}_missing", position_locator, f"position {field} is required"))
            if not is_positive_integer(target.get("quantity")):
                findings.append(finding(
                    "WARNING",
                    "position_quantity_missing_or_unverified",
                    position_locator,
                    "source PDF has no verified positive position quantity; do not infer one",
                ))
            missing_dimensions = [field for field in ("openingWidthMm", "openingHeightMm", "openingDepthMm") if target.get(field) is None]
            if missing_dimensions:
                findings.append(finding("WARNING", "position_opening_dimension_missing", position_locator, ", ".join(missing_dimensions)))
            outside_review_range = [
                field for field, (lower, upper) in OPENING_REVIEW_RANGES.items()
                if isinstance(target.get(field), (int, float)) and not isinstance(target.get(field), bool)
                and not lower <= target[field] <= upper
            ]
            if outside_review_range:
                findings.append(finding(
                    "WARNING",
                    "position_opening_dimension_outside_review_range",
                    position_locator,
                    ", ".join(outside_review_range),
                ))
        for product_index, candidate in enumerate(preview.get("supplementaryProductCandidates", []), start=1):
            target = candidate.get("target", {})
            product_locator = f"{locator}/supplementary[{product_index}]"
            if not target.get("name"):
                findings.append(finding("ERROR", "supplementary_product_name_missing", product_locator, "supplementary product name is required"))
            if not is_positive_integer(target.get("quantity")):
                findings.append(finding(
                    "WARNING",
                    "supplementary_product_quantity_missing_or_unverified",
                    product_locator,
                    "source PDF has no verified positive supplementary-product quantity; do not infer one",
                ))

    errors = [item for item in findings if item["severity"] == "ERROR"]
    warnings = [item for item in findings if item["severity"] == "WARNING"]
    return {
        "mode": "validation-preview",
        "databaseWrite": False,
        "macroExecution": False,
        "inputRecordCount": len(documents),
        "summary": {"errorCount": len(errors), "warningCount": len(warnings), "passed": not errors},
        "findings": findings,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-json", required=True, type=Path)
    parser.add_argument("--output-json", required=True, type=Path)
    parser.add_argument("--fail-on-error", action="store_true")
    args = parser.parse_args()
    data = json.loads(args.input_json.read_text(encoding="utf-8"))
    result = validate(data)
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False, sort_keys=True))
    if args.fail_on_error and not result["summary"]["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
