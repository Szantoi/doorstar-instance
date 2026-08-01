#!/usr/bin/env python3
"""Build a read-only metadata index for Doorstar DWG/DXF drawing references.

DWG geometry is deliberately not guessed from binary content. The preview records
format/version, hash, safe relative locator and a filename work-number candidate.
DXF is tagged as text-inspectable, but dimensions still require a reviewed CAD
parser/converter workflow. No source file, API or database is modified.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


WORK_NUMBER = re.compile(r"(?<!\d)([12]\d{4})(?!\d)")
DWG_VERSIONS = {
    "AC1015": "AutoCAD 2000", "AC1018": "AutoCAD 2004", "AC1021": "AutoCAD 2007",
    "AC1024": "AutoCAD 2010", "AC1027": "AutoCAD 2013", "AC1032": "AutoCAD 2018",
}


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


def inspect(path: Path, root: Path, label: str) -> dict[str, Any]:
    extension = path.suffix.casefold()
    relative_path = path.resolve().relative_to(root).as_posix()
    header = path.read_bytes()[:6].decode("ascii", errors="replace") if extension == ".dwg" else None
    work_match = WORK_NUMBER.search(path.name) or WORK_NUMBER.search(relative_path)
    return {
        "recordType": "OrderDocument", "action": "REVIEW_REFERENCE", "sourceRoot": label,
        "relativePath": relative_path, "displayName": path.name, "documentKind": "DRAWING",
        "extension": extension, "contentSha256": file_hash(path),
        "workNumberCandidate": work_match.group(1) if work_match else None,
        "dwgHeader": header if extension == ".dwg" else None,
        "dwgVersion": DWG_VERSIONS.get(header) if extension == ".dwg" else None,
        "geometryInspectionState": "DXF_REVIEWABLE_AFTER_APPROVED_PARSER" if extension == ".dxf" else "DWG_CONVERSION_REQUIRED",
        "databaseWrite": False, "macroExecution": False,
        "errors": ["requires_human_review", "geometry_not_extracted_from_binary_cad_source"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", action="append", required=True, type=parse_source, metavar="LABEL=PATH")
    parser.add_argument("--output-json", required=True, type=Path)
    args = parser.parse_args()
    records: list[dict[str, Any]] = []
    for label, root in args.source:
        files = sorted((path for path in root.rglob("*") if path.is_file() and path.suffix.casefold() in {".dwg", ".dxf"}), key=lambda item: item.as_posix().casefold())
        records.extend(inspect(path, root, label) for path in files)
    same_content: dict[str, list[dict[str, str]]] = defaultdict(list)
    for record in records:
        same_content[record["contentSha256"]].append({"sourceRoot": record["sourceRoot"], "relativePath": record["relativePath"]})
    result = {
        "mode": "preview", "databaseWrite": False, "macroExecution": False,
        "profile": "cad-reference-metadata-v1", "records": records,
        "sameContentDuplicates": [{"contentSha256": content_hash, "documents": documents} for content_hash, documents in sorted(same_content.items()) if len(documents) > 1],
        "summary": {
            "drawingCount": len(records), "byExtension": dict(sorted(Counter(record["extension"] for record in records).items())),
            "workNumberCandidateCount": sum(1 for record in records if record["workNumberCandidate"]),
            "knownDwgVersionCount": sum(1 for record in records if record["dwgVersion"]),
            "sameContentDuplicateGroupCount": sum(1 for documents in same_content.values() if len(documents) > 1),
        },
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
