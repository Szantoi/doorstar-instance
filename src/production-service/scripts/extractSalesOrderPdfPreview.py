#!/usr/bin/env python3
"""Build a deterministic, review-only preview from a Doorstar GYÁRTÁSMEGRENDELÉS PDF.

The PDF is the Sales-to-workshop order hand-off.  This script reads it without
altering the source and never opens Excel, executes macros, calls an API or
writes a database.  It retains page/table/row evidence so a surveyor can decide
which Sales values become the technically final order revision.

Run with the bundled workspace Python, which supplies ``pdfplumber``.  The
output contains only relative source paths and is intentionally REVIEW-only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

try:
    import pdfplumber
except ImportError:  # pragma: no cover - environment guard
    pdfplumber = None


def require_pdfplumber() -> None:
    if pdfplumber is None:
        raise RuntimeError(
            "pdfplumber is required. Use the bundled workspace Python supplied by "
            "codex_app__load_workspace_dependencies; no package installation is performed."
        )


POSITION = re.compile(r"^\s*(\d{1,3})\s*[.)]\s*$")
PHONE = re.compile(r"(?:\+36|06)[\s.-]*\(?\d{1,2}\)?[\s.-]*\d{3}[\s.-]*\d{3,4}")
NUMBER = re.compile(r"-?\d+(?:[,.]\d+)?")
TEXT_WORK_NUMBER = re.compile(r"\bDSMR\s*([12]\d{4})\b", re.IGNORECASE)
TEXT_CUSTOMER = re.compile(r"(?:Név|Nev)\s*:\s*(.+?)(?=\s+DSMR\b|\s+(?:Cím|Cim)\b|\n|$)", re.IGNORECASE)
TEXT_DELIVERY_ADDRESS = re.compile(r"(?:Szállítási cím|Szallitasi cim)\s*:\s*(.+?)(?=\s+DSMR\b|\n|$)", re.IGNORECASE)
TEXT_EXPECTED_DELIVERY = re.compile(r"Várható szállítási idő\s*:\s*(.+?)(?=\s+Pontos méretfelvételtől|\n|$)", re.IGNORECASE)
TEXT_ORDER_DATE = re.compile(r"Kelte\s*:\s*(\d{4}\.\d{2}\.\d{2})", re.IGNORECASE)
LINEAR_METRES_PER_PIECE = re.compile(r"(\d+(?:[,.]\d+)?)\s*fm\s*/\s*sz[áa]l", re.IGNORECASE)


def normalise(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(text.casefold().split())


def clean(value: object) -> str:
    return " ".join(str(value or "").replace("\n", " ").split())


def plausible_delivery_address(value: str | None) -> str | None:
    if not value:
        return None
    forbidden = ("kell szamolni", "varhato szallitasi", "meretfelvetel", "ervenyessege")
    return value if not any(token in normalise(value) for token in forbidden) else None


def plausible_delivery_text(value: str | None) -> str | None:
    if not value:
        return None
    forbidden = ("kelte", "ervenyessege", "meretfelvetel", "kell szamolni")
    return value if not any(token in normalise(value) for token in forbidden) else None


def source_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def as_number(value: object) -> float | None:
    cleaned = clean(value)
    # pdfplumber can split a compact numeric cell into spaced glyphs (for
    # example ``71`` becomes ``7 1``).  Rejoin only a cell made exclusively of
    # single digits separated by whitespace; prose and decimal values stay
    # unchanged.
    if re.fullmatch(r"\d(?:\s+\d)+", cleaned):
        cleaned = re.sub(r"\s+", "", cleaned)
    match = NUMBER.search(cleaned)
    if not match:
        return None
    return float(match.group(0).replace(",", "."))


def mm_from_cm(value: object) -> int | None:
    number = as_number(value)
    if number is None:
        return None
    return round(number * 10)


def cell(row: list[object], index: int) -> str:
    return clean(row[index]) if index < len(row) else ""


def label_value(tables: list[list[list[object]]], label: str) -> str | None:
    wanted = normalise(label).rstrip(":")
    for table in tables:
        for row in table:
            for index, value in enumerate(row):
                if normalise(value).rstrip(":") == wanted:
                    next_value = cell(row, index + 1)
                    if next_value:
                        return next_value
    return None


def label_value_any(tables: list[list[list[object]]], labels: list[str]) -> str | None:
    for label in labels:
        value = label_value(tables, label)
        if value:
            return value
    return None


def value_below(tables: list[list[list[object]]], label: str) -> str | None:
    wanted = normalise(label).rstrip(":")
    for table in tables:
        for row_index, row in enumerate(table):
            if any(normalise(value).rstrip(":") == wanted for value in row):
                for candidate in table[row_index + 1 :]:
                    values = [clean(value) for value in candidate if clean(value)]
                    if values:
                        return values[-1]
    return None


def value_below_any(tables: list[list[list[object]]], labels: list[str]) -> str | None:
    for label in labels:
        value = value_below(tables, label)
        if value:
            return value
    return None


def position_rows(page: int, tables: list[list[list[object]]]) -> list[tuple[int, list[object]]]:
    rows: list[tuple[int, list[object]]] = []
    for table in tables:
        for row_index, row in enumerate(table, start=1):
            if POSITION.match(cell(row, 0)) and len(row) >= 19:
                rows.append((row_index, row))
    return rows


def supplementary_product_rows(tables: list[list[list[object]]]) -> list[tuple[int, list[object]]]:
    """Find compact accessory rows without treating them as door positions."""
    rows: list[tuple[int, list[object]]] = []
    for table in tables:
        for row_index, row in enumerate(table, start=1):
            if POSITION.match(cell(row, 0)) and 5 <= len(row) < 19 and cell(row, 1):
                rows.append((row_index, row))
    return rows


def wall_treatment(notes: str) -> str | None:
    value = normalise(notes)
    if "blende" in value:
        return "BLENDE"
    if "falpanel" in value:
        return "WALL_PANEL"
    return None


def evidence(field: str, raw: str, normalised: object, page: int, row: int, source_root: str, relative_path: str) -> dict[str, Any]:
    return {
        "field": field,
        "rawValue": raw,
        "normalizedValue": normalised,
        "sourceRoot": source_root,
        "relativePath": relative_path,
        "page": page,
        "row": row,
        "confidence": 0.85,
        "reviewState": "REVIEW",
    }


def candidate_from_row(page: int, row_index: int, row: list[object], source_root: str, relative_path: str) -> dict[str, Any]:
    code = POSITION.match(cell(row, 0)).group(1)  # validated by position_rows
    name = cell(row, 1)
    shifted_after_name = not cell(row, 2) and all(as_number(cell(row, index)) is not None for index in (3, 4, 5))
    index_offset = 1 if shifted_after_name else 0
    width_raw, height_raw, depth_raw = cell(row, 2 + index_offset), cell(row, 3 + index_offset), cell(row, 4 + index_offset)
    direction, product_type, lock = cell(row, 5 + index_offset), cell(row, 6 + index_offset), cell(row, 7 + index_offset)
    keyhole_and_hinge, hinge_supplement = cell(row, 8 + index_offset), cell(row, 9 + index_offset)
    lap_blende, tok_blende = cell(row, 10 + index_offset), cell(row, 11 + index_offset)
    lap_colour, tok_colour = cell(row, 12 + index_offset), cell(row, 13 + index_offset)
    lap_pattern, tok_pattern = cell(row, 14 + index_offset), cell(row, 15 + index_offset)
    casing_type, notes, quantity_raw = cell(row, 16 + index_offset), cell(row, 17 + index_offset), cell(row, 18 + index_offset)
    quantity = as_number(quantity_raw)
    if quantity is None or int(quantity) != quantity or quantity <= 0:
        errors = ["quantity_not_extracted_from_sales_pdf"]
        quantity_value = None
    else:
        errors = []
        quantity_value = int(quantity)

    raw_attributes = {
        "lock": lock or None,
        "keyholeAndHinge": keyhole_and_hinge or None,
        "hingeSupplement": hinge_supplement or None,
        "lapSideBlende": lap_blende or None,
        "tokSideBlende": tok_blende or None,
        "lapColour": lap_colour or None,
        "tokColour": tok_colour or None,
        "lapPattern": lap_pattern or None,
        "tokPattern": tok_pattern or None,
        "casingProfileRaw": casing_type or None,
    }
    target = {
        "code": code,
        "name": name,
        "quantity": quantity_value,
        "productType": product_type or None,
        "openingDirection": direction or None,
        "openingWidthMm": mm_from_cm(width_raw),
        "openingHeightMm": mm_from_cm(height_raw),
        "openingDepthMm": mm_from_cm(depth_raw),
        "doorWidthMm": None,
        "doorHeightMm": None,
        "doorThicknessMm": None,
        "surface": None,
        "wallTreatment": wall_treatment(notes),
        "glazing": None,
        "glazingSpecification": None,
        "notes": notes,
    }
    field_values = [
        ("CODE", code, code),
        ("NAME", name, name),
        ("QUANTITY", quantity_raw, quantity_value),
        ("PRODUCT_TYPE", product_type, product_type or None),
        ("OPENING_DIRECTION", direction, direction or None),
        ("OPENING_WIDTH_MM", width_raw, target["openingWidthMm"]),
        ("OPENING_HEIGHT_MM", height_raw, target["openingHeightMm"]),
        ("OPENING_DEPTH_MM", depth_raw, target["openingDepthMm"]),
        ("WALL_TREATMENT", notes, target["wallTreatment"]),
        ("NOTES", notes, notes),
    ]
    evidence_records = [
        evidence(field, raw, value, page, row_index, source_root, relative_path)
        for field, raw, value in field_values
        if raw and value is not None
    ]
    if not name:
        errors.append("position_name_not_extracted_from_sales_pdf")
    for field in ("openingWidthMm", "openingHeightMm", "openingDepthMm"):
        if target[field] is None:
            errors.append(f"{field}_not_extracted_from_sales_pdf")
    return {
        "recordType": "SalesOrderPositionCandidate",
        "action": "REVIEW",
        "extractionState": "SALES_SOURCE_UNVERIFIED",
        "parserLayout": "SHIFTED_AFTER_NAME" if shifted_after_name else "STANDARD",
        "source": {"page": page, "row": row_index, "relativePath": relative_path, "sourceRoot": source_root},
        "target": target,
        "rawManufacturingAttributes": raw_attributes,
        "evidence": evidence_records,
        "errors": errors + ["requires_survey_or_technical_review"],
    }


def supplementary_candidate_from_row(page: int, row_index: int, row: list[object], source_root: str, relative_path: str) -> dict[str, Any]:
    code = POSITION.match(cell(row, 0)).group(1)
    name, description, notes, quantity_raw = cell(row, 1), cell(row, 2), cell(row, 3), cell(row, 4)
    quantity = as_number(quantity_raw)
    quantity_value = int(quantity) if quantity is not None and int(quantity) == quantity and quantity > 0 else None
    metres_match = LINEAR_METRES_PER_PIECE.search(description)
    metres_per_piece = float(metres_match.group(1).replace(",", ".")) if metres_match else None
    linear_metres = round(metres_per_piece * quantity_value, 3) if metres_per_piece is not None and quantity_value is not None else None
    errors = []
    if quantity_value is None:
        errors.append("quantity_not_extracted_from_sales_pdf")
    if not name:
        errors.append("supplementary_product_name_not_extracted_from_sales_pdf")
    return {
        "recordType": "SalesOrderSupplementaryProductCandidate",
        "action": "REVIEW",
        "extractionState": "SALES_SOURCE_UNVERIFIED",
        "importStatus": "REQUIRES_SUPPLEMENTARY_PRODUCT_MODEL",
        "source": {"page": page, "row": row_index, "relativePath": relative_path, "sourceRoot": source_root},
        "target": {
            "code": code,
            "name": name,
            "quantity": quantity_value,
            "description": description or None,
            "notes": notes or None,
            "linearMetresPerPiece": metres_per_piece,
            "linearMetresCalculated": linear_metres,
            "calculation": f"{metres_per_piece} * {quantity_value}" if linear_metres is not None else None,
        },
        "evidence": [
            evidence("CODE", code, code, page, row_index, source_root, relative_path),
            evidence("NAME", name, name, page, row_index, source_root, relative_path),
            evidence("QUANTITY", quantity_raw, quantity_value, page, row_index, source_root, relative_path),
            evidence("NOTES", " | ".join(value for value in (description, notes) if value), " | ".join(value for value in (description, notes) if value), page, row_index, source_root, relative_path),
        ],
        "errors": errors + ["requires_human_review", "supplementary_product_storage_not_implemented"],
    }
def parse_pdf(input_pdf: Path, source_root: Path, source_root_label: str) -> dict[str, Any]:
    require_pdfplumber()
    assert pdfplumber is not None
    relative_path = input_pdf.resolve().relative_to(source_root.resolve()).as_posix()
    pages: list[dict[str, Any]] = []
    all_tables: list[list[list[object]]] = []
    candidates: list[dict[str, Any]] = []
    supplementary_candidates: list[dict[str, Any]] = []
    page_text: list[str] = []
    with pdfplumber.open(input_pdf) as document:
        for page_number, page in enumerate(document.pages, start=1):
            tables = page.extract_tables() or []
            all_tables.extend(tables)
            extracted_text = page.extract_text() or ""
            page_text.append(extracted_text)
            pages.append({"page": page_number, "tableCount": len(tables), "textExtracted": bool(clean(extracted_text))})
            candidates.extend(candidate_from_row(page_number, row_index, row, source_root_label, relative_path) for row_index, row in position_rows(page_number, tables))
            supplementary_candidates.extend(supplementary_candidate_from_row(page_number, row_index, row, source_root_label, relative_path) for row_index, row in supplementary_product_rows(tables))

    all_page_text = "\n".join(page_text)
    customer_name = label_value_any(all_tables, ["Név"])
    if not customer_name:
        customer_match = TEXT_CUSTOMER.search(all_page_text)
        customer_name = clean(customer_match.group(1)) if customer_match else None
    phone_and_contact = label_value_any(all_tables, ["Telefon"])
    phone_match = PHONE.search(phone_and_contact or "") or PHONE.search(all_page_text)
    contact_phone = phone_match.group(0) if phone_match else None
    contact_name = clean((phone_and_contact or "").replace(contact_phone or "", "")) or None
    work_number = label_value_any(all_tables, ["DSMR"])
    if not work_number:
        work_match = TEXT_WORK_NUMBER.search(all_page_text)
        work_number = work_match.group(1) if work_match else None
    order_date = label_value_any(all_tables, ["Kelte"])
    if not order_date:
        order_date_match = TEXT_ORDER_DATE.search(all_page_text)
        order_date = order_date_match.group(1) if order_date_match else None
    delivery_match = TEXT_EXPECTED_DELIVERY.search(all_page_text)
    delivery_text = plausible_delivery_text(clean(delivery_match.group(1)) if delivery_match else None)
    delivery_address = label_value_any(all_tables, ["Szállítási cím"])
    if not delivery_address:
        address_match = TEXT_DELIVERY_ADDRESS.search(all_page_text)
        delivery_address = clean(address_match.group(1)) if address_match else None
    delivery_address = plausible_delivery_address(delivery_address)
    document_record = {
        "recordType": "OrderDocument",
        "action": "CREATE_REFERENCE",
        "source": "LEGACY_FOLDER",
        "kind": "SALES_ORDER",
        "displayName": input_pdf.name,
        "relativePath": relative_path,
        "contentSha256": source_hash(input_pdf),
        "reviewRequired": True,
    }
    return {
        "mode": "preview",
        "databaseWrite": False,
        "macroExecution": False,
        "sourceAuthority": "SALES_TO_WORKSHOP_GYARTASMEGRENDELES",
        "document": document_record,
        "salesOrder": {
            "workNumber": work_number,
            "customerName": customer_name,
            "deliveryAddress": delivery_address,
            "contactPhone": contact_phone,
            "contactName": contact_name,
            "orderDate": order_date,
            "expectedDeliveryText": delivery_text,
            "expectedDelivery": None,
            "intakeStage": "SALES_DOCUMENTS_RECEIVED",
            "reviewRequired": True,
        },
        "positionCandidates": candidates,
        "supplementaryProductCandidates": supplementary_candidates,
        "pages": pages,
        "summary": {
            "pageCount": len(pages),
            "positionCandidateCount": len(candidates),
            "positionsWithCompleteOpeningDimensions": sum(
                all(candidate["target"][field] is not None for field in ("openingWidthMm", "openingHeightMm", "openingDepthMm"))
                for candidate in candidates
            ),
            "positionsRequiringReview": len(candidates),
            "supplementaryProductCandidateCount": len(supplementary_candidates),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-pdf", required=True, type=Path)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--source-root-label", required=True)
    parser.add_argument("--output-json", required=True, type=Path)
    args = parser.parse_args()
    if args.input_pdf.suffix.lower() != ".pdf":
        raise SystemExit("input must be a PDF")
    if not args.input_pdf.is_file() or not args.source_root.is_dir():
        raise SystemExit("input PDF and source root must exist")
    try:
        result = parse_pdf(args.input_pdf, args.source_root, args.source_root_label)
    except ValueError as error:
        raise SystemExit("input PDF must be inside source root") from error
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
