"""Shared safe-output helpers for read-only import preview tools."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any


def is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def require_output_outside_source_tree(input_path: Path, output_path: Path) -> None:
    """Prevent a preview tool from creating any file beside its source export."""
    if is_within(output_path, input_path.parent):
        raise ValueError("output must be outside the source export directory tree")


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    """Replace a generated JSON artifact only after a complete UTF-8 write."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
        text=True,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)
