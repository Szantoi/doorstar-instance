"""Pure, deterministic SharePoint metadata mapping rules.

The functions in this module operate only on strings. They do not open Excel,
run macros, call SharePoint, access a database or write files. Both the source
preview and the catalog simulator use the same rules so that the simulator can
fail closed when an upstream mapping label has been altered.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any


WORK_NUMBER = re.compile(r"(?<!\d)(?:DSMR[_ -]?)?(\d{5})(?!\d)", re.IGNORECASE)
DSMR_WORK_NUMBER = re.compile(r"(?<!\w)DSMR[_ -]?(\d{5})(?!\d)", re.IGNORECASE)
PROJECT_FOLDER = re.compile(r"^(?:DSMR[_ -]*)?(\d{5})\s+[-–]\s+\S", re.IGNORECASE)
RELEVANT_EXTENSIONS = {".pdf", ".dwg", ".xlsx", ".xlsm"}


def work_numbers_from(value: str) -> list[str]:
    return list(dict.fromkeys(match.group(1) for match in WORK_NUMBER.finditer(value)))


def resolve_work_number(
    filename: str,
    server_path: str,
) -> tuple[str | None, str | None, str | None, str, list[str], list[str]]:
    """Retain filename/path candidates; ambiguous values remain unselected."""
    filename_candidates = work_numbers_from(filename)
    path_candidates = work_numbers_from(server_path)
    if len(filename_candidates) > 1 or len(path_candidates) > 1:
        return None, None, None, "MULTIPLE", filename_candidates, path_candidates
    filename_candidate = filename_candidates[0] if filename_candidates else None
    path_candidate = path_candidates[0] if path_candidates else None
    if filename_candidate and path_candidate and filename_candidate != path_candidate:
        return (
            filename_candidate,
            filename_candidate,
            path_candidate,
            "CONFLICT",
            filename_candidates,
            path_candidates,
        )
    if filename_candidate:
        return (
            filename_candidate,
            filename_candidate,
            path_candidate,
            "FILENAME",
            filename_candidates,
            path_candidates,
        )
    if path_candidate:
        return (
            path_candidate,
            filename_candidate,
            path_candidate,
            "PATH",
            filename_candidates,
            path_candidates,
        )
    return None, None, None, "UNRESOLVED", filename_candidates, path_candidates


def project_package_candidate(
    filename: str,
    server_path: str,
    resolution: str,
) -> tuple[str | None, str | None]:
    """Return only strong Sales-package evidence.

    An explicit DSMR marker in the filename remains strong evidence even when
    another work number appears in the folder path. A path-only conflict never
    becomes a package automatically.
    """
    if resolution == "MULTIPLE":
        return None, None
    filename_matches = list(dict.fromkeys(
        match.group(1) for match in DSMR_WORK_NUMBER.finditer(filename)
    ))
    if len(filename_matches) == 1:
        return filename_matches[0], "FILENAME_DSMR"
    if resolution == "CONFLICT":
        return None, None
    folder_matches: list[str] = []
    for part in server_path.replace("\\", "/").split("/"):
        explicit = DSMR_WORK_NUMBER.search(part)
        structured = PROJECT_FOLDER.match(part)
        candidate = explicit.group(1) if explicit else structured.group(1) if structured else None
        if candidate and candidate not in folder_matches:
            folder_matches.append(candidate)
    if len(folder_matches) == 1:
        return folder_matches[0], "PROJECT_FOLDER"
    return None, None


def derive_document_mapping(filename: str, server_path: str) -> dict[str, Any]:
    """Derive every semantic label from the raw filename and parent path."""
    (
        selected_work_number,
        filename_work_number,
        path_work_number,
        resolution,
        filename_work_numbers,
        path_work_numbers,
    ) = resolve_work_number(filename, server_path)
    extension = Path(filename).suffix.lower()
    relevance = (
        "POTENTIAL_IMPORT_DOCUMENT"
        if extension in RELEVANT_EXTENSIONS
        else "DOCUMENT_METADATA_ONLY"
    )
    package_work_number, package_evidence = project_package_candidate(
        filename,
        server_path,
        resolution,
    )
    if relevance != "POTENTIAL_IMPORT_DOCUMENT":
        package_work_number, package_evidence = None, None
    return {
        "workNumberCandidate": selected_work_number,
        "filenameWorkNumberCandidate": filename_work_number,
        "pathWorkNumberCandidate": path_work_number,
        "filenameWorkNumberCandidates": filename_work_numbers,
        "pathWorkNumberCandidates": path_work_numbers,
        "workNumberResolution": resolution,
        "projectPackageWorkNumberCandidate": package_work_number,
        "projectPackageEvidence": package_evidence,
        "relevance": relevance,
    }
