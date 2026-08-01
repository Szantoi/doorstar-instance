#!/usr/bin/env python3
"""Validate and simulate a Doorstar Nexus RAG package without ingesting it.

This module is deliberately standard-library-only and has no Nexus, ChromaDB,
HTTP, socket, database, or subprocess integration.  Its only optional write is
the explicitly requested local JSON report.  The validator therefore remains
a dry-run even when used from the command line.

Canonical claim tables use this audited four-column contract::

    | Claim ID | Status | Statement | Source citation |
    | --- | --- | --- | --- |
    | CLAIM-001 | VERIFIED | ... | SRC-001@sha256:<64 hex>#locator |

The report contains hashes and chunk metadata, never canonical/source text.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tempfile
import unicodedata
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Sequence


REPORT_SCHEMA = "doorstar-nexus-rag-dry-run-report.v1"
EXPECTED_ISLAND = "doorstar"
EXPECTED_MODE = "dry-run"
MAX_CANONICAL_BYTES = 512 * 1024
MAX_CHUNK_CHARS = 1600
V1_CHUNK_STRATEGY = "markdown_heading_paragraph"
V2_CHUNK_STRATEGY = "markdown_claim_rows"
V2_POLICY_VERSION = "v2"
ALLOWED_CLAIM_STATES = {"VERIFIED", "INFERENCE", "OPEN"}
ALLOWED_EXPECTED_DOCUMENT_MODES = {"ALL", "ANY"}
SAFE_REVIEW_STATUSES = {"DRAFT", "IN_REVIEW", "REVIEW_REQUIRED", "READY_FOR_HUMAN_REVIEW"}

MANIFEST_FIELDS = {
    "schemaVersion",
    "packageId",
    "packageVersion",
    "targetIsland",
    "mode",
    "nexusWrite",
    "chromaWrite",
    "sourceInventoryFile",
    "evalFile",
    "idempotency",
    "documents",
}
DOCUMENT_FIELDS = {
    "id",
    "title",
    "version",
    "domain",
    "tags",
    "canonicalFile",
    "canonicalSha256",
    "sources",
    "sourceInventoryRefs",
    "reviewStatus",
    "owner",
    "sensitivity",
    "validFrom",
    "chunkingPolicy",
}
DOCUMENT_SOURCE_FIELDS = {"sourceId", "relativePath", "sourceHash"}
INVENTORY_FIELDS = {
    "schemaVersion",
    "inventoryId",
    "inventoryVersion",
    "snapshotDate",
    "targetIsland",
    "dryRunOnly",
    "ragIndexable",
    "mutationPolicy",
    "artifactSensitivity",
    "hashAlgorithm",
    "pathBase",
    "pathFormat",
    "sourceCount",
    "sources",
    "excludedSourceClasses",
}
INVENTORY_SOURCE_FIELDS = {
    "sourceId",
    "relativePath",
    "fileType",
    "sha256",
    "workflow",
    "responsibleArea",
    "sensitivity",
    "containsPersonalData",
    "containsCustomerData",
    "containsOrderData",
    "disposition",
    "rationale",
}
EVAL_FIELDS = {"schemaVersion", "packageId", "targetIsland", "questions"}
EVAL_QUESTION_FIELDS = {
    "id",
    "question",
    "expectedDocumentIds",
    "expectedSourceIds",
    "expectedClaimIds",
}

SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
DOCUMENT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,127}$")
SEMVER_RE = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$")
POLICY_VERSION_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$")
VERSIONED_REPORT_RE = re.compile(
    r"^DRY_RUN_REPORT\.v[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?\.json$"
)
SOURCE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
HEADING_RE = re.compile(r"^(#{1,3})\s+(.+?)\s*#*\s*$")
TABLE_SEPARATOR_RE = re.compile(r"^:?-{3,}:?$")
CITATION_RE = re.compile(
    r"(?P<source>[A-Za-z0-9][A-Za-z0-9._:-]*)"
    r"@sha256:(?P<hash>[0-9a-fA-F]{64})"
    r"#(?P<locator>[A-Za-z0-9][A-Za-z0-9._:/-]{0,255})"
)

PII_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("EMAIL", re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")),
    (
        "PHONE",
        re.compile(
            r"(?<!\w)(?:\+36|06)[\s()./-]*(?:1|20|30|31|50|70)"
            r"[\s()./-]*\d{3}[\s./-]*\d{3,4}(?!\d)"
        ),
    ),
    ("ORDER_NUMBER", re.compile(r"(?i)\bDSMR[\s#:_/-]*\d{5}\b")),
    (
        "HUNGARIAN_ADDRESS",
        re.compile(
            r"\b\d{4}\s+[A-ZÁÉÍÓÖŐÚÜŰ][\wÁÉÍÓÖŐÚÜŰáéíóöőúüű.-]+"
            r"(?:\s+[\wÁÉÍÓÖŐÚÜŰáéíóöőúüű.-]+){0,3},?\s+"
            r"(?:utca|út|útja|tér|köz|sor|körút|rakpart|dűlő)\s+"
            r"\d+[A-Za-z]?\.?",
            re.IGNORECASE,
        ),
    ),
)


class _DuplicateJsonKeyError(ValueError):
    pass


def _reject_duplicate_json_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise _DuplicateJsonKeyError(f"Duplicate JSON key '{key}'.")
        value[key] = item
    return value


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _canonical_json_hash(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return _sha256_bytes(encoded)


def _normalise_text(value: str) -> str:
    """Return the LF/whitespace-normal form used by deterministic chunk IDs."""

    return re.sub(r"\s+", " ", value.replace("\r\n", "\n").replace("\r", "\n")).strip()


def _normalise_label(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_like = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "", ascii_like.lower())


def _error(errors: list[dict[str, str]], code: str, location: str, message: str) -> None:
    errors.append({"code": code, "location": location, "message": message})


def _warning(warnings: list[dict[str, str]], code: str, location: str, message: str) -> None:
    warnings.append({"code": code, "location": location, "message": message})


def _missing_fields(value: Any, required: set[str]) -> list[str]:
    if not isinstance(value, dict):
        return sorted(required)
    return sorted(field for field in required if field not in value)


def _is_sha256(value: Any) -> bool:
    return isinstance(value, str) and SHA256_RE.fullmatch(value.lower()) is not None


def _safe_relative_path(value: Any, *, markdown: bool = False, canonical: bool = False) -> bool:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        return False
    path = PurePosixPath(value)
    if path.is_absolute() or ":" in path.parts[0] or any(part in {"", ".", ".."} for part in path.parts):
        return False
    if markdown and path.suffix.lower() != ".md":
        return False
    if canonical and (not path.parts or path.parts[0] != "canonical"):
        return False
    return True


def _resolve_inside(package_root: Path, relative_path: str) -> Path | None:
    candidate = (package_root / Path(*PurePosixPath(relative_path).parts)).resolve()
    try:
        candidate.relative_to(package_root.resolve())
    except ValueError:
        return None
    return candidate


def _load_json(path: Path, errors: list[dict[str, str]], location: str) -> Any:
    try:
        return json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_reject_duplicate_json_keys,
        )
    except FileNotFoundError:
        _error(errors, "FILE_NOT_FOUND", location, "Required JSON file does not exist.")
    except UnicodeDecodeError:
        _error(errors, "INVALID_UTF8", location, "JSON file must be UTF-8 encoded.")
    except json.JSONDecodeError as exc:
        _error(errors, "INVALID_JSON", location, f"Invalid JSON at line {exc.lineno}, column {exc.colno}.")
    except _DuplicateJsonKeyError:
        _error(errors, "DUPLICATE_JSON_KEY", location, "JSON input contains a duplicate object key.")
    return None


def _split_table_row(line: str) -> list[str]:
    stripped = line.strip()
    if not (stripped.startswith("|") and stripped.endswith("|")):
        return []
    return [cell.strip() for cell in stripped[1:-1].split("|")]


def _is_separator_row(cells: Sequence[str]) -> bool:
    return bool(cells) and all(TABLE_SEPARATOR_RE.fullmatch(cell.replace(" ", "")) for cell in cells)


def _table_blocks(text: str) -> Iterable[tuple[int, list[list[str]]]]:
    block: list[list[str]] = []
    start_line = 0
    for line_number, line in enumerate(text.splitlines(), start=1):
        cells = _split_table_row(line)
        if cells:
            if not block:
                start_line = line_number
            block.append(cells)
        elif block:
            yield start_line, block
            block = []
    if block:
        yield start_line, block


def _claim_column_indexes(header: Sequence[str]) -> tuple[int, int, int, int] | None:
    normalised = [_normalise_label(cell) for cell in header]
    id_names = {"claimid", "allitasid", "azonosito", "id"}
    state_names = {"status", "claimstatus", "allapot", "minosites", "tipus", "evidenceclass"}
    statement_names = {"statement", "claim", "allitas", "teny", "tudasallitas"}
    source_fragments = ("sourcecitation", "sourceref", "source", "forras", "bizonyitek")
    try:
        id_index = next(index for index, cell in enumerate(normalised) if cell in id_names)
        state_index = next(index for index, cell in enumerate(normalised) if cell in state_names)
        statement_index = next(index for index, cell in enumerate(normalised) if cell in statement_names)
        source_index = next(
            index for index, cell in enumerate(normalised) if any(fragment in cell for fragment in source_fragments)
        )
    except StopIteration:
        return None
    return id_index, state_index, statement_index, source_index


def _strip_markdown_token(value: str) -> str:
    return re.sub(r"[*_`\s]", "", value).upper()


def _validate_claims(
    text: str,
    document_location: str,
    source_hashes: dict[str, str],
    errors: list[dict[str, str]],
) -> tuple[int, set[str]]:
    claim_count = 0
    claim_ids: set[str] = set()
    recognised_table = False
    for start_line, rows in _table_blocks(text):
        if len(rows) < 2:
            continue
        indexes = _claim_column_indexes(rows[0])
        if indexes is None:
            continue
        recognised_table = True
        id_index, state_index, statement_index, source_index = indexes
        data_start = 2 if _is_separator_row(rows[1]) else 1
        for offset, row in enumerate(rows[data_start:], start=data_start):
            line_number = start_line + offset
            row_location = f"{document_location}:line:{line_number}"
            if max(indexes) >= len(row):
                _error(errors, "CLAIM_ROW_INVALID", row_location, "Claim row does not contain every required column.")
                continue
            state = _strip_markdown_token(row[state_index])
            if state not in ALLOWED_CLAIM_STATES:
                _error(
                    errors,
                    "CLAIM_STATE_INVALID",
                    row_location,
                    "Claim state must be VERIFIED, INFERENCE, or OPEN.",
                )
                continue
            claim_count += 1
            claim_id = _strip_markdown_token(row[id_index])
            if not claim_id:
                _error(errors, "CLAIM_ID_MISSING", row_location, "Claim ID must not be empty.")
            elif claim_id in claim_ids:
                _error(errors, "CLAIM_ID_DUPLICATE", row_location, f"Claim ID '{claim_id}' is duplicated in this document.")
            else:
                claim_ids.add(claim_id)
            if not _normalise_text(row[statement_index]):
                _error(errors, "CLAIM_STATEMENT_MISSING", row_location, "Claim statement must not be empty.")

            citation_cell = row[source_index].strip()
            matches = list(CITATION_RE.finditer(citation_cell))
            if not matches:
                _error(
                    errors,
                    "CLAIM_SOURCE_CITATION_MISSING",
                    row_location,
                    "Claim must cite a source ID, full SHA-256, and locator.",
                )
                continue
            residue = CITATION_RE.sub("", citation_cell)
            residue = re.sub(r"(?i)<br\s*/?>|[;,\s]", "", residue)
            if residue:
                _error(
                    errors,
                    "CLAIM_SOURCE_CITATION_INVALID",
                    row_location,
                    "Claim citation contains text outside the audited citation format.",
                )
            for match in matches:
                source_id = match.group("source")
                cited_hash = match.group("hash").lower()
                expected_hash = source_hashes.get(source_id)
                if expected_hash is None:
                    _error(
                        errors,
                        "CLAIM_SOURCE_UNDECLARED",
                        row_location,
                        f"Claim source ID '{source_id}' is not declared by this document.",
                    )
                elif cited_hash != expected_hash:
                    _error(
                        errors,
                        "CLAIM_SOURCE_HASH_MISMATCH",
                        row_location,
                        f"Claim source hash does not match the manifest pin for '{source_id}'.",
                    )
    if not recognised_table:
        _error(
            errors,
            "CLAIM_TABLE_MISSING",
            document_location,
            "Canonical Markdown must contain an audited claim table.",
        )
    elif claim_count == 0:
        _error(errors, "CLAIMS_MISSING", document_location, "Audited claim table contains no valid claim rows.")
    return claim_count, claim_ids


def _detect_sensitive_content(text: str, location: str, errors: list[dict[str, str]]) -> None:
    for kind, pattern in PII_PATTERNS:
        for match in pattern.finditer(text):
            line_number = text.count("\n", 0, match.start()) + 1
            _error(
                errors,
                f"CANONICAL_{kind}_DETECTED",
                f"{location}:line:{line_number}",
                f"Canonical knowledge contains a prohibited {kind.lower()} pattern.",
            )


def _paragraphs_by_section(text: str) -> Iterable[tuple[str, str]]:
    headings: list[str] = []
    paragraph_lines: list[str] = []

    def flush() -> tuple[str, str] | None:
        if not paragraph_lines:
            return None
        paragraph = _normalise_text("\n".join(paragraph_lines))
        paragraph_lines.clear()
        if not paragraph:
            return None
        return " / ".join(headings) if headings else "__root__", paragraph

    for raw_line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        heading_match = HEADING_RE.match(raw_line)
        if heading_match:
            pending = flush()
            if pending:
                yield pending
            depth = len(heading_match.group(1))
            title = _normalise_text(heading_match.group(2))
            headings[depth - 1 :] = [title]
        elif raw_line.strip():
            paragraph_lines.append(raw_line.strip())
        else:
            pending = flush()
            if pending:
                yield pending
    pending = flush()
    if pending:
        yield pending


def _split_long_text(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    pieces: list[str] = []
    remaining = text
    while len(remaining) > max_chars:
        boundary = remaining.rfind(" ", 0, max_chars + 1)
        if boundary <= 0:
            boundary = max_chars
        pieces.append(remaining[:boundary].strip())
        remaining = remaining[boundary:].strip()
    if remaining:
        pieces.append(remaining)
    return pieces


def _build_v1_chunk_candidates(
    text: str,
    document_id: str,
    version: str,
    policy_version: str,
    max_chars: int,
) -> list[dict[str, Any]]:
    """Reconstruct the original v1 chunks, retaining content internally."""

    by_section: dict[str, list[str]] = {}
    for section, paragraph in _paragraphs_by_section(text):
        by_section.setdefault(section, []).extend(_split_long_text(paragraph, max_chars))

    chunks: list[dict[str, Any]] = []
    for section in sorted(by_section):
        grouped: list[str] = []
        current = ""
        for paragraph in by_section[section]:
            candidate = paragraph if not current else f"{current}\n\n{paragraph}"
            if current and len(candidate) > max_chars:
                grouped.append(current)
                current = paragraph
            else:
                current = candidate
        if current:
            grouped.append(current)
        for index, chunk_text in enumerate(grouped):
            normalised = _normalise_text(chunk_text)
            chunk_material = json.dumps(
                [document_id, version, policy_version, section, index, normalised],
                ensure_ascii=False,
                separators=(",", ":"),
            )
            content_hash = _sha256_bytes(chunk_material.encode("utf-8"))
            section_key = _sha256_bytes(section.encode("utf-8"))
            chunks.append(
                {
                    "chunkKey": _sha256_bytes(f"chunk|{content_hash}".encode("utf-8")),
                    "contentSha256": content_hash,
                    "documentId": document_id,
                    "documentVersion": version,
                    "policyVersion": policy_version,
                    "sectionKey": section_key,
                    "chunkIndex": index,
                    "charCount": len(normalised),
                    "content": normalised,
                    "section": section,
                    "chunkKind": "PARAGRAPH",
                    "claimIds": [],
                }
            )
    return sorted(chunks, key=lambda item: (item["documentId"], item["documentVersion"], item["sectionKey"], item["chunkIndex"]))


def _extract_v2_claim_rows(text: str, heading_depth: int) -> tuple[str, list[dict[str, Any]], set[int]]:
    """Return Markdown title, audited claim rows and claim-table line indexes.

    Raw canonical text is retained only inside this process.  The returned row
    records support deterministic chunk reconstruction and are never copied to
    the dry-run report.
    """

    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    document_title = ""
    headings: dict[int, str] = {}
    claim_rows: list[dict[str, Any]] = []
    excluded_line_indexes: set[int] = set()
    line_index = 0

    while line_index < len(lines):
        raw_line = lines[line_index]
        heading_match = HEADING_RE.match(raw_line)
        if heading_match:
            depth = len(heading_match.group(1))
            heading_title = _normalise_text(heading_match.group(2))
            for existing_depth in tuple(headings):
                if existing_depth >= depth:
                    del headings[existing_depth]
            headings[depth] = heading_title
            if depth == 1 and not document_title:
                document_title = f"# {heading_title}"
            line_index += 1
            continue

        first_cells = _split_table_row(raw_line)
        if not first_cells:
            line_index += 1
            continue

        block_start = line_index
        block: list[tuple[str, list[str]]] = []
        while line_index < len(lines):
            cells = _split_table_row(lines[line_index])
            if not cells:
                break
            block.append((lines[line_index].strip(), cells))
            line_index += 1

        indexes = _claim_column_indexes(block[0][1]) if len(block) >= 2 else None
        if indexes is None:
            continue

        excluded_line_indexes.update(range(block_start, block_start + len(block)))
        id_index, _, _, _ = indexes
        data_start = 2 if _is_separator_row(block[1][1]) else 1
        section_headings = [
            f"{'#' * depth} {headings[depth]}"
            for depth in sorted(headings)
            if 1 < depth <= heading_depth
        ]
        section_identity = " / ".join(
            headings[depth] for depth in sorted(headings) if depth <= heading_depth
        ) or "__root__"
        for offset, (raw_row, cells) in enumerate(block[data_start:], start=data_start):
            claim_id = _strip_markdown_token(cells[id_index]) if id_index < len(cells) else ""
            claim_rows.append(
                {
                    "claimId": claim_id,
                    "rawRow": raw_row,
                    "tableHeader": block[0][0],
                    "sectionHeadings": section_headings,
                    "sectionIdentity": section_identity,
                    "lineNumber": block_start + offset + 1,
                }
            )

    return document_title, claim_rows, excluded_line_indexes


def _compact_v2_overview(text: str, excluded_line_indexes: set[int], max_chars: int) -> str:
    """Build one bounded overview while excluding every audited claim table."""

    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks: list[str] = []
    current: list[str] = []

    def flush() -> None:
        if current:
            normalised = _normalise_text("\n".join(current))
            current.clear()
            if normalised:
                blocks.append(normalised)

    for index, raw_line in enumerate(lines):
        if index in excluded_line_indexes or not raw_line.strip():
            flush()
            continue
        current.append(raw_line.strip())
    flush()

    selected = ""
    for block in blocks:
        candidate = block if not selected else f"{selected}\n\n{block}"
        normalised_candidate = _normalise_text(candidate)
        if len(normalised_candidate) <= max_chars:
            selected = candidate
            continue
        if not selected:
            selected = _split_long_text(block, max_chars)[0]
        break
    return _normalise_text(selected)


def _build_v2_chunk_candidates(
    text: str,
    document_id: str,
    version: str,
    policy_version: str,
    max_chars: int,
    heading_depth: int,
    include_document_overview: bool,
) -> list[dict[str, Any]]:
    document_title, claim_rows, excluded_line_indexes = _extract_v2_claim_rows(text, heading_depth)
    section_indexes: dict[str, int] = {}
    chunks: list[dict[str, Any]] = []

    def append_chunk(content: str, section: str, chunk_kind: str, claim_ids: list[str]) -> None:
        normalised = _normalise_text(content)
        chunk_index = section_indexes.get(section, 0)
        section_indexes[section] = chunk_index + 1
        chunk_material = json.dumps(
            [document_id, version, policy_version, section, chunk_index, chunk_kind, claim_ids, normalised],
            ensure_ascii=False,
            separators=(",", ":"),
        )
        content_hash = _sha256_bytes(chunk_material.encode("utf-8"))
        chunks.append(
            {
                "chunkKey": _sha256_bytes(f"chunk|{content_hash}".encode("utf-8")),
                "contentSha256": content_hash,
                "documentId": document_id,
                "documentVersion": version,
                "policyVersion": policy_version,
                "sectionKey": _sha256_bytes(section.encode("utf-8")),
                "chunkIndex": chunk_index,
                "charCount": len(normalised),
                "content": normalised,
                "section": section,
                "chunkKind": chunk_kind,
                "claimIds": claim_ids,
            }
        )

    if include_document_overview:
        overview = _compact_v2_overview(text, excluded_line_indexes, max_chars)
        if overview:
            append_chunk(overview, "__document_overview__", "OVERVIEW", [])

    for claim_row in claim_rows:
        content_parts = [document_title, *claim_row["sectionHeadings"], claim_row["tableHeader"], claim_row["rawRow"]]
        claim_ids = [claim_row["claimId"]] if claim_row["claimId"] else []
        append_chunk(
            "\n\n".join(part for part in content_parts if part),
            claim_row["sectionIdentity"],
            "CLAIM",
            claim_ids,
        )

    return sorted(
        chunks,
        key=lambda item: (item["documentId"], item["documentVersion"], item["sectionKey"], item["chunkIndex"]),
    )


def build_chunks(
    text: str,
    document_id: str,
    version: str,
    chunking_policy: dict[str, Any],
    *,
    include_content: bool = False,
) -> list[dict[str, Any]]:
    """Reconstruct deterministic v1 or v2 chunks from an audited policy.

    With ``include_content=False`` this returns the content-free report
    projection.  ``include_content=True`` additionally retains normalized
    ``content``, raw ``section``, ``chunkKind`` and ``claimIds`` for an
    offline ingest planner.  V2 always exposes ``chunkKind`` and ``claimIds``
    in its report projection so claim coverage can be audited without exposing
    statements.
    """

    if not isinstance(chunking_policy, dict):
        raise ValueError("Chunking policy must be an object.")
    strategy = chunking_policy.get("strategy")
    policy_version = chunking_policy.get("policyVersion")
    max_chars = chunking_policy.get("maxChars")
    if (
        not isinstance(policy_version, str)
        or POLICY_VERSION_RE.fullmatch(policy_version) is None
        or not isinstance(max_chars, int)
        or isinstance(max_chars, bool)
        or max_chars <= 0
        or max_chars > MAX_CHUNK_CHARS
        or chunking_policy.get("overlapChars") != 0
        or chunking_policy.get("headingDepth") != 3
    ):
        raise ValueError("Chunking policy is not safe for deterministic reconstruction.")

    if strategy == V1_CHUNK_STRATEGY:
        candidates = _build_v1_chunk_candidates(text, document_id, version, policy_version, max_chars)
    elif strategy == V2_CHUNK_STRATEGY:
        if (
            policy_version != V2_POLICY_VERSION
            or type(chunking_policy.get("overlapChars")) is not int
            or chunking_policy.get("overlapChars") != 0
            or type(chunking_policy.get("headingDepth")) is not int
            or chunking_policy.get("headingDepth") != 3
            or type(chunking_policy.get("claimRowsPerChunk")) is not int
            or chunking_policy.get("claimRowsPerChunk") != 1
            or chunking_policy.get("includeDocumentOverview") is not True
        ):
            raise ValueError("V2 claim-row chunking policy does not match the audited contract.")
        candidates = _build_v2_chunk_candidates(
            text,
            document_id,
            version,
            policy_version,
            max_chars,
            int(chunking_policy["headingDepth"]),
            bool(chunking_policy["includeDocumentOverview"]),
        )
    else:
        raise ValueError("Unsupported chunking strategy.")

    projected: list[dict[str, Any]] = []
    for candidate in candidates:
        chunk = {
            key: value
            for key, value in candidate.items()
            if key not in {"content", "section", "chunkKind", "claimIds"}
        }
        if strategy == V2_CHUNK_STRATEGY or include_content:
            chunk["chunkKind"] = candidate["chunkKind"]
            chunk["claimIds"] = list(candidate["claimIds"])
        if include_content:
            chunk["content"] = candidate["content"]
            chunk["section"] = candidate["section"]
        projected.append(chunk)
    return projected


def _validate_v2_chunk_contract(
    text: str,
    document_location: str,
    heading_depth: int,
    max_chars: int,
    chunks: list[dict[str, Any]],
    claim_count: int,
    claim_ids: set[str],
    errors: list[dict[str, str]],
) -> None:
    document_title, claim_rows, _ = _extract_v2_claim_rows(text, heading_depth)
    if not document_title:
        _error(
            errors,
            "V2_DOCUMENT_TITLE_MISSING",
            document_location,
            "V2 claim chunks require a level-one Markdown document title.",
        )
    for claim_row in claim_rows:
        if not claim_row["sectionHeadings"]:
            _error(
                errors,
                "V2_CLAIM_SECTION_MISSING",
                f"{document_location}:line:{claim_row['lineNumber']}",
                "Each V2 claim row must be under a level-two or level-three section heading.",
            )

    claim_chunks = [chunk for chunk in chunks if chunk.get("chunkKind") == "CLAIM"]
    overview_chunks = [chunk for chunk in chunks if chunk.get("chunkKind") == "OVERVIEW"]
    unknown_chunks = [
        chunk for chunk in chunks if chunk.get("chunkKind") not in {"CLAIM", "OVERVIEW"}
    ]
    for chunk in claim_chunks:
        chunk_claim_ids = chunk.get("claimIds")
        if not isinstance(chunk_claim_ids, list) or len(chunk_claim_ids) != 1:
            _error(
                errors,
                "V2_CLAIM_CHUNK_ID_COUNT_INVALID",
                document_location,
                "Each V2 CLAIM chunk must identify exactly one claim ID.",
            )
        if chunk.get("charCount", 0) > max_chars:
            _error(
                errors,
                "V2_CLAIM_CHUNK_TOO_LARGE",
                document_location,
                "A complete V2 claim chunk exceeds maxChars; claim rows are never split.",
            )
    for chunk in overview_chunks:
        if chunk.get("claimIds") != []:
            _error(
                errors,
                "V2_OVERVIEW_CLAIM_ID_INVALID",
                document_location,
                "A V2 OVERVIEW chunk must identify zero claim IDs.",
            )
        if chunk.get("charCount", 0) > max_chars:
            _error(
                errors,
                "V2_OVERVIEW_TOO_LARGE",
                document_location,
                "The compact V2 overview exceeds maxChars.",
            )
    if len(overview_chunks) > 1:
        _error(
            errors,
            "V2_OVERVIEW_COUNT_INVALID",
            document_location,
            "V2 creates at most one document overview chunk.",
        )
    if unknown_chunks:
        _error(
            errors,
            "V2_CHUNK_KIND_INVALID",
            document_location,
            "V2 chunks must be classified as CLAIM or OVERVIEW.",
        )

    chunk_claim_ids = [
        chunk["claimIds"][0]
        for chunk in claim_chunks
        if isinstance(chunk.get("claimIds"), list) and len(chunk["claimIds"]) == 1
    ]
    if len(claim_chunks) != claim_count or sorted(chunk_claim_ids) != sorted(claim_ids):
        _error(
            errors,
            "V2_CLAIM_CHUNK_COVERAGE_INVALID",
            document_location,
            "V2 must create exactly one unique CLAIM chunk for every audited claim row.",
        )


def _planned_action(document: dict[str, Any], idempotency: Any) -> tuple[str, str | None]:
    if not isinstance(idempotency, dict):
        return "CREATE", None
    baseline = idempotency.get("baselineDocuments", [])
    if not isinstance(baseline, list):
        return "CREATE", None
    for existing in baseline:
        if not isinstance(existing, dict):
            continue
        if existing.get("id") == document.get("id") and existing.get("version") == document.get("version"):
            if existing.get("canonicalSha256") == document.get("canonicalSha256"):
                return "SKIP_IDENTICAL", None
            return "BLOCK_VERSION_DRIFT", "Existing id/version has a different canonical SHA-256."
    return "CREATE", None


def _find_repository_root(start: Path) -> Path | None:
    for candidate in (start, *start.parents):
        if (candidate / ".git").exists():
            return candidate.resolve()
    return None


def _validate_inventory(
    inventory: Any,
    errors: list[dict[str, str]],
    warnings: list[dict[str, str]],
    repository_root: Path | None,
    current_hash_required_source_ids: set[str] | None = None,
) -> dict[str, dict[str, Any]]:
    for field in _missing_fields(inventory, INVENTORY_FIELDS):
        _error(errors, "INVENTORY_FIELD_MISSING", f"inventory.{field}", "Required inventory field is missing.")
    if not isinstance(inventory, dict):
        return {}
    if inventory.get("targetIsland") != EXPECTED_ISLAND:
        _error(errors, "INVENTORY_TARGET_ISLAND_INVALID", "inventory.targetIsland", "Target island must be exactly 'doorstar'.")
    if inventory.get("dryRunOnly") is not True:
        _error(errors, "INVENTORY_DRY_RUN_ONLY_INVALID", "inventory.dryRunOnly", "Source inventory must be marked dryRunOnly=true.")
    if inventory.get("ragIndexable") is not False:
        _error(errors, "INVENTORY_RAG_INDEXABLE", "inventory.ragIndexable", "Source inventory must never be RAG-indexable.")
    mutation_policy = inventory.get("mutationPolicy")
    if not isinstance(mutation_policy, dict) or mutation_policy.get("nexus") != "FORBIDDEN" or mutation_policy.get("chromaDb") != "FORBIDDEN":
        _error(errors, "INVENTORY_MUTATION_POLICY_INVALID", "inventory.mutationPolicy", "Inventory must forbid both Nexus and ChromaDB mutation.")
    if inventory.get("hashAlgorithm") != "sha256":
        _error(errors, "INVENTORY_HASH_ALGORITHM_INVALID", "inventory.hashAlgorithm", "Inventory hash algorithm must be sha256.")
    if inventory.get("pathBase") != "repository-root":
        _error(errors, "INVENTORY_PATH_BASE_INVALID", "inventory.pathBase", "Inventory paths must be based at repository-root.")
    if inventory.get("pathFormat") != "POSIX relative":
        _error(errors, "INVENTORY_PATH_FORMAT_INVALID", "inventory.pathFormat", "Inventory paths must use POSIX relative format.")

    indexed: dict[str, dict[str, Any]] = {}
    sources = inventory.get("sources")
    if not isinstance(sources, list):
        _error(errors, "INVENTORY_SOURCES_INVALID", "inventory.sources", "Inventory sources must be an array.")
        return indexed
    if inventory.get("sourceCount") != len(sources):
        _error(errors, "INVENTORY_SOURCE_COUNT_MISMATCH", "inventory.sourceCount", "sourceCount must equal the number of source entries.")
    for index, source in enumerate(sources):
        location = f"inventory.sources[{index}]"
        for field in _missing_fields(source, INVENTORY_SOURCE_FIELDS):
            _error(errors, "INVENTORY_SOURCE_FIELD_MISSING", f"{location}.{field}", "Required source field is missing.")
        if not isinstance(source, dict):
            continue
        source_id = source.get("sourceId")
        if not isinstance(source_id, str) or SOURCE_ID_RE.fullmatch(source_id) is None:
            _error(errors, "INVENTORY_SOURCE_ID_INVALID", f"{location}.sourceId", "Source ID must use only audited identifier characters.")
        elif source_id in indexed:
            _error(errors, "INVENTORY_SOURCE_DUPLICATE", f"{location}.sourceId", f"Duplicate source ID '{source_id}'.")
        else:
            indexed[source_id] = source
        if not _safe_relative_path(source.get("relativePath")):
            _error(errors, "INVENTORY_SOURCE_PATH_UNSAFE", f"{location}.relativePath", "Source path must be safe POSIX-relative.")
        elif repository_root is not None:
            source_file = _resolve_inside(repository_root, source["relativePath"])
            if source_file is None or not source_file.is_file():
                _error(errors, "INVENTORY_SOURCE_FILE_NOT_FOUND", f"{location}.relativePath", "Pinned repository source file does not exist.")
            elif _is_sha256(source.get("sha256")) and _sha256_file(source_file) != str(source.get("sha256")).lower():
                if current_hash_required_source_ids is None or source_id in current_hash_required_source_ids:
                    _error(errors, "INVENTORY_SOURCE_HASH_DRIFT", f"{location}.sha256", f"Repository source hash has drifted for '{source_id}'.")
                else:
                    _warning(
                        warnings,
                        "INVENTORY_UNREFERENCED_SOURCE_DRIFT",
                        f"{location}.sha256",
                        f"Unreferenced inventory snapshot hash has drifted for '{source_id}'.",
                    )
        if not _is_sha256(source.get("sha256")):
            _error(errors, "INVENTORY_SOURCE_HASH_INVALID", f"{location}.sha256", "Source hash must be a full SHA-256.")
        for boolean_field in ("containsPersonalData", "containsCustomerData", "containsOrderData"):
            if not isinstance(source.get(boolean_field), bool):
                _error(errors, "INVENTORY_SOURCE_FLAG_INVALID", f"{location}.{boolean_field}", "Data-presence flag must be boolean.")
        sensitive_flags = (
            source.get("containsPersonalData") is True
            or source.get("containsCustomerData") is True
            or source.get("containsOrderData") is True
        )
        if source.get("disposition") == "PROCESS" and sensitive_flags:
            _error(
                errors,
                "INVENTORY_SENSITIVE_SOURCE_PROCESS_FORBIDDEN",
                f"{location}.disposition",
                "A source carrying personal, customer, or order data cannot be classified PROCESS.",
            )
        if source.get("disposition") not in {"PROCESS", "EXCLUDE", "HUMAN_REVIEW"}:
            _error(
                errors,
                "INVENTORY_SOURCE_DISPOSITION_INVALID",
                f"{location}.disposition",
                "Disposition must be PROCESS, EXCLUDE, or HUMAN_REVIEW.",
            )
        if not isinstance(source.get("rationale"), str) or not source.get("rationale", "").strip():
            _error(errors, "INVENTORY_SOURCE_RATIONALE_INVALID", f"{location}.rationale", "Source rationale must be non-empty.")
    return indexed


def _validate_eval(
    eval_data: Any,
    manifest: dict[str, Any],
    document_claims: dict[str, set[str]],
    document_sources: dict[str, set[str]],
    inventory_by_id: dict[str, dict[str, Any]],
    errors: list[dict[str, str]],
) -> int:
    for field in _missing_fields(eval_data, EVAL_FIELDS):
        _error(errors, "EVAL_FIELD_MISSING", f"eval.{field}", "Required eval field is missing.")
    if not isinstance(eval_data, dict):
        return 0
    if eval_data.get("schemaVersion") != "doorstar-rag-eval.v1":
        _error(errors, "EVAL_SCHEMA_INVALID", "eval.schemaVersion", "Eval schema must be doorstar-rag-eval.v1.")
    if eval_data.get("packageId") != manifest.get("packageId"):
        _error(errors, "EVAL_PACKAGE_ID_MISMATCH", "eval.packageId", "Eval packageId must match the manifest.")
    if eval_data.get("targetIsland") != EXPECTED_ISLAND:
        _error(errors, "EVAL_TARGET_ISLAND_INVALID", "eval.targetIsland", "Eval target island must be exactly 'doorstar'.")
    questions = eval_data.get("questions")
    if not isinstance(questions, list):
        _error(errors, "EVAL_QUESTIONS_INVALID", "eval.questions", "Eval questions must be an array.")
        return 0
    if len(questions) < 20:
        _error(errors, "EVAL_QUESTION_COUNT_LOW", "eval.questions", "At least 20 eval questions are required.")

    seen_ids: set[str] = set()
    for index, question in enumerate(questions):
        location = f"eval.questions[{index}]"
        for field in _missing_fields(question, EVAL_QUESTION_FIELDS):
            _error(errors, "EVAL_QUESTION_FIELD_MISSING", f"{location}.{field}", "Required eval question field is missing.")
        if not isinstance(question, dict):
            continue
        question_id = question.get("id")
        if not isinstance(question_id, str) or not question_id.strip():
            _error(errors, "EVAL_QUESTION_ID_INVALID", f"{location}.id", "Eval question ID must be non-empty.")
        elif question_id in seen_ids:
            _error(errors, "EVAL_QUESTION_ID_DUPLICATE", f"{location}.id", f"Eval question ID '{question_id}' is duplicated.")
        else:
            seen_ids.add(question_id)
        question_text = question.get("question")
        if not isinstance(question_text, str) or not question_text.strip():
            _error(errors, "EVAL_QUESTION_TEXT_INVALID", f"{location}.question", "Eval question text must be non-empty.")
        elif any(pattern.search(question_text) for _, pattern in PII_PATTERNS):
            _error(errors, "EVAL_SENSITIVE_PATTERN_DETECTED", f"{location}.question", "Eval question contains a prohibited personal or order-specific pattern.")

        expected_documents = question.get("expectedDocumentIds")
        expected_sources = question.get("expectedSourceIds")
        expected_claims = question.get("expectedClaimIds")
        expected_document_mode = question.get("expectedDocumentMode")
        if (
            expected_document_mode is not None
            and expected_document_mode not in ALLOWED_EXPECTED_DOCUMENT_MODES
        ):
            _error(
                errors,
                "EVAL_EXPECTED_DOCUMENT_MODE_INVALID",
                f"{location}.expectedDocumentMode",
                "Optional expectedDocumentMode must be ALL or ANY.",
            )
        arrays = (
            ("expectedDocumentIds", expected_documents),
            ("expectedSourceIds", expected_sources),
            ("expectedClaimIds", expected_claims),
        )
        for field, values in arrays:
            if not isinstance(values, list) or not values or any(not isinstance(value, str) or not value.strip() for value in values):
                _error(errors, "EVAL_EXPECTATION_INVALID", f"{location}.{field}", "Expected IDs must be a non-empty string array.")
        if isinstance(expected_documents, list):
            for document_id in expected_documents:
                if isinstance(document_id, str) and document_id not in document_claims:
                    _error(errors, "EVAL_DOCUMENT_UNKNOWN", f"{location}.expectedDocumentIds", f"Unknown expected document ID '{document_id}'.")
        if isinstance(expected_sources, list):
            allowed_sources: set[str] = set()
            if isinstance(expected_documents, list):
                for document_id in expected_documents:
                    if isinstance(document_id, str):
                        allowed_sources.update(document_sources.get(document_id, set()))
            for source_id in expected_sources:
                if not isinstance(source_id, str):
                    continue
                inventory_source = inventory_by_id.get(source_id)
                if inventory_source is None:
                    _error(errors, "EVAL_SOURCE_UNKNOWN", f"{location}.expectedSourceIds", f"Unknown expected source ID '{source_id}'.")
                elif inventory_source.get("disposition") == "EXCLUDE":
                    _error(errors, "EVAL_SOURCE_EXCLUDED", f"{location}.expectedSourceIds", f"Excluded source ID '{source_id}' cannot be an expected answer source.")
                if source_id not in allowed_sources:
                    _error(
                        errors,
                        "EVAL_SOURCE_NOT_DECLARED_BY_DOCUMENT",
                        f"{location}.expectedSourceIds",
                        f"Expected source ID '{source_id}' is not declared by any expected document.",
                    )
        if isinstance(expected_claims, list) and isinstance(expected_documents, list):
            allowed_claims: set[str] = set()
            for document_id in expected_documents:
                if isinstance(document_id, str):
                    allowed_claims.update(document_claims.get(document_id, set()))
            for claim_id in expected_claims:
                if isinstance(claim_id, str) and claim_id not in allowed_claims:
                    _error(
                        errors,
                        "EVAL_CLAIM_UNKNOWN",
                        f"{location}.expectedClaimIds",
                        f"Expected claim ID '{claim_id}' is absent from the expected documents.",
                    )
    return len(questions)


def validate_package(
    manifest_path: str | Path,
    inventory_path: str | Path,
    output_path: str | Path | None = None,
) -> dict[str, Any]:
    """Validate a package and return a deterministic, content-free dry-run report."""

    manifest_file = Path(manifest_path).resolve()
    inventory_file = Path(inventory_path).resolve()
    package_root = manifest_file.parent
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    manifest = _load_json(manifest_file, errors, "manifest")
    inventory = _load_json(inventory_file, errors, "inventory")
    manifest_hash = _sha256_file(manifest_file) if manifest_file.is_file() else None
    inventory_hash = _sha256_file(inventory_file) if inventory_file.is_file() else None
    eval_data: Any = None
    eval_hash: str | None = None
    eval_file: Path | None = None

    for field in _missing_fields(manifest, MANIFEST_FIELDS):
        _error(errors, "MANIFEST_FIELD_MISSING", f"manifest.{field}", "Required manifest field is missing.")
    if not isinstance(manifest, dict):
        manifest = {}
    if manifest.get("targetIsland") != EXPECTED_ISLAND:
        _error(errors, "TARGET_ISLAND_INVALID", "manifest.targetIsland", "Target island must be exactly 'doorstar'.")
    if manifest.get("mode") != EXPECTED_MODE:
        _error(errors, "MODE_NOT_DRY_RUN", "manifest.mode", "Manifest mode must be exactly 'dry-run'.")
    if manifest.get("nexusWrite") is not False:
        _error(errors, "NEXUS_WRITE_FORBIDDEN", "manifest.nexusWrite", "Nexus writes must be false.")
    if manifest.get("chromaWrite") is not False:
        _error(errors, "CHROMA_WRITE_FORBIDDEN", "manifest.chromaWrite", "ChromaDB writes must be false.")
    if not isinstance(manifest.get("idempotency"), dict):
        _error(errors, "IDEMPOTENCY_INVALID", "manifest.idempotency", "Idempotency configuration must be an object.")
    else:
        idempotency = manifest["idempotency"]
        if idempotency.get("documentKeyAlgorithm") != "sha256(id|version|canonicalSha256|policyVersion)":
            _error(errors, "IDEMPOTENCY_ALGORITHM_INVALID", "manifest.idempotency.documentKeyAlgorithm", "Document key algorithm does not match the v1 contract.")
        if idempotency.get("duplicatePolicy") != "reject":
            _error(errors, "IDEMPOTENCY_DUPLICATE_POLICY_INVALID", "manifest.idempotency.duplicatePolicy", "Duplicate policy must be reject.")
        if not isinstance(idempotency.get("baselineDocuments"), list):
            _error(errors, "IDEMPOTENCY_BASELINE_INVALID", "manifest.idempotency.baselineDocuments", "baselineDocuments must be an array.")

    source_inventory_relative = manifest.get("sourceInventoryFile")
    if not _safe_relative_path(source_inventory_relative):
        _error(errors, "SOURCE_INVENTORY_PATH_UNSAFE", "manifest.sourceInventoryFile", "Inventory path must be safe POSIX-relative.")
    else:
        declared_inventory = _resolve_inside(package_root, source_inventory_relative)
        if declared_inventory != inventory_file:
            _error(
                errors,
                "SOURCE_INVENTORY_ARGUMENT_MISMATCH",
                "manifest.sourceInventoryFile",
                "CLI inventory path does not match the manifest declaration.",
            )

    eval_relative = manifest.get("evalFile")
    if not _safe_relative_path(eval_relative) or PurePosixPath(str(eval_relative)).suffix.lower() != ".json":
        _error(errors, "EVAL_PATH_UNSAFE", "manifest.evalFile", "Eval path must be a safe POSIX-relative JSON file.")
    else:
        eval_file = _resolve_inside(package_root, eval_relative)
        if eval_file is None or not eval_file.is_file():
            _error(errors, "EVAL_FILE_NOT_FOUND", "manifest.evalFile", "Declared eval file does not exist inside the package.")
        else:
            eval_data = _load_json(eval_file, errors, "eval")
            eval_hash = _sha256_file(eval_file)

    documents = manifest.get("documents")
    if not isinstance(documents, list):
        _error(errors, "DOCUMENTS_INVALID", "manifest.documents", "Documents must be an array.")
        documents = []
    v2_claim_row_package = bool(documents) and all(
        isinstance(document, dict)
        and isinstance(document.get("chunkingPolicy"), dict)
        and document["chunkingPolicy"].get("strategy") == V2_CHUNK_STRATEGY
        for document in documents
    )
    referenced_inventory_sources: set[str] = set()
    if v2_claim_row_package:
        for document in documents:
            for source in document.get("sources", []):
                if isinstance(source, dict) and isinstance(source.get("sourceId"), str):
                    referenced_inventory_sources.add(source["sourceId"])

    repository_root = _find_repository_root(package_root)
    if repository_root is None:
        _error(
            errors,
            "REPOSITORY_ROOT_NOT_FOUND",
            "inventory.pathBase",
            "repository-root source hashes cannot be verified outside a repository checkout.",
        )
    inventory_by_id = _validate_inventory(
        inventory,
        errors,
        warnings,
        repository_root,
        referenced_inventory_sources if v2_claim_row_package else None,
    )

    seen_id_versions: dict[tuple[str, str], tuple[str, str]] = {}
    seen_document_keys: dict[str, tuple[str, str]] = {}
    document_reports: list[dict[str, Any]] = []
    all_chunks: list[dict[str, Any]] = []
    total_claims = 0
    document_claims: dict[str, set[str]] = {}
    document_source_ids: dict[str, set[str]] = {}

    for index, document in enumerate(documents):
        location = f"manifest.documents[{index}]"
        for field in _missing_fields(document, DOCUMENT_FIELDS):
            _error(errors, "DOCUMENT_FIELD_MISSING", f"{location}.{field}", "Required document field is missing.")
        if not isinstance(document, dict):
            continue

        document_id = document.get("id")
        version = document.get("version")
        canonical_sha = str(document.get("canonicalSha256", "")).lower()
        policy = document.get("chunkingPolicy")
        policy_version = policy.get("policyVersion", "") if isinstance(policy, dict) else ""
        if not isinstance(document_id, str) or DOCUMENT_ID_RE.fullmatch(document_id) is None:
            _error(errors, "DOCUMENT_ID_INVALID", f"{location}.id", "Document ID must use lowercase audited identifier characters.")
            document_id = f"__invalid_{index}"
        if not isinstance(version, str) or SEMVER_RE.fullmatch(version) is None:
            _error(errors, "DOCUMENT_VERSION_INVALID", f"{location}.version", "Document version must be semantic version syntax.")
            version = "__invalid"
        if not _is_sha256(canonical_sha):
            _error(errors, "CANONICAL_HASH_INVALID", f"{location}.canonicalSha256", "Canonical hash must be a full SHA-256.")

        pair = (document_id, version)
        previous = seen_id_versions.get(pair)
        if previous is not None:
            previous_sha, previous_policy = previous
            code = "DUPLICATE_DOCUMENT" if (previous_sha, previous_policy) == (canonical_sha, policy_version) else "DOCUMENT_VERSION_CONFLICT"
            _error(errors, code, location, f"Document id/version '{document_id}@{version}' is duplicated.")
        else:
            seen_id_versions[pair] = (canonical_sha, policy_version)

        for text_field in ("title", "domain", "owner", "validFrom"):
            if not isinstance(document.get(text_field), str) or not document.get(text_field, "").strip():
                _error(errors, "DOCUMENT_VALUE_INVALID", f"{location}.{text_field}", "Value must be a non-empty string.")
        tags = document.get("tags")
        if not isinstance(tags, list) or not tags or any(not isinstance(tag, str) or not tag.strip() for tag in tags):
            _error(errors, "DOCUMENT_TAGS_INVALID", f"{location}.tags", "Tags must be a non-empty string array.")
        if document.get("reviewStatus") not in SAFE_REVIEW_STATUSES:
            _error(
                errors,
                "DOCUMENT_REVIEW_STATUS_INVALID",
                f"{location}.reviewStatus",
                "Document must remain in a non-approved human-review state.",
            )
        if document.get("sensitivity") != "INTERNAL":
            _error(errors, "DOCUMENT_SENSITIVITY_INVALID", f"{location}.sensitivity", "Canonical document sensitivity must be INTERNAL.")

        if not isinstance(policy, dict):
            _error(errors, "CHUNK_POLICY_INVALID", f"{location}.chunkingPolicy", "Chunking policy must be an object.")
            policy = {}
        policy_strategy = policy.get("strategy")
        expected_policy = {
            "strategy": V1_CHUNK_STRATEGY,
            "maxChars": MAX_CHUNK_CHARS,
            "overlapChars": 0,
            "headingDepth": 3,
        }
        if policy_strategy == V2_CHUNK_STRATEGY:
            expected_policy = {
                "strategy": V2_CHUNK_STRATEGY,
                "policyVersion": V2_POLICY_VERSION,
                "maxChars": MAX_CHUNK_CHARS,
                "overlapChars": 0,
                "headingDepth": 3,
                "claimRowsPerChunk": 1,
                "includeDocumentOverview": True,
            }
        for field, expected in expected_policy.items():
            if policy.get(field) != expected:
                _error(
                    errors,
                    "CHUNK_POLICY_UNSAFE",
                    f"{location}.chunkingPolicy.{field}",
                    f"Chunk policy value must be {expected!r}.",
                )
        if policy_strategy == V2_CHUNK_STRATEGY:
            if type(policy.get("overlapChars")) is not int:
                _error(
                    errors,
                    "CHUNK_POLICY_UNSAFE",
                    f"{location}.chunkingPolicy.overlapChars",
                    "overlapChars must be the integer 0.",
                )
            if type(policy.get("headingDepth")) is not int:
                _error(
                    errors,
                    "CHUNK_POLICY_UNSAFE",
                    f"{location}.chunkingPolicy.headingDepth",
                    "headingDepth must be the integer 3.",
                )
            if type(policy.get("claimRowsPerChunk")) is not int:
                _error(
                    errors,
                    "CHUNK_POLICY_UNSAFE",
                    f"{location}.chunkingPolicy.claimRowsPerChunk",
                    "claimRowsPerChunk must be the integer 1.",
                )
            if policy.get("includeDocumentOverview") is not True:
                _error(
                    errors,
                    "CHUNK_POLICY_UNSAFE",
                    f"{location}.chunkingPolicy.includeDocumentOverview",
                    "includeDocumentOverview must be the boolean true.",
                )
        if not isinstance(policy.get("policyVersion"), str) or POLICY_VERSION_RE.fullmatch(policy.get("policyVersion", "")) is None:
            _error(errors, "CHUNK_POLICY_VERSION_INVALID", f"{location}.chunkingPolicy.policyVersion", "Policy version must use audited identifier characters.")
        max_chars = policy.get("maxChars")
        if not isinstance(max_chars, int) or isinstance(max_chars, bool) or max_chars <= 0 or max_chars > MAX_CHUNK_CHARS:
            _error(errors, "CHUNK_MAX_CHARS_INVALID", f"{location}.chunkingPolicy.maxChars", "maxChars must be an integer from 1 through 1600.")
            max_chars = MAX_CHUNK_CHARS

        document_sources = document.get("sources")
        declared_source_hashes: dict[str, str] = {}
        declared_source_ids: list[str] = []
        if not isinstance(document_sources, list) or not document_sources:
            _error(errors, "DOCUMENT_SOURCES_INVALID", f"{location}.sources", "Document sources must be a non-empty array.")
            document_sources = []
        for source_index, source in enumerate(document_sources):
            source_location = f"{location}.sources[{source_index}]"
            for field in _missing_fields(source, DOCUMENT_SOURCE_FIELDS):
                _error(errors, "DOCUMENT_SOURCE_FIELD_MISSING", f"{source_location}.{field}", "Required document source field is missing.")
            if not isinstance(source, dict):
                continue
            source_id = source.get("sourceId")
            source_hash = str(source.get("sourceHash", "")).lower()
            if not isinstance(source_id, str) or not source_id.strip():
                _error(errors, "DOCUMENT_SOURCE_ID_INVALID", f"{source_location}.sourceId", "Source ID must be non-empty.")
                continue
            if source_id in declared_source_hashes:
                _error(errors, "DOCUMENT_SOURCE_DUPLICATE", f"{source_location}.sourceId", f"Duplicate document source '{source_id}'.")
            declared_source_ids.append(source_id)
            declared_source_hashes[source_id] = source_hash
            inventory_source = inventory_by_id.get(source_id)
            if inventory_source is None:
                _error(errors, "DOCUMENT_SOURCE_NOT_IN_INVENTORY", source_location, f"Source '{source_id}' is absent from inventory.")
                continue
            if inventory_source.get("disposition") == "EXCLUDE":
                _error(errors, "DOCUMENT_SOURCE_EXCLUDED", source_location, f"Excluded source '{source_id}' cannot support canonical knowledge.")
            if source.get("relativePath") != inventory_source.get("relativePath"):
                _error(errors, "DOCUMENT_SOURCE_PATH_MISMATCH", f"{source_location}.relativePath", f"Source path differs from inventory for '{source_id}'.")
            if not _is_sha256(source_hash):
                _error(errors, "DOCUMENT_SOURCE_HASH_INVALID", f"{source_location}.sourceHash", "Source hash must be a full SHA-256.")
            elif source_hash != str(inventory_source.get("sha256", "")).lower():
                _error(errors, "DOCUMENT_SOURCE_HASH_MISMATCH", f"{source_location}.sourceHash", f"Source hash differs from inventory for '{source_id}'.")

        source_refs = document.get("sourceInventoryRefs")
        if not isinstance(source_refs, list) or any(not isinstance(item, str) for item in source_refs):
            _error(errors, "SOURCE_INVENTORY_REFS_INVALID", f"{location}.sourceInventoryRefs", "Source inventory refs must be a string array.")
        elif sorted(source_refs) != sorted(declared_source_ids):
            _error(errors, "SOURCE_INVENTORY_REFS_MISMATCH", f"{location}.sourceInventoryRefs", "Source inventory refs must exactly match document source IDs.")

        canonical_relative = document.get("canonicalFile")
        canonical_text: str | None = None
        if not _safe_relative_path(canonical_relative, markdown=True, canonical=True):
            _error(
                errors,
                "CANONICAL_PATH_UNSAFE",
                f"{location}.canonicalFile",
                "Canonical file must be safe POSIX-relative Markdown under canonical/.",
            )
        elif "preview" in PurePosixPath(canonical_relative).name.lower():
            _error(errors, "CANONICAL_PREVIEW_FORBIDDEN", f"{location}.canonicalFile", "Preview artifacts cannot be canonical knowledge.")
        else:
            canonical_file = _resolve_inside(package_root, canonical_relative)
            if canonical_file is None or not canonical_file.is_file():
                _error(errors, "CANONICAL_FILE_NOT_FOUND", f"{location}.canonicalFile", "Canonical Markdown file does not exist inside the package.")
            elif canonical_file.stat().st_size > MAX_CANONICAL_BYTES:
                _error(errors, "CANONICAL_FILE_TOO_LARGE", f"{location}.canonicalFile", "Canonical Markdown exceeds the 512 KiB safety limit.")
            else:
                raw = canonical_file.read_bytes()
                if b"\x00" in raw:
                    _error(errors, "CANONICAL_BINARY_DETECTED", f"{location}.canonicalFile", "Canonical file contains binary NUL bytes.")
                try:
                    canonical_text = raw.decode("utf-8")
                except UnicodeDecodeError:
                    _error(errors, "CANONICAL_INVALID_UTF8", f"{location}.canonicalFile", "Canonical file must be UTF-8 encoded.")
                current_hash = _sha256_bytes(raw)
                if current_hash != canonical_sha:
                    _error(errors, "CANONICAL_HASH_DRIFT", f"{location}.canonicalSha256", "Canonical file content no longer matches its SHA-256 pin.")

        document_key = _sha256_bytes(
            "|".join([document_id, version, canonical_sha, str(policy.get("policyVersion", ""))]).encode("utf-8")
        )
        previous_key_owner = seen_document_keys.get(document_key)
        if previous_key_owner is not None and previous_key_owner != pair:
            _error(errors, "DOCUMENT_KEY_COLLISION", location, "Distinct id/version pairs produced the same document key.")
        else:
            seen_document_keys[document_key] = pair
        action, action_error = _planned_action(document, manifest.get("idempotency"))
        if action_error:
            _error(errors, "IDEMPOTENCY_VERSION_DRIFT", location, action_error)
        document_chunks: list[dict[str, Any]] = []
        claim_count = 0
        claim_ids: set[str] = set()
        if canonical_text is not None:
            _detect_sensitive_content(canonical_text, canonical_relative, errors)
            claim_count, claim_ids = _validate_claims(canonical_text, canonical_relative, declared_source_hashes, errors)
            try:
                document_chunks = build_chunks(
                    canonical_text,
                    document_id,
                    version,
                    policy,
                )
            except ValueError as exc:
                _error(errors, "CHUNK_RECONSTRUCTION_BLOCKED", f"{location}.chunkingPolicy", str(exc))
            if policy_strategy == V2_CHUNK_STRATEGY and document_chunks:
                _validate_v2_chunk_contract(
                    canonical_text,
                    canonical_relative,
                    int(policy.get("headingDepth", 3)) if isinstance(policy.get("headingDepth"), int) else 3,
                    max_chars,
                    document_chunks,
                    claim_count,
                    claim_ids,
                    errors,
                )
            elif any(chunk["charCount"] > max_chars for chunk in document_chunks):
                _error(errors, "CHUNK_SIZE_INTERNAL_ERROR", location, "Simulated chunk exceeds configured maxChars.")
        total_claims += claim_count
        if document_id in document_claims:
            document_claims[document_id].update(claim_ids)
        else:
            document_claims[document_id] = set(claim_ids)
        if document_id in document_source_ids:
            document_source_ids[document_id].update(declared_source_ids)
        else:
            document_source_ids[document_id] = set(declared_source_ids)
        all_chunks.extend(document_chunks)
        document_reports.append(
            {
                "id": document_id,
                "version": version,
                "canonicalSha256": canonical_sha,
                "documentKey": document_key,
                "plannedAction": action,
                "claimCount": claim_count,
                "chunkCount": len(document_chunks),
            }
        )

    eval_question_count = _validate_eval(
        eval_data,
        manifest,
        document_claims,
        document_source_ids,
        inventory_by_id,
        errors,
    )
    document_reports.sort(key=lambda item: (item["id"], item["version"], item["canonicalSha256"]))
    all_chunks.sort(key=lambda item: (item["documentId"], item["documentVersion"], item["sectionKey"], item["chunkIndex"]))
    errors.sort(key=lambda item: (item["location"], item["code"], item["message"]))
    warnings.sort(key=lambda item: (item["location"], item["code"], item["message"]))

    package_hash_material = {
        "packageId": manifest.get("packageId"),
        "packageVersion": manifest.get("packageVersion"),
        "targetIsland": manifest.get("targetIsland"),
        "manifest": manifest,
        "inventory": inventory,
        "eval": eval_data,
        "documentKeys": [item["documentKey"] for item in document_reports],
    }
    report: dict[str, Any] = {
        "schemaVersion": REPORT_SCHEMA,
        "packageId": manifest.get("packageId"),
        "packageVersion": manifest.get("packageVersion"),
        "packageHash": _canonical_json_hash(package_hash_material),
        "ok": not errors,
        "inputPins": {
            "manifestFile": manifest_file.name,
            "manifestSha256": manifest_hash,
            "inventoryFile": inventory_file.name,
            "inventorySha256": inventory_hash,
            "evalFile": eval_file.name if eval_file is not None else None,
            "evalSha256": eval_hash,
        },
        "dryRunProof": {
            "targetIsland": manifest.get("targetIsland"),
            "mode": manifest.get("mode"),
            "nexusWriteConfigured": manifest.get("nexusWrite"),
            "chromaWriteConfigured": manifest.get("chromaWrite"),
            "nexusWritePerformed": False,
            "chromaWritePerformed": False,
            "networkCallsPerformed": False,
            "sourceContentIncludedInReport": False,
            "optionalLocalReportWrite": output_path is not None,
        },
        "summary": {
            "documentCount": len(document_reports),
            "claimCount": total_claims,
            "chunkCount": len(all_chunks),
            "evalQuestionCount": eval_question_count,
            "createCount": sum(item["plannedAction"] == "CREATE" for item in document_reports),
            "skipIdenticalCount": sum(item["plannedAction"] == "SKIP_IDENTICAL" for item in document_reports),
            "blockVersionDriftCount": sum(item["plannedAction"] == "BLOCK_VERSION_DRIFT" for item in document_reports),
            "errorCount": len(errors),
            "warningCount": len(warnings),
        },
        "documents": document_reports,
        "chunks": all_chunks,
        "errors": errors,
        "warnings": warnings,
    }

    if output_path is not None:
        requested_target = Path(output_path).absolute()
        allowed_parent = package_root.absolute()
        allowed_name = requested_target.name == "DRY_RUN_REPORT.json" or (
            VERSIONED_REPORT_RE.fullmatch(requested_target.name) is not None
        )
        if requested_target.parent != allowed_parent or not allowed_name:
            raise ValueError(
                "Report output must be package-local DRY_RUN_REPORT.json or "
                "DRY_RUN_REPORT.v<semver>.json."
            )
        if requested_target.is_symlink():
            raise ValueError("Report output must not be a symbolic link.")

        protected_inputs = [manifest_file, inventory_file]
        if eval_file is not None:
            protected_inputs.append(eval_file)
        for document in documents:
            if isinstance(document, dict) and _safe_relative_path(
                document.get("canonicalFile"), markdown=True, canonical=True
            ):
                canonical_input = _resolve_inside(package_root, document["canonicalFile"])
                if canonical_input is not None:
                    protected_inputs.append(canonical_input)
        if repository_root is not None and isinstance(inventory, dict):
            for source in inventory.get("sources", []):
                if isinstance(source, dict) and _safe_relative_path(source.get("relativePath")):
                    source_input = _resolve_inside(repository_root, source["relativePath"])
                    if source_input is not None:
                        protected_inputs.append(source_input)
        if requested_target.exists():
            for protected_input in protected_inputs:
                if protected_input.exists() and requested_target.samefile(protected_input):
                    raise ValueError("Report output must not alias a manifest, eval, canonical, or source input.")

        temporary_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                newline="\n",
                prefix=".DRY_RUN_REPORT.",
                suffix=".tmp",
                dir=package_root,
                delete=False,
            ) as handle:
                handle.write(render_report(report))
                temporary_path = Path(handle.name)
            temporary_path.replace(requested_target)
        finally:
            if temporary_path is not None and temporary_path.exists():
                temporary_path.unlink()
    return report


def render_report(report: dict[str, Any]) -> str:
    """Serialize a report reproducibly as sorted UTF-8 JSON."""

    return json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate and simulate a Doorstar-only Nexus RAG package (dry-run; no Nexus/Chroma writes)."
    )
    parser.add_argument("--manifest", required=True, help="Path to doorstar-rag-manifest.v1.json")
    parser.add_argument("--inventory", required=True, help="Path to SOURCE_INVENTORY.json")
    parser.add_argument("--output", help="Optional local path for the deterministic JSON report")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        report = validate_package(args.manifest, args.inventory, args.output)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    sys.stdout.write(render_report(report))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
