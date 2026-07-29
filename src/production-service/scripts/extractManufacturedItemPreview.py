#!/usr/bin/env python3
"""Create a review-only, field-mapped manufactured-item preview from scanner evidence.

The scanner keeps every source occurrence.  This companion tool selects one
explicit authoritative sheet, translates only labelled cached fields and logs
the source-unit conversion.  It never opens Excel, runs VBA or writes a DB.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from previewLegacyOrderImport import normalized


def source_field(fields: dict[str, Any], sought: str) -> Any:
    target = normalized(sought)
    for key, value in fields.items():
        if normalized(key) == target:
            return value
    return None


def millimetres(value: object, unit: str | None) -> float | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    if unit == "mm":
        return float(value)
    if unit == "cm":
        return float(value) * 10
    return None


def project_reference(value: object) -> str | None:
    text = str(value).strip() if value is not None else ""
    if not text:
        return None
    return text if text.upper().startswith("DSMR-") else f"DSMR-{text}"


def evidence_record(
    field: str,
    raw_value: object,
    normalized_value: object,
    source_root: str,
    relative_path: str,
    source_sheet: str,
    logical_row: object,
    unit: str | None = None,
) -> dict[str, Any] | None:
    if raw_value is None or normalized_value is None:
        return None
    raw_text = str(raw_value).strip()
    if not raw_text:
        return None
    if unit:
        raw_text = f"{raw_text} {unit}"
    result: dict[str, Any] = {
        "sourceRoot": source_root,
        "relativePath": relative_path,
        "sheet": source_sheet,
        "field": field,
        "rawValue": raw_text,
        "normalizedValue": normalized_value,
        "reviewState": "REVIEW",
    }
    if isinstance(logical_row, int) and logical_row > 0:
        result["row"] = logical_row
    return result


def create_preview(payload: dict[str, Any], source_sheet: str, source_root_label: str, work_kind: str) -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    for record in payload.get("records", []):
        if record.get("recordType") != "ManufacturedItemCandidate" or record.get("sheet") != source_sheet:
            continue
        fields = record.get("cachedFields")
        if not isinstance(fields, dict):
            continue
        unit = record.get("cachedMeasurementUnit")
        measurements = record.get("cachedMeasurements") or {}
        errors = ["requires_human_review"]
        width = millimetres(measurements.get("width"), unit)
        height = millimetres(measurements.get("height"), unit)
        thickness = millimetres(source_field(fields, "vastagsag"), unit)
        if None in (width, height, thickness):
            errors.append("missing_or_unrecognised_source_measurement_unit")
        project = project_reference(source_field(fields, "dsmr"))
        if not project:
            errors.append("missing_project_reference")
        relative_path = record.get("relativePath")
        source_file = f"{source_root_label.rstrip('/')}/{relative_path}" if relative_path else None
        item_kind = record.get("itemKind")
        code = source_field(fields, "sorszam")
        item_type = source_field(fields, "tipus")
        item_name = source_field(fields, "nev")
        component_name = source_field(fields, "alkatresz megnevezese")
        api_name = item_name or component_name
        quantity_raw = measurements.get("quantity")
        quantity = int(quantity_raw) if isinstance(quantity_raw, (int, float)) and not isinstance(quantity_raw, bool) and float(quantity_raw).is_integer() and quantity_raw > 0 else None
        blocking_errors: list[str] = []
        if item_kind not in {"WALL_PANEL", "FURNITURE_FRONT"}:
            blocking_errors.append("missing_or_invalid_item_kind")
        if code is None or not str(code).strip():
            blocking_errors.append("missing_item_code")
        if api_name is None or not str(api_name).strip():
            blocking_errors.append("missing_item_name")
        if quantity is None:
            blocking_errors.append("missing_or_invalid_quantity")
        if not isinstance(relative_path, str) or not relative_path.strip():
            blocking_errors.append("missing_relative_source_path")
        errors.extend(blocking_errors)
        source_fields = {
            "CODE": (code, str(code).strip() if code is not None else None, None),
            "NAME": (api_name, str(api_name).strip() if api_name is not None else None, None),
            "ITEM_TYPE": (item_type, item_type, None),
            "COMPONENT_NAME": (component_name, component_name, None),
            "QUANTITY": (quantity_raw, quantity, None),
            "WIDTH_MM": (measurements.get("width"), width, unit),
            "HEIGHT_MM": (measurements.get("height"), height, unit),
            "THICKNESS_MM": (source_field(fields, "vastagsag"), thickness, unit),
            "MATERIAL": (source_field(fields, "anyag"), source_field(fields, "anyag"), None),
            "SURFACE": (source_field(fields, "felulet tipus"), source_field(fields, "felulet tipus"), None),
            "COLOUR": (source_field(fields, "szin"), source_field(fields, "szin"), None),
            "PATTERN": (source_field(fields, "minta"), source_field(fields, "minta"), None),
            "WORK_KIND": (f"configured:{work_kind}", work_kind, None),
            "NOTES": (source_field(fields, "megjegyzes"), source_field(fields, "megjegyzes"), None),
        }
        api_evidence = [
            evidence
            for field, (raw, normalized_value, raw_unit) in source_fields.items()
            if (evidence := evidence_record(
                field, raw, normalized_value, source_root_label, relative_path or "",
                source_sheet, record.get("logicalRow"), raw_unit,
            )) is not None
        ]
        api_payload = None if blocking_errors else {
            "kind": item_kind,
            "code": str(code).strip(),
            "name": str(api_name).strip(),
            "itemType": item_type,
            "componentName": component_name,
            "quantity": quantity,
            "widthMm": width,
            "heightMm": height,
            "thicknessMm": thickness,
            "material": source_field(fields, "anyag"),
            "surface": source_field(fields, "felulet tipus"),
            "colour": source_field(fields, "szin"),
            "pattern": source_field(fields, "minta"),
            "workKind": work_kind,
            "state": "REVIEW",
            "notes": source_field(fields, "megjegyzes") or "",
            "evidence": api_evidence,
        }
        records.append({
            "recordType": "ManufacturedItemImportPreview",
            "action": "REVIEW",
            "apiReady": api_payload is not None,
            "apiEndpoint": {
                "method": "POST",
                "pathTemplate": "/api/production/production-orders/{projectKey}/revisions/{revision}/manufactured-items",
                "projectKey": project,
                "revision": None,
            },
            "apiPayload": api_payload,
            "target": {
                "projectReference": project,
                "itemKind": item_kind,
                "sourceItemCode": code,
                "itemType": item_type,
                "itemName": item_name,
                "componentName": component_name,
                "material": source_field(fields, "anyag"),
                "widthMm": width,
                "heightMm": height,
                "thicknessMm": thickness,
                "quantity": measurements.get("quantity"),
                "surface": source_field(fields, "felulet tipus"),
                "colour": source_field(fields, "szin"),
                "pattern": source_field(fields, "minta"),
                "note": source_field(fields, "megjegyzes"),
            },
            "source": {
                "relativePath": source_file,
                "sheet": source_sheet,
                "logicalRow": record.get("logicalRow"),
                "contentSha256": record.get("contentSha256"),
                "sourceMeasurementUnit": unit,
                "conversion": f"{unit}->mm" if unit in {"cm", "mm"} else None,
            },
            "errors": errors,
        })
    return {
        "mode": "preview",
        "databaseWrite": False,
        "macroExecution": False,
        "sourceSheet": source_sheet,
        "summary": {
            "reviewRecordCount": len(records),
            "apiReadyRecordCount": sum(1 for record in records if record["apiReady"]),
            "blockedRecordCount": sum(1 for record in records if not record["apiReady"]),
            "actionCounts": {"REVIEW": len(records)},
        },
        "records": sorted(records, key=lambda item: (str(item["target"].get("projectReference")), str(item["target"].get("sourceItemCode")))),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Create review-only manufactured-item preview from scanner evidence")
    parser.add_argument("--input-json", required=True, type=Path)
    parser.add_argument("--output-json", required=True, type=Path)
    parser.add_argument("--source-sheet", required=True)
    parser.add_argument("--source-root-label", required=True, help="Relative source root recorded in document references")
    parser.add_argument("--work-kind", required=True, choices=["STANDARD", "REWORK", "REMANUFACTURE", "REPLACEMENT"], help="Explicit configured work kind; never inferred from the workbook")
    args = parser.parse_args()
    payload = json.loads(args.input_json.read_text(encoding="utf-8"))
    preview = create_preview(payload, args.source_sheet, args.source_root_label, args.work_kind)
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(preview, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(preview["summary"], ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
