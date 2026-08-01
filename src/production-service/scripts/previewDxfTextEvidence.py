#!/usr/bin/env python3
"""Extract read-only text and dimension evidence from ASCII DXF source files.

The output is a review aid, not geometric truth or an import payload. It only
records visible TEXT/MTEXT strings and DIMENSION display/measurement fields with
the original DXF entity number. A technical reviewer must still confirm that an
entity belongs to the requested door, panel or furniture front.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any


WORK_NUMBER = re.compile(r"(?<!\d)([12]\d{4})(?!\d)")
CODE_PAGES = {"ANSI_1250": "cp1250", "ANSI_1252": "cp1252", "ANSI_1251": "cp1251"}


def parse_source(value: str) -> tuple[str, Path]:
    if "=" not in value:
        raise argparse.ArgumentTypeError("source must be LABEL=PATH")
    label, raw_path = value.split("=", 1)
    path = Path(raw_path)
    if not label.strip() or not path.is_dir():
        raise argparse.ArgumentTypeError("source label must be non-empty and path must be an existing directory")
    return label.strip(), path.resolve()


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def decode_dxf(path: Path) -> tuple[str, str]:
    raw = path.read_bytes()
    header = raw[:8192].decode("latin-1", errors="replace")
    match = re.search(r"\$DWGCODEPAGE\s+3\s+([^\r\n]+)", header)
    encoding = CODE_PAGES.get(match.group(1).strip().upper(), "utf-8") if match else "utf-8"
    try:
        return raw.decode(encoding), encoding
    except UnicodeDecodeError:
        return raw.decode("latin-1", errors="replace"), "latin-1-fallback"


def pairs(text: str) -> list[tuple[int, str]]:
    lines = [line.rstrip("\r") for line in text.split("\n")]
    result: list[tuple[int, str]] = []
    for index in range(0, len(lines) - 1, 2):
        try:
            result.append((int(lines[index].strip()), lines[index + 1].strip()))
        except ValueError:
            continue
    return result


def entities(dxf_pairs: list[tuple[int, str]]) -> list[tuple[str, list[tuple[int, str]]]]:
    in_entities = False
    current_type: str | None = None
    current: list[tuple[int, str]] = []
    result: list[tuple[str, list[tuple[int, str]]]] = []
    for code, value in dxf_pairs:
        if code == 0 and value == "SECTION":
            current_type = None
            current = []
            continue
        if code == 2 and value == "ENTITIES" and not in_entities:
            in_entities = True
            continue
        if not in_entities:
            continue
        if code == 0 and value == "ENDSEC":
            if current_type:
                result.append((current_type, current))
            break
        if code == 0:
            if current_type:
                result.append((current_type, current))
            current_type, current = value, []
        elif current_type:
            current.append((code, value))
    return result


def values(entity: list[tuple[int, str]], code: int) -> list[str]:
    return [value for pair_code, value in entity if pair_code == code and value]


def evidence_for(path: Path, root: Path, label: str) -> dict[str, Any]:
    decoded, encoding = decode_dxf(path)
    dxf_entities = entities(pairs(decoded))
    text_evidence: list[dict[str, Any]] = []
    for entity_index, (entity_type, entity) in enumerate(dxf_entities, start=1):
        if entity_type in {"TEXT", "MTEXT"}:
            visible_text = "".join(values(entity, 3) + values(entity, 1)).replace("\\P", "\n").strip()
            if visible_text:
                text_evidence.append({"entityIndex": entity_index, "entityType": entity_type, "text": visible_text})
        elif entity_type == "DIMENSION":
            display_values = values(entity, 1)
            measurement_values = values(entity, 42)
            if display_values or measurement_values:
                text_evidence.append({
                    "entityIndex": entity_index,
                    "entityType": entity_type,
                    "displayText": display_values[0] if display_values else None,
                    "measurementValue": measurement_values[0] if measurement_values else None,
                    "reviewNote": "DXF dimension evidence only; confirm entity scope and drawing units before use.",
                })
    relative_path = path.resolve().relative_to(root).as_posix()
    work_match = WORK_NUMBER.search(path.name) or WORK_NUMBER.search(relative_path)
    return {
        "recordType": "DrawingTextEvidence", "action": "REVIEW_REFERENCE", "sourceRoot": label,
        "relativePath": relative_path, "displayName": path.name, "extension": ".dxf",
        "contentSha256": file_hash(path), "encoding": encoding,
        "workNumberCandidate": work_match.group(1) if work_match else None,
        "entityCounts": dict(sorted(Counter(entity_type for entity_type, _ in dxf_entities).items())),
        "textEvidence": text_evidence, "databaseWrite": False, "macroExecution": False,
        "errors": ["requires_human_review", "drawing_units_and_entity_scope_not_automatically_verified"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", action="append", required=True, type=parse_source, metavar="LABEL=PATH")
    parser.add_argument("--output-json", required=True, type=Path)
    args = parser.parse_args()
    records = [
        evidence_for(path, root, label)
        for label, root in args.source
        for path in sorted(root.rglob("*.dxf"), key=lambda item: item.as_posix().casefold())
    ]
    result = {
        "mode": "preview", "databaseWrite": False, "macroExecution": False,
        "profile": "dxf-text-evidence-v1", "records": records,
        "summary": {
            "drawingCount": len(records),
            "textEvidenceCount": sum(len(record["textEvidence"]) for record in records),
            "dimensionEvidenceCount": sum(1 for record in records for item in record["textEvidence"] if item["entityType"] == "DIMENSION"),
            "workNumberCandidateCount": sum(1 for record in records if record["workNumberCandidate"]),
        },
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
