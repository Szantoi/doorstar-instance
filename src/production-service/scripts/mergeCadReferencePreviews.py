#!/usr/bin/env python3
"""Merge read-only Doorstar CAD metadata previews into one deterministic index."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


def load_preview(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("mode") != "preview" or payload.get("databaseWrite") is not False:
        raise ValueError(f"{path}: expected a preview-only CAD result")
    records = payload.get("records")
    if not isinstance(records, list):
        raise ValueError(f"{path}: records must be a list")
    for record in records:
        if not isinstance(record, dict) or record.get("databaseWrite") is not False:
            raise ValueError(f"{path}: contains a non-preview record")
    return records


def record_key(record: dict[str, Any]) -> tuple[str, str]:
    return (str(record.get("sourceRoot", "")).casefold(), str(record.get("relativePath", "")).casefold())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-json", action="append", required=True, type=Path)
    parser.add_argument("--output-json", required=True, type=Path)
    args = parser.parse_args()

    records = [record for input_path in args.input_json for record in load_preview(input_path)]
    records.sort(key=record_key)
    seen: set[tuple[str, str]] = set()
    for record in records:
        key = record_key(record)
        if not key[0] or not key[1] or key in seen:
            raise ValueError(f"duplicate or incomplete CAD locator: {key}")
        seen.add(key)

    same_content: dict[str, list[dict[str, str]]] = defaultdict(list)
    for record in records:
        content_hash = record.get("contentSha256")
        if not isinstance(content_hash, str) or len(content_hash) != 64:
            raise ValueError(f"invalid CAD content hash: {record_key(record)}")
        same_content[content_hash].append({"sourceRoot": record["sourceRoot"], "relativePath": record["relativePath"]})

    duplicate_groups = [
        {"contentSha256": content_hash, "documents": documents}
        for content_hash, documents in sorted(same_content.items())
        if len(documents) > 1
    ]
    result = {
        "mode": "preview",
        "databaseWrite": False,
        "macroExecution": False,
        "profile": "cad-reference-metadata-v1",
        "records": records,
        "sameContentDuplicates": duplicate_groups,
        "summary": {
            "drawingCount": len(records),
            "byExtension": dict(sorted(Counter(record["extension"] for record in records).items())),
            "workNumberCandidateCount": sum(1 for record in records if record.get("workNumberCandidate")),
            "knownDwgVersionCount": sum(1 for record in records if record.get("dwgVersion")),
            "sameContentDuplicateGroupCount": len(duplicate_groups),
        },
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
