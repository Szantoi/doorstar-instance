#!/usr/bin/env python3
"""Rank Sales-PDF work-number groups for controlled Doorstar import review.

This reads an existing deterministic preview JSON only. It never opens a Sales
PDF, runs a macro, calls an API or writes a database. The rank is a discovery
aid: no outcome is automatically importable or technically approved.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any


WORK_NUMBER = re.compile(r"(?<!\d)([12]\d{4})(?!\d)")
NUMERIC_TOKEN = re.compile(r"(?<!\d)(\d+)(?!\d)")
CUSTOMER_CONTAMINATION = re.compile(r"\bds(?:mr|ar)\s*[12]\d{4}\b", re.IGNORECASE)
OPENING_REVIEW_RANGES = {
    "openingWidthMm": (300, 5000),
    "openingHeightMm": (1200, 5000),
    "openingDepthMm": (30, 2000),
}


def canonical_work_number(value: Any) -> str | None:
    match = WORK_NUMBER.search(str(value or ""))
    return match.group(1) if match else None


def document_key(preview: dict[str, Any]) -> tuple[int, str]:
    document = preview["document"]
    return (0 if preview.get("sourceRoot") == "SALES_FOLDER" else 1, str(document.get("relativePath", "")).casefold())


def complete_position(target: dict[str, Any]) -> bool:
    return bool(target.get("code")) and bool(target.get("name")) and isinstance(target.get("quantity"), int) and target["quantity"] > 0


def complete_opening(target: dict[str, Any]) -> bool:
    return all(isinstance(target.get(field), (int, float)) and target[field] > 0 for field in OPENING_REVIEW_RANGES)


def plausible_opening(target: dict[str, Any]) -> bool:
    return complete_opening(target) and all(
        lower <= target[field] <= upper
        for field, (lower, upper) in OPENING_REVIEW_RANGES.items()
    )


def assess(work_number: str, previews: list[dict[str, Any]]) -> dict[str, Any]:
    by_hash: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for preview in previews:
        by_hash[str(preview["document"].get("contentSha256", ""))].append(preview)
    selected_by_hash = {content_hash: sorted(items, key=document_key)[0] for content_hash, items in by_hash.items()}
    content_revisions = sorted(selected_by_hash.values(), key=document_key)
    selected = content_revisions[0] if len(content_revisions) == 1 else None
    labels = sorted({str(item.get("salesOrder", {}).get("workNumber", "")) for item in previews})
    result: dict[str, Any] = {
        "workNumber": work_number,
        "sourceWorkNumberLabels": labels,
        "contentRevisionCount": len(content_revisions),
        "sameContentReferenceCount": len(previews),
        "contentRevisions": [{
            "contentSha256": item["document"]["contentSha256"], "sourceRoot": item["sourceRoot"],
            "relativePath": item["document"]["relativePath"], "displayName": item["document"]["displayName"],
        } for item in content_revisions],
        "state": "REVISION_SELECTION_REQUIRED" if len(content_revisions) > 1 else "PENDING_ASSESSMENT",
        "issues": [],
        "databaseWrite": False,
    }
    if not selected:
        result["issues"].append("multiple_sales_pdf_content_revisions")
        return result

    sales = selected.get("salesOrder", {})
    positions = selected.get("positionCandidates", [])
    targets = [item.get("target", {}) for item in positions if isinstance(item, dict)]
    valid_basics = sum(1 for target in targets if complete_position(target))
    complete_openings = sum(1 for target in targets if complete_opening(target))
    plausible_openings = sum(1 for target in targets if plausible_opening(target))
    if not sales.get("customerName"):
        result["issues"].append("customer_missing")
    elif CUSTOMER_CONTAMINATION.search(str(sales["customerName"])):
        result["issues"].append("customer_name_contains_document_identifier")
    raw_source_work_number = str(sales.get("workNumber") or "")
    header_work_number = canonical_work_number(raw_source_work_number)
    path_work_number = canonical_work_number(selected["document"].get("relativePath"))
    source_numeric_tokens = NUMERIC_TOKEN.findall(raw_source_work_number)
    if (header_work_number and header_work_number != work_number) or (path_work_number and path_work_number != work_number) or any(len(token) != 5 for token in source_numeric_tokens if len(token) >= 5):
        result["issues"].append("sales_header_or_filename_work_number_mismatch")
    if not targets:
        result["issues"].append("no_door_position_candidates")
    if valid_basics != len(targets):
        result["issues"].append("position_identity_or_quantity_missing")
    if complete_openings != len(targets):
        result["issues"].append("opening_dimensions_missing_or_incomplete")
    if plausible_openings != len(targets):
        result["issues"].append("opening_dimensions_outside_review_range")
    expected_delivery = sales.get("expectedDelivery")
    expected_delivery_text = sales.get("expectedDeliveryText")
    if not expected_delivery and expected_delivery_text:
        result["issues"].append("expected_delivery_is_free_text")
    result.update({
        "sourceWorkNumber": sales.get("workNumber"),
        "headerWorkNumberCandidate": header_work_number,
        "pathWorkNumberCandidate": path_work_number,
        "customerName": sales.get("customerName"),
        "canonicalDocument": {
            "contentSha256": selected["document"]["contentSha256"], "sourceRoot": selected["sourceRoot"],
            "relativePath": selected["document"]["relativePath"], "displayName": selected["document"]["displayName"],
        },
        "positionCandidateCount": len(targets),
        "positionsWithCompleteIdentityAndQuantity": valid_basics,
        "positionsWithCompleteOpeningDimensions": complete_openings,
        "positionsWithPlausibleOpeningDimensions": plausible_openings,
        "expectedDelivery": expected_delivery,
        "expectedDeliveryText": expected_delivery_text,
        "supplementaryProductCandidateCount": len(selected.get("supplementaryProductCandidates", [])),
    })
    if result["issues"]:
        result["state"] = "REVIEW_REQUIRED"
    else:
        result["state"] = "TECHNICAL_REVIEW_READY"
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-json", required=True, type=Path)
    parser.add_argument("--output-json", required=True, type=Path)
    args = parser.parse_args()
    payload = json.loads(args.input_json.read_text(encoding="utf-8"))
    if payload.get("mode") != "preview" or payload.get("databaseWrite") is not False or payload.get("macroExecution") is not False:
        raise ValueError("input must be a macro-free, database-write-free preview")
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in payload.get("salesOrderPdfPreviews", []):
        if not isinstance(item, dict):
            continue
        work_number = canonical_work_number(item.get("salesOrder", {}).get("workNumber")) or canonical_work_number(item.get("document", {}).get("relativePath"))
        if work_number:
            grouped[work_number].append(item)
    records = [assess(work_number, grouped[work_number]) for work_number in sorted(grouped)]
    first_test_candidates = [record for record in records if record["state"] == "TECHNICAL_REVIEW_READY" and 2 <= record.get("positionCandidateCount", 0) <= 5]
    conditional_first_test_candidates = [
        record for record in records
        if record["state"] == "REVIEW_REQUIRED"
        and 2 <= record.get("positionCandidateCount", 0) <= 5
        and set(record["issues"]) <= {"expected_delivery_is_free_text"}
    ]
    result = {
        "mode": "preview", "databaseWrite": False, "macroExecution": False,
        "profile": "sales-pdf-import-readiness-v1",
        "scope": "Sales-PDF-only; survey, deadline and CAD reconciliation remain mandatory.",
        "records": records,
        "firstTestCandidates": first_test_candidates,
        "conditionalFirstTestCandidates": conditional_first_test_candidates,
        "summary": {
            "workNumberCount": len(records),
            "technicalReviewReadyCount": sum(1 for record in records if record["state"] == "TECHNICAL_REVIEW_READY"),
            "reviewRequiredCount": sum(1 for record in records if record["state"] == "REVIEW_REQUIRED"),
            "revisionSelectionRequiredCount": sum(1 for record in records if record["state"] == "REVISION_SELECTION_REQUIRED"),
            "firstTestCandidateCount": len(first_test_candidates),
            "conditionalFirstTestCandidateCount": len(conditional_first_test_candidates),
        },
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
