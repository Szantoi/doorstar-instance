#!/usr/bin/env python3
"""Read-only batch index for Doorstar GYÁRTÁSMEGRENDELÉS Sales PDFs.

The script imports the single-PDF preview parser and scans one or more labelled
source roots.  It never changes source files, executes macros, calls an API or
writes a database.  Every entry retains only a source-root label and a relative
path; the output flags same-hash copies and work-number groups for review.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

from extractSalesOrderPdfPreview import parse_pdf


CANONICAL_WORK_NUMBER = re.compile(r"(?<!\d)([12]\d{4})(?!\d)")


def normalise(value: str) -> str:
    text = unicodedata.normalize("NFKD", value)
    return "".join(char for char in text if not unicodedata.combining(char)).casefold()


def is_sales_order_pdf(path: Path) -> bool:
    return path.suffix.casefold() == ".pdf" and "gyartasmegrendel" in normalise(path.name)


def canonical_work_number(value: object) -> str | None:
    match = CANONICAL_WORK_NUMBER.search(str(value or ""))
    return match.group(1) if match else None


def resolve_work_number(preview: dict[str, Any]) -> dict[str, Any]:
    raw_header = preview["salesOrder"].get("workNumber")
    header_candidate = canonical_work_number(raw_header)
    path_candidate = canonical_work_number(preview["document"].get("relativePath"))
    if header_candidate and (not path_candidate or header_candidate == path_candidate):
        return {"candidate": header_candidate, "headerCandidate": header_candidate, "pathCandidate": path_candidate, "state": "SALES_HEADER", "reviewRequired": False}
    if header_candidate and path_candidate and header_candidate != path_candidate:
        return {"candidate": header_candidate, "headerCandidate": header_candidate, "pathCandidate": path_candidate, "state": "HEADER_PATH_CONFLICT", "reviewRequired": True}
    if path_candidate:
        return {"candidate": path_candidate, "headerCandidate": header_candidate, "pathCandidate": path_candidate, "state": "DOCUMENT_PATH_FALLBACK", "reviewRequired": True}
    return {"candidate": None, "headerCandidate": header_candidate, "pathCandidate": path_candidate, "state": "UNRESOLVED", "reviewRequired": True}


def parse_source(value: str) -> tuple[str, Path]:
    if "=" not in value:
        raise argparse.ArgumentTypeError("source must be LABEL=PATH")
    label, raw_path = value.split("=", 1)
    path = Path(raw_path)
    if not label.strip() or not path.is_dir():
        raise argparse.ArgumentTypeError("source label must be non-empty and path must be an existing directory")
    return label.strip(), path.resolve()


def error_preview(path: Path, root: Path, label: str, error: Exception) -> dict[str, Any]:
    relative_path = path.resolve().relative_to(root).as_posix()
    return {
        "mode": "preview",
        "databaseWrite": False,
        "macroExecution": False,
        "sourceAuthority": "SALES_TO_WORKSHOP_GYARTASMEGRENDELES",
        "document": {"displayName": path.name, "relativePath": relative_path, "source": "LEGACY_FOLDER", "kind": "SALES_ORDER"},
        "salesOrder": {"workNumber": None, "customerName": None, "reviewRequired": True},
        "positionCandidates": [],
        "supplementaryProductCandidates": [],
        "pages": [],
        "summary": {"pageCount": 0, "positionCandidateCount": 0, "supplementaryProductCandidateCount": 0, "positionsWithCompleteOpeningDimensions": 0, "positionsRequiringReview": 0},
        "errors": [f"sales_pdf_extraction_failed:{type(error).__name__}", "requires_visual_or_ocr_review"],
        "sourceRoot": label,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", action="append", required=True, type=parse_source, metavar="LABEL=PATH")
    parser.add_argument("--output-json", required=True, type=Path)
    parser.add_argument("--max-files", type=int, default=0, help="test-only cap; 0 processes every matching PDF")
    args = parser.parse_args()
    if args.max_files < 0:
        raise SystemExit("max-files cannot be negative")

    inputs: list[tuple[str, Path, Path]] = []
    for label, root in args.source:
        for path in sorted((candidate for candidate in root.rglob("*.pdf") if candidate.is_file() and is_sales_order_pdf(candidate)), key=lambda item: item.as_posix().casefold()):
            inputs.append((label, root, path))
    if args.max_files:
        inputs = inputs[: args.max_files]

    previews: list[dict[str, Any]] = []
    for label, root, path in inputs:
        try:
            preview = parse_pdf(path, root, label)
            preview["sourceRoot"] = label
        except Exception as error:  # source errors become visible review records
            preview = error_preview(path, root, label, error)
        previews.append(preview)

    by_hash: dict[str, list[dict[str, str]]] = defaultdict(list)
    by_work_number: dict[str, list[dict[str, str]]] = defaultdict(list)
    by_canonical_work_number: dict[str, list[dict[str, str]]] = defaultdict(list)
    for preview in previews:
        resolution = resolve_work_number(preview)
        preview["workNumberResolution"] = resolution
        document = preview["document"]
        locator = {"sourceRoot": preview["sourceRoot"], "relativePath": document["relativePath"], "displayName": document["displayName"]}
        if document.get("contentSha256"):
            by_hash[document["contentSha256"]].append(locator)
        if preview["salesOrder"].get("workNumber"):
            by_work_number[str(preview["salesOrder"]["workNumber"])].append(locator)
        canonical = resolution["candidate"]
        if canonical:
            by_canonical_work_number[canonical].append({
                **locator,
                "sourceWorkNumber": str(preview["salesOrder"].get("workNumber")),
                "resolutionState": resolution["state"],
                "headerCandidate": resolution["headerCandidate"],
                "pathCandidate": resolution["pathCandidate"],
            })
    duplicates = [
        {"contentSha256": content_hash, "documents": documents}
        for content_hash, documents in sorted(by_hash.items())
        if len(documents) > 1
    ]
    work_groups = [
        {"workNumber": work_number, "documents": documents}
        for work_number, documents in sorted(by_work_number.items(), key=lambda item: item[0])
    ]
    canonical_work_groups = [
        {
            "canonicalWorkNumber": work_number,
            "sourceWorkNumberVariants": sorted({document["sourceWorkNumber"] for document in documents}),
            "documents": documents,
            "reviewRequired": len({document["sourceWorkNumber"] for document in documents}) > 1 or any(document["resolutionState"] != "SALES_HEADER" for document in documents),
        }
        for work_number, documents in sorted(by_canonical_work_number.items(), key=lambda item: item[0])
    ]
    result = {
        "mode": "preview",
        "databaseWrite": False,
        "macroExecution": False,
        "profile": "sales-order-pdf-batch-v1",
        "salesOrderPdfPreviews": previews,
        "sameContentDuplicates": duplicates,
        "workNumberGroups": work_groups,
        "canonicalWorkNumberGroups": canonical_work_groups,
        "summary": {
            "matchingPdfCount": len(previews),
            "workNumberCount": len(work_groups),
            "canonicalWorkNumberCount": len(canonical_work_groups),
            "canonicalWorkNumberVariantReviewCount": sum(1 for group in canonical_work_groups if group["reviewRequired"]),
            "pathFallbackWorkNumberCount": sum(1 for item in previews if item["workNumberResolution"]["state"] == "DOCUMENT_PATH_FALLBACK"),
            "headerPathWorkNumberConflictCount": sum(1 for item in previews if item["workNumberResolution"]["state"] == "HEADER_PATH_CONFLICT"),
            "unresolvedWorkNumberCount": sum(1 for item in previews if item["workNumberResolution"]["state"] == "UNRESOLVED"),
            "sameContentDuplicateGroupCount": len(duplicates),
            "doorPositionCandidateCount": sum(item["summary"]["positionCandidateCount"] for item in previews),
            "supplementaryProductCandidateCount": sum(item["summary"].get("supplementaryProductCandidateCount", 0) for item in previews),
            "failedExtractionCount": sum(1 for item in previews if item.get("errors")),
        },
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
