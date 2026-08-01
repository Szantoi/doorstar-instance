#!/usr/bin/env python3
"""Build a deterministic, read-only Doorstar Nexus RAG ingest plan.

This planner never connects to Nexus, ChromaDB, a database, or the network and
never writes a payload file.  Its default JSON output is a content-free plan.
The deliberately verbose ``--emit-payload-to-stdout`` switch can add the exact
reconstructed chunk text for a separate, reviewed executor, but only after all
hash, approval, drift, and read-only baseline gates pass.

Execution authorization v1 is a JSON object with these fields::

    {
      "schemaVersion": "doorstar-nexus-rag-execution-authorization.v1",
      "decision": "APPROVED",
      "packageHash": "<sha256>",
      "dryRunReportSha256": "<sha256>",
      "manifestSha256": "<sha256>",
      "inventorySha256": "<sha256>",
      "evalSha256": "<sha256>",
      "targetIsland": "doorstar",
      "targetCollection": "doorstar-knowledge",
      "approvedBy": "<human identity>",
      "approvedAt": "<ISO-8601 timestamp>"
    }

The only supported post-approval source-drift overlay is an optional
``postApprovalSourceDriftOverride`` object.  It may describe, but never mutate
or repin, the non-manifest OpenAPI inventory source::

    {
      "mode": "DESCRIBE_ONLY",
      "sourceId": "SRC-BACKEND-OPENAPI",
      "inventorySha256": "<approved inventory pin>",
      "observedSha256": "<current source hash>",
      "reason": "<human-reviewed reason>",
      "manifestMutation": false
    }

Read-only baseline v1 is a JSON object with ``targetIsland``,
``targetCollection``, ``documents`` and ``chunks``.  Document rows contain
``documentKey``, ``documentId``, ``documentVersion``, ``canonicalSha256`` and
``chunkKeys``.  Chunk rows contain ``chunkKey``, ``contentSha256`` and
``documentKey``.  An explicit empty baseline is valid; an omitted baseline
keeps the preview blocked because absence is not evidence of an empty target.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import sys
import unicodedata
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Sequence


PLAN_SCHEMA = "doorstar-nexus-rag-controlled-ingest-plan.v1"
AUTHORIZATION_SCHEMA = "doorstar-nexus-rag-execution-authorization.v1"
BASELINE_SCHEMA = "doorstar-nexus-rag-readonly-baseline.v1"
EXPECTED_ISLAND = "doorstar"
EXPECTED_COLLECTION = "doorstar-knowledge"
EXPECTED_PACKAGE_SOURCE_PREFIX = "docs/projects/doorstar-nexus-rag"
EXPECTED_CHUNK_COUNT = 41
EXPECTED_POLICY = {
    "strategy": "markdown_heading_paragraph",
    "policyVersion": "v1",
    "maxChars": 1600,
    "overlapChars": 0,
    "headingDepth": 3,
}
EXPECTED_V2_PACKAGE_VERSION = "1.1.0"
EXPECTED_V2_DOCUMENT_COUNT = 6
EXPECTED_V2_CLAIM_COUNT = 98
EXPECTED_V2_CHUNK_COUNT = 104
EXPECTED_V2_POLICY = {
    "strategy": "markdown_claim_rows",
    "policyVersion": "v2",
    "maxChars": 1600,
    "overlapChars": 0,
    "headingDepth": 3,
    "claimRowsPerChunk": 1,
    "includeDocumentOverview": True,
}
OVERRIDABLE_SOURCE_ID = "SRC-BACKEND-OPENAPI"
OVERRIDABLE_SOURCE_PATH = "src/production-service/openapi/production-service.openapi.json"
MAX_JSON_BYTES = 4 * 1024 * 1024
MAX_CANONICAL_BYTES = 512 * 1024

SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
VERSIONED_REPORT_RE = re.compile(
    r"^DRY_RUN_REPORT\.v[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?\.json$"
)
ISO_TIMESTAMP_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)
SENSITIVE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("EMAIL", re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")),
    (
        "PHONE",
        re.compile(
            r"(?<!\w)(?:\+36|06)[\s()./-]*(?:1|20|30|31|50|70)"
            r"[\s()./-]*\d{3}[\s./-]*\d{3,4}(?!\d)"
        ),
    ),
    ("ORDER_NUMBER", re.compile(r"(?i)\bDSMR[\s#:_/-]*\d{5}\b")),
    ("PRIVATE_KEY", re.compile(r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----")),
    (
        "SECRET_LITERAL",
        re.compile(
            r"(?i)\b(?:password|passwd|api[_-]?key|access[_-]?token|client[_-]?secret)"
            r"\s*[:=]\s*[\"']?[^\s\"'`]{8,}"
        ),
    ),
)

AUTHORIZATION_FIELDS = {
    "schemaVersion",
    "decision",
    "packageHash",
    "dryRunReportSha256",
    "manifestSha256",
    "inventorySha256",
    "evalSha256",
    "targetIsland",
    "targetCollection",
    "approvedBy",
    "approvedAt",
}
OVERRIDE_FIELDS = {
    "mode",
    "sourceId",
    "inventorySha256",
    "observedSha256",
    "reason",
    "manifestMutation",
}
BASELINE_DOCUMENT_FIELDS = {
    "documentKey",
    "documentId",
    "documentVersion",
    "canonicalSha256",
    "chunkKeys",
}
BASELINE_CHUNK_FIELDS = {"chunkKey", "contentSha256", "documentKey"}


def _load_dry_run_validator() -> Any:
    """Load the audited sibling dry-run validator without third-party code."""

    path = Path(__file__).resolve().with_name("prepareDoorstarNexusRag.py")
    spec = importlib.util.spec_from_file_location("doorstar_rag_dry_run_for_ingest", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("The audited Doorstar RAG dry-run validator could not be loaded.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


DRY_RUN_VALIDATOR = _load_dry_run_validator()


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _canonical_json_hash(value: Any) -> str:
    return _sha256_bytes(_canonical_json(value).encode("utf-8"))


def _normalise_label(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_like = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "", ascii_like.lower())


def _is_sha256(value: Any) -> bool:
    return isinstance(value, str) and SHA256_RE.fullmatch(value.lower()) is not None


def _safe_relative_path(value: Any) -> bool:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        return False
    path = PurePosixPath(value)
    return not (
        path.is_absolute()
        or not path.parts
        or ":" in path.parts[0]
        or any(part in {"", ".", ".."} for part in path.parts)
        or path.as_posix() != value
    )


def _resolve_inside(root: Path, relative_path: str) -> Path | None:
    candidate = (root / Path(*PurePosixPath(relative_path).parts)).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


def _find_repository_root(start: Path) -> Path | None:
    for candidate in (start, *start.parents):
        if (candidate / ".git").exists():
            return candidate.resolve()
    return None


def _issue(
    issues: list[dict[str, str]],
    code: str,
    location: str,
    message: str,
) -> None:
    issues.append({"code": code, "location": location, "message": message})


def _sorted_unique_issues(issues: Iterable[dict[str, str]]) -> list[dict[str, str]]:
    unique = {
        (item["location"], item["code"], item["message"]): item
        for item in issues
    }
    return [unique[key] for key in sorted(unique)]


class _DuplicateJsonKeyError(ValueError):
    pass


def _reject_duplicate_json_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise _DuplicateJsonKeyError(f"Duplicate JSON key '{key}'.")
        value[key] = item
    return value


def _load_json(
    path: Path,
    location: str,
    errors: list[dict[str, str]],
) -> tuple[Any, bytes | None]:
    try:
        raw = path.read_bytes()
    except FileNotFoundError:
        _issue(errors, "FILE_NOT_FOUND", location, "Required JSON input does not exist.")
        return None, None
    if len(raw) > MAX_JSON_BYTES:
        _issue(errors, "JSON_TOO_LARGE", location, "JSON input exceeds the 4 MiB read-only safety limit.")
        return None, raw
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        _issue(errors, "INVALID_UTF8", location, "JSON input must be UTF-8 encoded.")
        return None, raw
    try:
        return json.loads(text, object_pairs_hook=_reject_duplicate_json_keys), raw
    except json.JSONDecodeError as exc:
        _issue(
            errors,
            "INVALID_JSON",
            location,
            f"Invalid JSON at line {exc.lineno}, column {exc.colno}.",
        )
        return None, raw
    except _DuplicateJsonKeyError:
        _issue(errors, "DUPLICATE_JSON_KEY", location, "JSON input contains a duplicate object key.")
        return None, raw


def _detect_sensitive_text(text: str, location: str, errors: list[dict[str, str]]) -> None:
    for kind, pattern in SENSITIVE_PATTERNS:
        match = pattern.search(text)
        if match:
            line = text.count("\n", 0, match.start()) + 1
            _issue(
                errors,
                f"CANONICAL_{kind}_DETECTED",
                f"{location}:line:{line}",
                f"Canonical payload contains a prohibited {kind.lower()} pattern.",
            )


def _document_key(document: dict[str, Any]) -> str:
    policy = document.get("chunkingPolicy")
    policy_version = policy.get("policyVersion", "") if isinstance(policy, dict) else ""
    material = "|".join(
        [
            str(document.get("id", "")),
            str(document.get("version", "")),
            str(document.get("canonicalSha256", "")).lower(),
            str(policy_version),
        ]
    )
    return _sha256_bytes(material.encode("utf-8"))


def _collect_manifest_source_ids(manifest: Any) -> set[str]:
    source_ids: set[str] = set()
    if not isinstance(manifest, dict) or not isinstance(manifest.get("documents"), list):
        return source_ids
    for document in manifest["documents"]:
        if not isinstance(document, dict):
            continue
        for source in document.get("sources", []):
            if isinstance(source, dict) and isinstance(source.get("sourceId"), str):
                source_ids.add(source["sourceId"])
        for source_id in document.get("sourceInventoryRefs", []):
            if isinstance(source_id, str):
                source_ids.add(source_id)
    return source_ids


def _observe_inventory_sources(
    inventory: Any,
    repository_root: Path | None,
    manifest_source_ids: set[str],
    errors: list[dict[str, str]],
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    observations: list[dict[str, Any]] = []
    tracked: dict[str, str] = {}
    if not isinstance(inventory, dict) or not isinstance(inventory.get("sources"), list):
        return observations, tracked
    if repository_root is None:
        _issue(errors, "REPOSITORY_ROOT_NOT_FOUND", "inventory.pathBase", "Repository root is required.")
        return observations, tracked
    for index, source in enumerate(inventory["sources"]):
        if not isinstance(source, dict):
            continue
        source_id = source.get("sourceId")
        relative_path = source.get("relativePath")
        pinned = str(source.get("sha256", "")).lower()
        if not isinstance(source_id, str) or not _safe_relative_path(relative_path):
            continue
        source_file = _resolve_inside(repository_root, relative_path)
        if source_file is None or not source_file.is_file():
            continue
        current = _sha256_file(source_file)
        tracked[str(source_file)] = current
        observations.append(
            {
                "sourceId": source_id,
                "relativePath": relative_path,
                "inventorySha256": pinned,
                "observedSha256": current,
                "referencedByManifest": source_id in manifest_source_ids,
                "drifted": current != pinned,
                "inventoryIndex": index,
            }
        )
    observations.sort(key=lambda item: (item["sourceId"], item["relativePath"]))
    return observations, tracked


def _validate_authorization(
    authorization: Any,
    expected: dict[str, str],
    errors: list[dict[str, str]],
    blockers: list[dict[str, str]],
) -> tuple[bool, dict[str, Any] | None]:
    if authorization is None:
        _issue(
            blockers,
            "EXECUTION_AUTHORIZATION_MISSING",
            "authorization",
            "Explicit hash-pinned human execution authorization is required.",
        )
        return False, None
    if not isinstance(authorization, dict):
        _issue(errors, "EXECUTION_AUTHORIZATION_INVALID", "authorization", "Authorization must be a JSON object.")
        return False, None
    missing = sorted(AUTHORIZATION_FIELDS - set(authorization))
    for field in missing:
        _issue(errors, "EXECUTION_AUTHORIZATION_FIELD_MISSING", f"authorization.{field}", "Required field is missing.")
    allowed_fields = AUTHORIZATION_FIELDS | {"postApprovalSourceDriftOverride"}
    for field in sorted(set(authorization) - allowed_fields):
        _issue(errors, "EXECUTION_AUTHORIZATION_FIELD_UNKNOWN", f"authorization.{field}", "Unknown authorization field is forbidden.")

    exact_values = {
        "schemaVersion": AUTHORIZATION_SCHEMA,
        "decision": "APPROVED",
        "targetIsland": EXPECTED_ISLAND,
        "targetCollection": EXPECTED_COLLECTION,
        "packageHash": expected.get("packageHash"),
        "dryRunReportSha256": expected.get("dryRunReportSha256"),
        "manifestSha256": expected.get("manifestSha256"),
        "inventorySha256": expected.get("inventorySha256"),
        "evalSha256": expected.get("evalSha256"),
    }
    for field, value in exact_values.items():
        actual = authorization.get(field)
        if field.endswith("Sha256") or field == "packageHash":
            actual = actual.lower() if isinstance(actual, str) else actual
        if actual != value:
            _issue(
                errors,
                "EXECUTION_AUTHORIZATION_PIN_MISMATCH",
                f"authorization.{field}",
                "Authorization value does not match the immutable approved input.",
            )
    if not isinstance(authorization.get("approvedBy"), str) or not authorization.get("approvedBy", "").strip():
        _issue(errors, "EXECUTION_AUTHORIZATION_APPROVER_INVALID", "authorization.approvedBy", "Approver identity is required.")
    approved_at = authorization.get("approvedAt")
    if not isinstance(approved_at, str) or ISO_TIMESTAMP_RE.fullmatch(approved_at) is None:
        _issue(errors, "EXECUTION_AUTHORIZATION_TIMESTAMP_INVALID", "authorization.approvedAt", "approvedAt must be timezone-qualified ISO-8601.")

    auth_errors = [item for item in errors if item["location"].startswith("authorization")]
    summary = {
        "provided": True,
        "valid": not auth_errors,
        "decision": authorization.get("decision"),
        "approvedBy": authorization.get("approvedBy"),
        "approvedAt": authorization.get("approvedAt"),
        "authorizationSha256": expected.get("authorizationSha256"),
    }
    return not auth_errors, summary


def _validate_source_drift_override(
    authorization: Any,
    authorization_valid: bool,
    observations: list[dict[str, Any]],
    errors: list[dict[str, str]],
) -> dict[str, Any] | None:
    drifted = [item for item in observations if item["drifted"]]
    override = authorization.get("postApprovalSourceDriftOverride") if isinstance(authorization, dict) else None

    if not drifted:
        if override is not None:
            _issue(
                errors,
                "SOURCE_DRIFT_OVERRIDE_UNUSED",
                "authorization.postApprovalSourceDriftOverride",
                "A drift override is forbidden when no current source drift exists.",
            )
        return None
    if override is None:
        for item in drifted:
            _issue(
                errors,
                "CURRENT_SOURCE_HASH_DRIFT",
                f"inventory.sources[{item['inventoryIndex']}].sha256",
                f"Current repository source '{item['sourceId']}' differs from its approved inventory pin.",
            )
        return None
    if not authorization_valid:
        _issue(
            errors,
            "SOURCE_DRIFT_OVERRIDE_WITHOUT_VALID_APPROVAL",
            "authorization.postApprovalSourceDriftOverride",
            "A source drift override requires an otherwise valid execution authorization.",
        )
        return None
    if not isinstance(override, dict):
        _issue(errors, "SOURCE_DRIFT_OVERRIDE_INVALID", "authorization.postApprovalSourceDriftOverride", "Override must be an object.")
        return None
    for field in sorted(OVERRIDE_FIELDS - set(override)):
        _issue(errors, "SOURCE_DRIFT_OVERRIDE_FIELD_MISSING", f"authorization.postApprovalSourceDriftOverride.{field}", "Required field is missing.")
    for field in sorted(set(override) - OVERRIDE_FIELDS):
        _issue(errors, "SOURCE_DRIFT_OVERRIDE_FIELD_UNKNOWN", f"authorization.postApprovalSourceDriftOverride.{field}", "Unknown override field is forbidden.")

    source_id = override.get("sourceId")
    matching = [item for item in drifted if item["sourceId"] == source_id]
    if len(drifted) != 1 or len(matching) != 1:
        _issue(
            errors,
            "SOURCE_DRIFT_OVERRIDE_SCOPE_MISMATCH",
            "authorization.postApprovalSourceDriftOverride.sourceId",
            "The v1 override must describe the only observed drift, exactly once.",
        )
        return None
    observed = matching[0]
    checks = {
        "mode": "DESCRIBE_ONLY",
        "sourceId": OVERRIDABLE_SOURCE_ID,
        "inventorySha256": observed["inventorySha256"],
        "observedSha256": observed["observedSha256"],
        "manifestMutation": False,
    }
    for field, expected in checks.items():
        actual = override.get(field)
        if field.endswith("Sha256") and isinstance(actual, str):
            actual = actual.lower()
        if actual != expected:
            _issue(
                errors,
                "SOURCE_DRIFT_OVERRIDE_VALUE_INVALID",
                f"authorization.postApprovalSourceDriftOverride.{field}",
                "Override value is not the exact audited describe-only drift value.",
            )
    if observed["relativePath"] != OVERRIDABLE_SOURCE_PATH or observed["referencedByManifest"]:
        _issue(
            errors,
            "SOURCE_DRIFT_OVERRIDE_SOURCE_FORBIDDEN",
            "authorization.postApprovalSourceDriftOverride.sourceId",
            "Only the non-manifest Doorstar OpenAPI inventory source can receive this overlay.",
        )
    if not isinstance(override.get("reason"), str) or not override.get("reason", "").strip():
        _issue(errors, "SOURCE_DRIFT_OVERRIDE_REASON_INVALID", "authorization.postApprovalSourceDriftOverride.reason", "A reviewed reason is required.")
    override_errors = [
        item for item in errors if item["location"].startswith("authorization.postApprovalSourceDriftOverride")
    ]
    if override_errors:
        return None
    return {
        "mode": "DESCRIBE_ONLY",
        "sourceId": observed["sourceId"],
        "relativePath": observed["relativePath"],
        "inventorySha256": observed["inventorySha256"],
        "observedSha256": observed["observedSha256"],
        "reason": override["reason"],
        "manifestMutationPerformed": False,
        "sourceMutationPerformed": False,
    }


def _validate_baseline(
    baseline: Any,
    baseline_sha256: str | None,
    current_documents: list[dict[str, Any]],
    current_chunks: list[dict[str, Any]],
    errors: list[dict[str, str]],
    blockers: list[dict[str, str]],
) -> tuple[dict[str, Any], dict[str, str], dict[str, str]]:
    document_actions: dict[str, str] = {}
    chunk_actions: dict[str, str] = {}
    if baseline is None:
        _issue(
            blockers,
            "READ_ONLY_BASELINE_MISSING",
            "baseline",
            "An explicit read-only target baseline is required before execution handoff.",
        )
        for document in current_documents:
            document_actions[document["documentKey"]] = "UNKNOWN_BASELINE"
        for chunk in current_chunks:
            chunk_actions[chunk["chunkKey"]] = "UNKNOWN_BASELINE"
        return {
            "provided": False,
            "valid": False,
            "sha256": None,
            "documentCount": None,
            "chunkCount": None,
        }, document_actions, chunk_actions

    if not isinstance(baseline, dict):
        _issue(errors, "BASELINE_INVALID", "baseline", "Baseline must be a JSON object.")
        return {"provided": True, "valid": False, "sha256": baseline_sha256}, document_actions, chunk_actions
    if baseline.get("schemaVersion") != BASELINE_SCHEMA:
        _issue(errors, "BASELINE_SCHEMA_INVALID", "baseline.schemaVersion", "Unexpected baseline schema.")
    if baseline.get("targetIsland") != EXPECTED_ISLAND:
        _issue(errors, "BASELINE_TARGET_ISLAND_INVALID", "baseline.targetIsland", "Baseline island must be doorstar.")
    if baseline.get("targetCollection") != EXPECTED_COLLECTION:
        _issue(errors, "BASELINE_TARGET_COLLECTION_INVALID", "baseline.targetCollection", "Baseline collection must be doorstar-knowledge.")
    documents = baseline.get("documents")
    chunks = baseline.get("chunks")
    if not isinstance(documents, list):
        _issue(errors, "BASELINE_DOCUMENTS_INVALID", "baseline.documents", "Baseline documents must be an array.")
        documents = []
    if not isinstance(chunks, list):
        _issue(errors, "BASELINE_CHUNKS_INVALID", "baseline.chunks", "Baseline chunks must be an array.")
        chunks = []

    by_document_key: dict[str, dict[str, Any]] = {}
    by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    for index, document in enumerate(documents):
        location = f"baseline.documents[{index}]"
        if not isinstance(document, dict):
            _issue(errors, "BASELINE_DOCUMENT_INVALID", location, "Baseline document must be an object.")
            continue
        for field in sorted(BASELINE_DOCUMENT_FIELDS - set(document)):
            _issue(errors, "BASELINE_DOCUMENT_FIELD_MISSING", f"{location}.{field}", "Required field is missing.")
        key = document.get("documentKey")
        document_id = document.get("documentId")
        version = document.get("documentVersion")
        canonical_sha = document.get("canonicalSha256")
        chunk_keys = document.get("chunkKeys")
        if not _is_sha256(key) or not _is_sha256(canonical_sha):
            _issue(errors, "BASELINE_DOCUMENT_HASH_INVALID", location, "Document hashes must be full SHA-256 values.")
            continue
        if not isinstance(document_id, str) or not document_id or not isinstance(version, str) or not version:
            _issue(errors, "BASELINE_DOCUMENT_IDENTITY_INVALID", location, "Document identity fields must be non-empty strings.")
            continue
        if not isinstance(chunk_keys, list) or any(not _is_sha256(item) for item in chunk_keys):
            _issue(errors, "BASELINE_DOCUMENT_CHUNK_KEYS_INVALID", f"{location}.chunkKeys", "chunkKeys must be a SHA-256 array.")
            continue
        key = key.lower()
        pair = (document_id, version)
        if key in by_document_key:
            _issue(errors, "BASELINE_DOCUMENT_KEY_DUPLICATE", f"{location}.documentKey", "Duplicate baseline document key.")
        if pair in by_pair:
            _issue(errors, "BASELINE_DOCUMENT_PAIR_DUPLICATE", location, "Duplicate baseline document id/version.")
        by_document_key[key] = document
        by_pair[pair] = document

    by_chunk_key: dict[str, dict[str, Any]] = {}
    for index, chunk in enumerate(chunks):
        location = f"baseline.chunks[{index}]"
        if not isinstance(chunk, dict):
            _issue(errors, "BASELINE_CHUNK_INVALID", location, "Baseline chunk must be an object.")
            continue
        for field in sorted(BASELINE_CHUNK_FIELDS - set(chunk)):
            _issue(errors, "BASELINE_CHUNK_FIELD_MISSING", f"{location}.{field}", "Required field is missing.")
        key = chunk.get("chunkKey")
        content_sha = chunk.get("contentSha256")
        document_key = chunk.get("documentKey")
        if not _is_sha256(key) or not _is_sha256(content_sha) or not _is_sha256(document_key):
            _issue(errors, "BASELINE_CHUNK_HASH_INVALID", location, "Chunk hashes must be full SHA-256 values.")
            continue
        key = key.lower()
        if key in by_chunk_key:
            _issue(errors, "BASELINE_CHUNK_KEY_DUPLICATE", f"{location}.chunkKey", "Duplicate baseline chunk key.")
        by_chunk_key[key] = chunk

    current_chunks_by_document: dict[str, list[dict[str, Any]]] = {}
    for chunk in current_chunks:
        current_chunks_by_document.setdefault(chunk["documentKey"], []).append(chunk)

    for document in current_documents:
        key = document["documentKey"]
        pair = (document["documentId"], document["documentVersion"])
        by_key = by_document_key.get(key)
        by_identity = by_pair.get(pair)
        if by_identity is not None and str(by_identity.get("canonicalSha256", "")).lower() != document["canonicalSha256"]:
            _issue(errors, "BASELINE_DOCUMENT_VERSION_DRIFT", "baseline.documents", f"Baseline id/version differs for '{pair[0]}@{pair[1]}'.")
            document_actions[key] = "BLOCK_VERSION_DRIFT"
            continue
        if by_key is not None:
            identity_matches = (
                by_key.get("documentId") == document["documentId"]
                and by_key.get("documentVersion") == document["documentVersion"]
                and str(by_key.get("canonicalSha256", "")).lower() == document["canonicalSha256"]
            )
            if not identity_matches:
                _issue(errors, "BASELINE_DOCUMENT_KEY_COLLISION", "baseline.documents", f"Document key collision for '{key}'.")
                document_actions[key] = "BLOCK_KEY_COLLISION"
                continue
            expected_chunk_keys = sorted(item["chunkKey"] for item in current_chunks_by_document.get(key, []))
            baseline_chunk_keys = sorted(str(item).lower() for item in by_key.get("chunkKeys", []))
            if baseline_chunk_keys != expected_chunk_keys:
                _issue(errors, "BASELINE_DOCUMENT_CHUNK_SET_MISMATCH", "baseline.documents", f"Stored chunk set differs for '{key}'.")
                document_actions[key] = "BLOCK_CHUNK_SET_MISMATCH"
            else:
                document_actions[key] = "SKIP_IDENTICAL"
        elif by_identity is not None:
            _issue(errors, "BASELINE_DOCUMENT_KEY_MISMATCH", "baseline.documents", f"Baseline document key differs for '{pair[0]}@{pair[1]}'.")
            document_actions[key] = "BLOCK_KEY_MISMATCH"
        else:
            document_actions[key] = "CREATE"

    for chunk in current_chunks:
        key = chunk["chunkKey"]
        stored = by_chunk_key.get(key)
        if stored is None:
            if document_actions.get(chunk["documentKey"]) == "SKIP_IDENTICAL":
                _issue(errors, "BASELINE_CHUNK_MISSING", "baseline.chunks", f"Expected stored chunk '{key}' is absent.")
                chunk_actions[key] = "BLOCK_MISSING"
            else:
                chunk_actions[key] = "CREATE"
            continue
        if (
            str(stored.get("contentSha256", "")).lower() != chunk["contentSha256"]
            or str(stored.get("documentKey", "")).lower() != chunk["documentKey"]
        ):
            _issue(errors, "BASELINE_CHUNK_KEY_COLLISION", "baseline.chunks", f"Chunk key collision for '{key}'.")
            chunk_actions[key] = "BLOCK_KEY_COLLISION"
        else:
            chunk_actions[key] = "SKIP_IDENTICAL"

    baseline_errors = [item for item in errors if item["location"].startswith("baseline")]
    return {
        "provided": True,
        "valid": not baseline_errors,
        "sha256": baseline_sha256,
        "documentCount": len(documents),
        "chunkCount": len(chunks),
    }, document_actions, chunk_actions


def _scalar_safe_metadata(
    document: dict[str, Any],
    document_key: str,
    chunk: dict[str, Any],
    package_hash: str,
    package_id: str,
    package_source_prefix: str,
    *,
    include_claim_lineage: bool = False,
) -> dict[str, Any]:
    canonical_file = document.get("canonicalFile")
    if not _safe_relative_path(canonical_file) or not canonical_file.startswith("canonical/"):
        raise ValueError("Canonical metadata source path is unsafe.")
    if package_source_prefix != EXPECTED_PACKAGE_SOURCE_PREFIX:
        raise ValueError("Metadata source prefix is not the approved package path.")
    source = f"{package_source_prefix}/{canonical_file}"
    if (
        not _safe_relative_path(source)
        or not source.startswith(f"{EXPECTED_PACKAGE_SOURCE_PREFIX}/canonical/")
        or source.removeprefix(f"{EXPECTED_PACKAGE_SOURCE_PREFIX}/") != canonical_file
    ):
        raise ValueError("Metadata source must be a canonical file below the approved package path.")

    canonical_sha256 = str(document["canonicalSha256"]).lower()
    if not _is_sha256(canonical_sha256):
        raise ValueError("Metadata canonical hash must be SHA-256.")
    if not isinstance(package_id, str) or not package_id or package_id != package_id.strip():
        raise ValueError("Metadata package ID must be a non-empty scalar string.")

    metadata: dict[str, Any] = {
        # Nexus provenance aliases retained by the Doorstar MCP read bridge.
        "source": source,
        "doc": document["id"],
        "file_sha256": canonical_sha256,
        "category": package_id,
        "chunk_index": chunk["chunkIndex"],
        "type": "doc",
        "language": "markdown",
        "name": document["title"],
        # Camel-case audit contract used by the controlled ingest executor.
        "targetIsland": EXPECTED_ISLAND,
        "targetCollection": EXPECTED_COLLECTION,
        "packageHash": package_hash,
        "documentId": document["id"],
        "documentVersion": document["version"],
        "documentKey": document_key,
        "canonicalSha256": canonical_sha256,
        "domain": document["domain"],
        "title": document["title"],
        "tags": _canonical_json(document["tags"]),
        "owner": document["owner"],
        "reviewStatus": document["reviewStatus"],
        "sensitivity": document["sensitivity"],
        "validFrom": document["validFrom"],
        "sources": _canonical_json(document["sources"]),
        "policy": _canonical_json(document["chunkingPolicy"]),
        "section": chunk["section"],
        "sectionKey": chunk["sectionKey"],
        "chunkIndex": chunk["chunkIndex"],
        "chunkKey": chunk["chunkKey"],
        "contentSha256": chunk["contentSha256"],
        "charCount": chunk["charCount"],
    }
    if include_claim_lineage:
        chunk_kind = chunk.get("chunkKind")
        claim_ids = chunk.get("claimIds")
        if chunk_kind not in {"CLAIM", "OVERVIEW"} or not isinstance(claim_ids, list):
            raise ValueError("V2 chunk lineage is malformed.")
        if chunk_kind == "CLAIM" and (
            len(claim_ids) != 1
            or not isinstance(claim_ids[0], str)
            or not claim_ids[0]
        ):
            raise ValueError("A CLAIM chunk must carry exactly one claim ID.")
        if chunk_kind == "OVERVIEW" and claim_ids != []:
            raise ValueError("An OVERVIEW chunk must not carry claim IDs.")
        metadata["chunkKind"] = chunk_kind
        metadata["claimIds"] = _canonical_json(claim_ids)
    if any(not isinstance(value, (str, int, float, bool)) or value is None for value in metadata.values()):
        raise ValueError("Metadata contains a non-scalar value.")
    return metadata


def _validated_package_id(
    manifest: Any,
    stored_report: Any,
    current_report: Any,
    errors: list[dict[str, str]],
) -> str | None:
    """Return the package ID only when every independently derived value agrees."""

    candidates = {
        "manifest.packageId": manifest.get("packageId") if isinstance(manifest, dict) else None,
        "dryRunReport.packageId": stored_report.get("packageId") if isinstance(stored_report, dict) else None,
        "dryRunValidator.packageId": current_report.get("packageId") if isinstance(current_report, dict) else None,
    }
    for location, value in candidates.items():
        if not isinstance(value, str) or not value or value != value.strip():
            _issue(errors, "PACKAGE_ID_INVALID", location, "Package ID must be a non-empty scalar string.")

    values = list(candidates.values())
    if not all(isinstance(value, str) and value and value == value.strip() for value in values):
        return None
    if len(set(values)) != 1:
        _issue(
            errors,
            "PACKAGE_ID_MISMATCH",
            "packageId",
            "Manifest, approved report, and current validator package IDs must match exactly.",
        )
        return None
    return values[0]


def _report_chunk_projection(
    chunk: dict[str, Any],
    *,
    include_claim_lineage: bool = False,
) -> dict[str, Any]:
    projection = {
        "chunkKey": chunk["chunkKey"],
        "contentSha256": chunk["contentSha256"],
        "documentId": chunk["documentId"],
        "documentVersion": chunk["documentVersion"],
        "policyVersion": chunk["policyVersion"],
        "sectionKey": chunk["sectionKey"],
        "chunkIndex": chunk["chunkIndex"],
        "charCount": chunk["charCount"],
    }
    if include_claim_lineage:
        projection["chunkKind"] = chunk["chunkKind"]
        projection["claimIds"] = list(chunk["claimIds"])
    return projection


def _hash_key_set(keys: Iterable[str]) -> dict[str, Any]:
    """Return an exact, content-free hash-key set and its aggregate pin."""

    exact_keys = sorted(str(key).lower() for key in keys)
    return {
        "count": len(exact_keys),
        "keys": exact_keys,
        "setSha256": _canonical_json_hash(exact_keys),
    }


def _build_v2_replacement_preview(
    baseline: Any,
    baseline_is_valid: bool,
    current_documents: list[dict[str, Any]],
    current_chunks: list[dict[str, Any]],
    errors: list[dict[str, str]],
) -> dict[str, Any]:
    """Describe only an exact v1.0-to-v1.1 hash-set replacement.

    This is not an executor contract.  Invalid or mixed baselines expose no
    superseded keys, so the preview can never be interpreted as a broad delete.
    """

    create_documents = _hash_key_set(item["documentKey"] for item in current_documents)
    create_chunks = _hash_key_set(item["chunkKey"] for item in current_chunks)
    empty = _hash_key_set([])
    preview: dict[str, Any] = {
        "mode": "UNAVAILABLE",
        "valid": False,
        "broadDeleteAllowed": False,
        "deleteActionsEmitted": False,
        "supersededDocuments": empty,
        "supersededChunks": empty,
        "createDocuments": create_documents,
        "createChunks": create_chunks,
    }
    if baseline is None or not baseline_is_valid:
        return preview
    if not isinstance(baseline, dict):
        return preview
    documents = baseline.get("documents")
    chunks = baseline.get("chunks")
    if not isinstance(documents, list) or not isinstance(chunks, list):
        return preview
    if documents == [] and chunks == []:
        preview.update({"mode": "CREATE_ONLY", "valid": True})
        return preview

    current_ids = {item["documentId"] for item in current_documents}
    baseline_ids: set[str] = set()
    document_keys: set[str] = set()
    declared_chunk_keys: set[str] = set()
    chunk_owner_by_key: dict[str, str] = {}
    replacement_valid = (
        len(current_documents) == EXPECTED_V2_DOCUMENT_COUNT
        and len(current_chunks) == EXPECTED_V2_CHUNK_COUNT
        and len(documents) == EXPECTED_V2_DOCUMENT_COUNT
        and len(chunks) == EXPECTED_CHUNK_COUNT
    )
    for document in documents:
        if not isinstance(document, dict):
            replacement_valid = False
            continue
        document_id = document.get("documentId")
        document_key = str(document.get("documentKey", "")).lower()
        canonical_sha = str(document.get("canonicalSha256", "")).lower()
        chunk_keys = document.get("chunkKeys")
        expected_document_key = (
            _sha256_bytes(
                "|".join([document_id, "1.0.0", canonical_sha, "v1"]).encode("utf-8")
            )
            if isinstance(document_id, str) and _is_sha256(canonical_sha)
            else None
        )
        if (
            not isinstance(document_id, str)
            or document.get("documentVersion") != "1.0.0"
            or not _is_sha256(document_key)
            or document_key != expected_document_key
            or document_id in baseline_ids
            or document_key in document_keys
            or not isinstance(chunk_keys, list)
            or any(not _is_sha256(item) for item in chunk_keys)
        ):
            replacement_valid = False
            continue
        baseline_ids.add(document_id)
        document_keys.add(document_key)
        for raw_chunk_key in chunk_keys:
            chunk_key = str(raw_chunk_key).lower()
            if chunk_key in declared_chunk_keys:
                replacement_valid = False
            declared_chunk_keys.add(chunk_key)
            chunk_owner_by_key[chunk_key] = document_key

    observed_chunk_keys: set[str] = set()
    for chunk in chunks:
        if not isinstance(chunk, dict):
            replacement_valid = False
            continue
        chunk_key = str(chunk.get("chunkKey", "")).lower()
        document_key = str(chunk.get("documentKey", "")).lower()
        content_sha = str(chunk.get("contentSha256", "")).lower()
        expected_chunk_key = (
            _sha256_bytes(f"chunk|{content_sha}".encode("utf-8"))
            if _is_sha256(content_sha)
            else None
        )
        if (
            not _is_sha256(chunk_key)
            or not _is_sha256(document_key)
            or chunk_key != expected_chunk_key
            or chunk_key in observed_chunk_keys
            or chunk_owner_by_key.get(chunk_key) != document_key
        ):
            replacement_valid = False
        observed_chunk_keys.add(chunk_key)

    replacement_valid = replacement_valid and (
        baseline_ids == current_ids
        and declared_chunk_keys == observed_chunk_keys
        and len(declared_chunk_keys) == EXPECTED_CHUNK_COUNT
        and document_keys.isdisjoint(set(create_documents["keys"]))
        and declared_chunk_keys.isdisjoint(set(create_chunks["keys"]))
    )
    if not replacement_valid:
        _issue(
            errors,
            "V2_REPLACEMENT_BASELINE_INVALID",
            "replacement",
            "Non-empty v2 replacement baseline must be exactly the six v1.0 documents and their 41 owned chunks.",
        )
        return preview

    preview.update(
        {
            "mode": "EXACT_V1_TO_V2_REPLACEMENT",
            "valid": True,
            "supersededDocuments": _hash_key_set(document_keys),
            "supersededChunks": _hash_key_set(declared_chunk_keys),
        }
    )
    return preview


def build_ingest_plan(
    manifest_path: str | Path,
    inventory_path: str | Path,
    dry_run_report_path: str | Path,
    authorization_path: str | Path | None = None,
    baseline_path: str | Path | None = None,
    *,
    emit_payload_to_stdout: bool = False,
) -> dict[str, Any]:
    """Return a deterministic plan; perform no write and no external call."""

    errors: list[dict[str, str]] = []
    blockers: list[dict[str, str]] = []
    manifest_file = Path(manifest_path).resolve()
    inventory_file = Path(inventory_path).resolve()
    report_file = Path(dry_run_report_path).resolve()
    package_root = manifest_file.parent

    manifest, manifest_raw = _load_json(manifest_file, "manifest", errors)
    inventory, inventory_raw = _load_json(inventory_file, "inventory", errors)
    stored_report, report_raw = _load_json(report_file, "dryRunReport", errors)
    is_v2_package = (
        isinstance(manifest, dict)
        and manifest.get("packageVersion") == EXPECTED_V2_PACKAGE_VERSION
    )
    authorization: Any = None
    authorization_raw: bytes | None = None
    if authorization_path is not None:
        authorization, authorization_raw = _load_json(Path(authorization_path).resolve(), "authorization", errors)
    baseline: Any = None
    baseline_raw: bytes | None = None
    if baseline_path is not None:
        baseline, baseline_raw = _load_json(Path(baseline_path).resolve(), "baseline", errors)

    manifest_sha = _sha256_bytes(manifest_raw) if manifest_raw is not None else None
    inventory_sha = _sha256_bytes(inventory_raw) if inventory_raw is not None else None
    report_sha = _sha256_bytes(report_raw) if report_raw is not None else None
    authorization_sha = _sha256_bytes(authorization_raw) if authorization_raw is not None else None
    baseline_sha = _sha256_bytes(baseline_raw) if baseline_raw is not None else None

    eval_file: Path | None = None
    eval_sha: str | None = None
    tracked_files: dict[str, str] = {}
    for path, sha in ((manifest_file, manifest_sha), (inventory_file, inventory_sha), (report_file, report_sha)):
        if sha is not None:
            tracked_files[str(path)] = sha
    if authorization_path is not None and authorization_sha is not None:
        tracked_files[str(Path(authorization_path).resolve())] = authorization_sha
    if baseline_path is not None and baseline_sha is not None:
        tracked_files[str(Path(baseline_path).resolve())] = baseline_sha

    if isinstance(manifest, dict):
        if manifest.get("targetIsland") != EXPECTED_ISLAND:
            _issue(errors, "TARGET_ISLAND_INVALID", "manifest.targetIsland", "Target island must be exactly doorstar.")
        idempotency = manifest.get("idempotency")
        if not isinstance(idempotency, dict) or idempotency.get("baselineDocuments") != []:
            _issue(errors, "MANIFEST_BASELINE_NOT_EMPTY", "manifest.idempotency.baselineDocuments", "Approved manifest must retain an empty offline baseline.")
        declared_inventory = manifest.get("sourceInventoryFile")
        if _safe_relative_path(declared_inventory):
            expected_inventory = _resolve_inside(package_root, declared_inventory)
            if expected_inventory != inventory_file:
                _issue(errors, "INVENTORY_ARGUMENT_MISMATCH", "manifest.sourceInventoryFile", "Inventory input differs from manifest declaration.")
        eval_relative = manifest.get("evalFile")
        if _safe_relative_path(eval_relative):
            eval_file = _resolve_inside(package_root, eval_relative)
            if eval_file is not None and eval_file.is_file():
                eval_sha = _sha256_file(eval_file)
                tracked_files[str(eval_file)] = eval_sha
            else:
                _issue(errors, "EVAL_FILE_NOT_FOUND", "manifest.evalFile", "Declared eval file is absent.")
        else:
            _issue(errors, "EVAL_PATH_UNSAFE", "manifest.evalFile", "Eval path must be safe and package-relative.")

    report_name_valid = report_file.name == "DRY_RUN_REPORT.json" or (
        VERSIONED_REPORT_RE.fullmatch(report_file.name) is not None
    )
    if report_file.parent != package_root or not report_name_valid:
        _issue(
            errors,
            "DRY_RUN_REPORT_PATH_INVALID",
            "dryRunReport",
            "Stored report must be package-local DRY_RUN_REPORT.json or DRY_RUN_REPORT.v<semver>.json.",
        )
    if is_v2_package and report_file.name != f"DRY_RUN_REPORT.v{EXPECTED_V2_PACKAGE_VERSION}.json":
        _issue(
            errors,
            "V2_DRY_RUN_REPORT_VERSION_MISMATCH",
            "dryRunReport",
            "RAG 1.1 requires the exact package-local DRY_RUN_REPORT.v1.1.0.json name.",
        )

    package_hash = stored_report.get("packageHash") if isinstance(stored_report, dict) else None
    expected_pins = {
        "packageHash": package_hash,
        "dryRunReportSha256": report_sha,
        "manifestSha256": manifest_sha,
        "inventorySha256": inventory_sha,
        "evalSha256": eval_sha,
        "authorizationSha256": authorization_sha,
    }
    if is_v2_package:
        authorization_valid = False
        authorization_summary = {
            "provided": authorization is not None,
            "valid": False,
            "decision": None,
            "approvedBy": None,
            "approvedAt": None,
            "authorizationSha256": authorization_sha,
        }
        _issue(
            blockers,
            "V2_EXECUTION_AUTHORIZATION_REQUIRED",
            "authorization",
            "RAG 1.1 has no approved execution authorization contract; content and every write remain withheld.",
        )
    else:
        authorization_valid, authorization_summary = _validate_authorization(
            authorization,
            expected_pins,
            errors,
            blockers,
        )

    repository_root = _find_repository_root(package_root)
    package_source_prefix: str | None = None
    if repository_root is not None:
        try:
            observed_package_prefix = package_root.relative_to(repository_root).as_posix()
        except ValueError:
            observed_package_prefix = ""
        if (
            observed_package_prefix != EXPECTED_PACKAGE_SOURCE_PREFIX
            or not _safe_relative_path(observed_package_prefix)
        ):
            _issue(
                errors,
                "PACKAGE_SOURCE_PREFIX_INVALID",
                "manifest.path",
                "Manifest package must be exactly docs/projects/doorstar-nexus-rag below the repository root.",
            )
        else:
            package_source_prefix = observed_package_prefix
    manifest_source_ids = _collect_manifest_source_ids(manifest)
    observations, source_tracked = _observe_inventory_sources(
        inventory,
        repository_root,
        manifest_source_ids,
        errors,
    )
    tracked_files.update(source_tracked)
    v2_diagnostics = [
        {
            "code": "UNREFERENCED_INVENTORY_SOURCE_DRIFT",
            "blocking": False,
            "sourceId": item["sourceId"],
            "inventorySha256": item["inventorySha256"],
            "observedSha256": item["observedSha256"],
        }
        for item in observations
        if is_v2_package and item["drifted"] and not item["referencedByManifest"]
    ]
    v2_nonblocking_drift_indexes = {
        item["inventoryIndex"]
        for item in observations
        if is_v2_package and item["drifted"] and not item["referencedByManifest"]
    }
    drift_override_summary = None if is_v2_package else _validate_source_drift_override(
        authorization,
        authorization_valid,
        observations,
        errors,
    )
    authorized_drift = drift_override_summary is not None

    current_report: dict[str, Any] | None = None
    if manifest_raw is not None and inventory_raw is not None:
        try:
            current_report = DRY_RUN_VALIDATOR.validate_package(manifest_file, inventory_file)
        except (OSError, ValueError) as exc:
            _issue(errors, "DRY_RUN_VALIDATOR_FAILED", "dryRunValidator", str(exc))
    if current_report is not None:
        for item in current_report.get("errors", []):
            if item.get("code") == "INVENTORY_SOURCE_HASH_DRIFT" and authorized_drift:
                continue
            drift_location = item.get("location", "")
            drift_index_match = re.fullmatch(
                r"inventory\.sources\[(\d+)\]\.sha256",
                drift_location if isinstance(drift_location, str) else "",
            )
            if (
                item.get("code") == "INVENTORY_SOURCE_HASH_DRIFT"
                and is_v2_package
                and drift_index_match is not None
                and int(drift_index_match.group(1)) in v2_nonblocking_drift_indexes
            ):
                continue
            _issue(errors, item.get("code", "DRY_RUN_VALIDATION_ERROR"), item.get("location", "dryRunValidator"), item.get("message", "Dry-run validation failed."))
        for item in current_report.get("warnings", []):
            warning_location = item.get("location", "")
            warning_index_match = re.fullmatch(
                r"inventory\.sources\[(\d+)\]\.sha256",
                warning_location if isinstance(warning_location, str) else "",
            )
            if (
                item.get("code") == "INVENTORY_UNREFERENCED_SOURCE_DRIFT"
                and is_v2_package
                and warning_index_match is not None
                and int(warning_index_match.group(1)) in v2_nonblocking_drift_indexes
            ):
                continue
            _issue(errors, "DRY_RUN_WARNING_FORBIDDEN", item.get("location", "dryRunValidator"), item.get("message", "Stored package must remain warning-free."))

    if not isinstance(stored_report, dict):
        _issue(errors, "DRY_RUN_REPORT_INVALID", "dryRunReport", "Stored dry-run report must be an object.")
        stored_report = {}
    if stored_report.get("schemaVersion") != getattr(DRY_RUN_VALIDATOR, "REPORT_SCHEMA", "doorstar-nexus-rag-dry-run-report.v1"):
        _issue(errors, "DRY_RUN_REPORT_SCHEMA_INVALID", "dryRunReport.schemaVersion", "Unexpected report schema.")
    if stored_report.get("ok") is not True or stored_report.get("errors") != [] or stored_report.get("warnings") != []:
        _issue(errors, "STORED_DRY_RUN_NOT_CLEAN", "dryRunReport", "Stored approved report must be clean and successful.")
    stored_proof = stored_report.get("dryRunProof")
    if not isinstance(stored_proof, dict) or any(
        stored_proof.get(field) is not False
        for field in ("nexusWriteConfigured", "chromaWriteConfigured", "nexusWritePerformed", "chromaWritePerformed", "networkCallsPerformed")
    ):
        _issue(errors, "DRY_RUN_PROOF_INVALID", "dryRunReport.dryRunProof", "Stored report does not prove a write-free dry-run.")
    if isinstance(stored_proof, dict) and stored_proof.get("targetIsland") != EXPECTED_ISLAND:
        _issue(errors, "DRY_RUN_TARGET_ISLAND_INVALID", "dryRunReport.dryRunProof.targetIsland", "Stored report target must be doorstar.")

    if current_report is not None:
        if is_v2_package and not (
            stored_report.get("packageVersion") == EXPECTED_V2_PACKAGE_VERSION
            and current_report.get("packageVersion") == EXPECTED_V2_PACKAGE_VERSION
            and manifest.get("packageVersion") == EXPECTED_V2_PACKAGE_VERSION
        ):
            _issue(
                errors,
                "V2_PACKAGE_VERSION_MISMATCH",
                "packageVersion",
                "Manifest, stored report, and current validator must all identify RAG package version 1.1.0.",
            )
        if stored_report.get("packageHash") != current_report.get("packageHash"):
            _issue(errors, "PACKAGE_HASH_MISMATCH", "dryRunReport.packageHash", "Stored package hash differs from current immutable package material.")
        if stored_report.get("inputPins") != current_report.get("inputPins"):
            _issue(errors, "REPORT_INPUT_PINS_MISMATCH", "dryRunReport.inputPins", "Stored report input pins differ from current inputs.")
        if stored_report.get("documents") != current_report.get("documents"):
            _issue(errors, "REPORT_DOCUMENTS_MISMATCH", "dryRunReport.documents", "Stored document hashes or keys differ from reconstruction.")
        summary_fields = {
            "documentCount",
            "claimCount",
            "chunkCount",
            "evalQuestionCount",
            "createCount",
            "skipIdenticalCount",
            "blockVersionDriftCount",
        }
        stored_summary = stored_report.get("summary") if isinstance(stored_report.get("summary"), dict) else {}
        current_summary = current_report.get("summary") if isinstance(current_report.get("summary"), dict) else {}
        if {field: stored_summary.get(field) for field in summary_fields} != {
            field: current_summary.get(field) for field in summary_fields
        }:
            _issue(errors, "REPORT_SUMMARY_MISMATCH", "dryRunReport.summary", "Stored report counts differ from reconstruction.")

    package_id = _validated_package_id(manifest, stored_report, current_report, errors)

    reconstructed_chunks: list[dict[str, Any]] = []
    current_documents: list[dict[str, Any]] = []
    manifest_documents_by_id: dict[tuple[str, str], dict[str, Any]] = {}
    if isinstance(manifest, dict) and isinstance(manifest.get("documents"), list):
        for index, document in enumerate(manifest["documents"]):
            location = f"manifest.documents[{index}]"
            if not isinstance(document, dict):
                continue
            expected_policy = EXPECTED_V2_POLICY if is_v2_package else EXPECTED_POLICY
            if document.get("chunkingPolicy") != expected_policy:
                policy_label = "v2 claim-row" if is_v2_package else "v1 paragraph"
                _issue(
                    errors,
                    "CHUNK_POLICY_NOT_APPROVED",
                    f"{location}.chunkingPolicy",
                    f"Only the audited 1600/0 {policy_label} policy is accepted.",
                )
                continue
            canonical_relative = document.get("canonicalFile")
            if not _safe_relative_path(canonical_relative) or not str(canonical_relative).startswith("canonical/"):
                _issue(errors, "CANONICAL_PATH_UNSAFE", f"{location}.canonicalFile", "Canonical path must remain below package canonical/.")
                continue
            canonical_file = _resolve_inside(package_root, canonical_relative)
            if canonical_file is None or not canonical_file.is_file():
                _issue(errors, "CANONICAL_FILE_NOT_FOUND", f"{location}.canonicalFile", "Canonical file is absent.")
                continue
            raw = canonical_file.read_bytes()
            tracked_files[str(canonical_file)] = _sha256_bytes(raw)
            if len(raw) > MAX_CANONICAL_BYTES:
                _issue(errors, "CANONICAL_FILE_TOO_LARGE", f"{location}.canonicalFile", "Canonical file exceeds 512 KiB.")
                continue
            current_canonical_sha = _sha256_bytes(raw)
            canonical_pin = str(document.get("canonicalSha256", "")).lower()
            if current_canonical_sha != canonical_pin:
                _issue(errors, "CANONICAL_HASH_DRIFT", f"{location}.canonicalSha256", "Canonical bytes differ from manifest pin.")
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                _issue(errors, "CANONICAL_INVALID_UTF8", f"{location}.canonicalFile", "Canonical file must be UTF-8.")
                continue
            _detect_sensitive_text(text, canonical_relative, errors)
            document_id = document.get("id")
            version = document.get("version")
            if not isinstance(document_id, str) or not isinstance(version, str):
                continue
            if is_v2_package and version != EXPECTED_V2_PACKAGE_VERSION:
                _issue(
                    errors,
                    "V2_DOCUMENT_VERSION_INVALID",
                    f"{location}.version",
                    "Every RAG 1.1 canonical document must use version 1.1.0.",
                )
            document_key = _document_key(document)
            manifest_documents_by_id[(document_id, version)] = document
            try:
                document_chunks = DRY_RUN_VALIDATOR.build_chunks(
                    text,
                    document_id,
                    version,
                    document["chunkingPolicy"],
                    include_content=True,
                )
            except (KeyError, TypeError, ValueError) as exc:
                _issue(errors, "CHUNK_RECONSTRUCTION_FAILED", location, str(exc))
                continue
            for chunk in document_chunks:
                chunk["documentKey"] = document_key
            reconstructed_chunks.extend(document_chunks)
            current_documents.append(
                {
                    "documentId": document_id,
                    "documentVersion": version,
                    "documentKey": document_key,
                    "canonicalSha256": canonical_pin,
                    "chunkCount": len(document_chunks),
                }
            )

    reconstructed_chunks.sort(
        key=lambda item: (item["documentId"], item["documentVersion"], item["sectionKey"], item["chunkIndex"])
    )
    current_documents.sort(key=lambda item: (item["documentId"], item["documentVersion"], item["documentKey"]))
    report_chunks = stored_report.get("chunks") if isinstance(stored_report.get("chunks"), list) else []
    reconstructed_projection = [
        _report_chunk_projection(item, include_claim_lineage=is_v2_package)
        for item in reconstructed_chunks
    ]
    if report_chunks != reconstructed_projection:
        _issue(errors, "DRY_RUN_CHUNK_TAMPER", "dryRunReport.chunks", "Stored chunk keys or hashes differ from exact text reconstruction.")
    if current_report is not None and current_report.get("chunks") != reconstructed_projection:
        _issue(errors, "CHUNK_ALGORITHM_DIVERGENCE", "chunks", "Planner chunk reconstruction differs from audited validator output.")
    expected_chunk_count = EXPECTED_V2_CHUNK_COUNT if is_v2_package else EXPECTED_CHUNK_COUNT
    if (
        len(reconstructed_chunks) != expected_chunk_count
        or stored_report.get("summary", {}).get("chunkCount") != expected_chunk_count
    ):
        _issue(
            errors,
            "APPROVED_CHUNK_COUNT_MISMATCH",
            "chunks",
            f"The approved package must reconstruct exactly {expected_chunk_count} chunks.",
        )
    if is_v2_package:
        claim_chunks = [item for item in reconstructed_chunks if item.get("chunkKind") == "CLAIM"]
        overview_chunks = [item for item in reconstructed_chunks if item.get("chunkKind") == "OVERVIEW"]
        overview_documents = {item.get("documentId") for item in overview_chunks}
        expected_overview_documents = {item["documentId"] for item in current_documents}
        lineage_valid = (
            len(current_documents) == EXPECTED_V2_DOCUMENT_COUNT
            and len(claim_chunks) == EXPECTED_V2_CLAIM_COUNT
            and len(overview_chunks) == EXPECTED_V2_DOCUMENT_COUNT
            and overview_documents == expected_overview_documents
            and all(
                isinstance(item.get("claimIds"), list)
                and len(item["claimIds"]) == 1
                and isinstance(item["claimIds"][0], str)
                and bool(item["claimIds"][0])
                for item in claim_chunks
            )
            and all(item.get("claimIds") == [] for item in overview_chunks)
            and stored_report.get("summary", {}).get("claimCount") == EXPECTED_V2_CLAIM_COUNT
        )
        if not lineage_valid:
            _issue(
                errors,
                "V2_CLAIM_LINEAGE_MISMATCH",
                "chunks",
                "RAG 1.1 must reconstruct 98 single-claim chunks and one claim-free overview for each of six documents.",
            )

    report_documents = {
        (item.get("id"), item.get("version")): item
        for item in stored_report.get("documents", [])
        if isinstance(item, dict)
    }
    for document in current_documents:
        report_document = report_documents.get((document["documentId"], document["documentVersion"]))
        if not isinstance(report_document, dict):
            _issue(errors, "REPORT_DOCUMENT_MISSING", "dryRunReport.documents", f"Report row missing for '{document['documentId']}'.")
        elif (
            report_document.get("documentKey") != document["documentKey"]
            or str(report_document.get("canonicalSha256", "")).lower() != document["canonicalSha256"]
        ):
            _issue(errors, "REPORT_DOCUMENT_HASH_MISMATCH", "dryRunReport.documents", f"Report row differs for '{document['documentId']}'.")

    baseline_summary, document_actions, chunk_actions = _validate_baseline(
        baseline,
        baseline_sha,
        current_documents,
        reconstructed_chunks,
        errors,
        blockers,
    )
    replacement_preview = (
        _build_v2_replacement_preview(
            baseline,
            baseline_summary.get("valid") is True,
            current_documents,
            reconstructed_chunks,
            errors,
        )
        if is_v2_package
        else None
    )

    plan_documents: list[dict[str, Any]] = []
    for document in current_documents:
        plan_documents.append({**document, "action": document_actions.get(document["documentKey"], "BLOCKED")})

    plan_chunks: list[dict[str, Any]] = []
    payloads: list[dict[str, Any]] = []
    for chunk in reconstructed_chunks:
        document = manifest_documents_by_id[(chunk["documentId"], chunk["documentVersion"])]
        try:
            if package_id is None or package_source_prefix is None:
                raise ValueError("Metadata package identity or source prefix is not validated.")
            metadata = _scalar_safe_metadata(
                document,
                chunk["documentKey"],
                chunk,
                str(package_hash),
                package_id,
                package_source_prefix,
                include_claim_lineage=is_v2_package,
            )
        except (KeyError, TypeError, ValueError) as exc:
            _issue(errors, "METADATA_NOT_SCALAR_SAFE", f"chunks.{chunk['chunkKey']}", str(exc))
            metadata = {}
        plan_chunks.append(
            {
                "chunkKey": chunk["chunkKey"],
                "contentSha256": chunk["contentSha256"],
                "documentKey": chunk["documentKey"],
                "action": chunk_actions.get(chunk["chunkKey"], "BLOCKED"),
                "metadata": metadata,
                "metadataSha256": _canonical_json_hash(metadata),
                "payloadIncluded": False,
            }
        )

    for path_string, initial_sha in sorted(tracked_files.items()):
        path = Path(path_string)
        try:
            final_sha = _sha256_file(path)
        except FileNotFoundError:
            final_sha = None
        if final_sha != initial_sha:
            _issue(errors, "INPUT_CHANGED_DURING_PLAN", path_string, "A tracked input changed while the plan was being built.")

    errors = _sorted_unique_issues(errors)
    blockers = _sorted_unique_issues(blockers)
    ready = not errors and not blockers
    if emit_payload_to_stdout and ready:
        for index, chunk in enumerate(reconstructed_chunks):
            payloads.append(
                {
                    "id": chunk["chunkKey"],
                    "content": chunk["content"],
                    "metadata": plan_chunks[index]["metadata"],
                }
            )
            plan_chunks[index]["payloadIncluded"] = True
    elif emit_payload_to_stdout and not ready:
        _issue(
            blockers,
            "PAYLOAD_EMISSION_BLOCKED",
            "payloads",
            "Chunk content is withheld until every approval, integrity, drift, and baseline gate passes.",
        )
        if is_v2_package:
            _issue(
                blockers,
                "V2_PAYLOAD_CONTENT_WITHHELD",
                "payloads",
                "RAG 1.1 payload content remains withheld until a separately reviewed v2 authorization contract exists.",
            )
        blockers = _sorted_unique_issues(blockers)

    canonical_pins = {
        item["documentId"]: item["canonicalSha256"]
        for item in current_documents
    }
    package_summary = {
        "packageId": package_id,
        "packageVersion": stored_report.get("packageVersion"),
        "packageHash": package_hash,
        "dryRunReportSha256": report_sha,
        "manifestSha256": manifest_sha,
        "inventorySha256": inventory_sha,
        "evalSha256": eval_sha,
        "canonicalSetSha256": _canonical_json_hash(canonical_pins),
        "chunkSetSha256": _canonical_json_hash(reconstructed_projection),
    }
    authorization_output = authorization_summary or {
        "provided": False,
        "valid": False,
        "decision": None,
        "approvedBy": None,
        "approvedAt": None,
        "authorizationSha256": None,
    }
    authorization_output["postApprovalSourceDriftOverride"] = drift_override_summary

    summary = {
        "documentCount": len(plan_documents),
        "chunkCount": len(plan_chunks),
        "createDocumentCount": sum(item["action"] == "CREATE" for item in plan_documents),
        "skipDocumentCount": sum(item["action"] == "SKIP_IDENTICAL" for item in plan_documents),
        "createChunkCount": sum(item["action"] == "CREATE" for item in plan_chunks),
        "skipChunkCount": sum(item["action"] == "SKIP_IDENTICAL" for item in plan_chunks),
        "errorCount": len(errors),
        "blockerCount": len(blockers),
        "payloadCount": len(payloads),
    }
    status = "READY_FOR_SEPARATE_EXECUTOR" if ready else "BLOCKED"
    approval_only_blockers = {
        "V2_EXECUTION_AUTHORIZATION_REQUIRED",
        "PAYLOAD_EMISSION_BLOCKED",
        "V2_PAYLOAD_CONTENT_WITHHELD",
    }
    blocker_codes = {item["code"] for item in blockers}
    if (
        is_v2_package
        and not errors
        and "V2_EXECUTION_AUTHORIZATION_REQUIRED" in blocker_codes
        and blocker_codes <= approval_only_blockers
    ):
        status = "HUMAN_APPROVAL_REQUIRED"
    plan: dict[str, Any] = {
        "schemaVersion": PLAN_SCHEMA,
        "status": status,
        "ok": not errors,
        "readyForSeparateExecutor": ready,
        "mode": "STDOUT_PAYLOAD" if emit_payload_to_stdout else "CONTENT_FREE_PREVIEW",
        "target": {"island": EXPECTED_ISLAND, "collection": EXPECTED_COLLECTION},
        "package": package_summary,
        "authorization": authorization_output,
        "baseline": baseline_summary,
        "summary": summary,
        "documents": plan_documents,
        "chunks": plan_chunks,
        "writeProof": {
            "plannerFileWritesPerformed": False,
            "networkCallsPerformed": False,
            "nexusWritePerformed": False,
            "chromaWritePerformed": False,
            "databaseWritePerformed": False,
            "payloadFileWriteSupported": False,
            "manifestMutationPerformed": False,
            "sourceMutationPerformed": False,
        },
        "errors": errors,
        "blockers": blockers,
    }
    if is_v2_package:
        plan["replacement"] = replacement_preview
        plan["diagnostics"] = v2_diagnostics
        plan["summary"]["diagnosticCount"] = len(v2_diagnostics)
    if emit_payload_to_stdout:
        plan["payloads"] = payloads
    return plan


def render_plan(plan: dict[str, Any]) -> str:
    """Serialize a plan reproducibly as sorted UTF-8 JSON."""

    return json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Build a Doorstar-only controlled RAG ingest plan. The planner is read-only; "
            "it never writes Nexus, ChromaDB, a database, or payload files."
        )
    )
    parser.add_argument("--manifest", required=True, help="Reviewed Doorstar RAG manifest JSON")
    parser.add_argument("--inventory", required=True, help="Approved SOURCE_INVENTORY.json")
    parser.add_argument(
        "--dry-run-report",
        required=True,
        help="Reviewed package-local DRY_RUN_REPORT.json or DRY_RUN_REPORT.v<semver>.json",
    )
    parser.add_argument("--authorization", help="Optional hash-pinned execution authorization JSON")
    parser.add_argument("--baseline", help="Optional read-only doorstar-knowledge baseline JSON")
    parser.add_argument(
        "--emit-payload-to-stdout",
        action="store_true",
        help="Emit exact chunk content to stdout only after all gates pass; no payload file is written",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        plan = build_ingest_plan(
            args.manifest,
            args.inventory,
            args.dry_run_report,
            args.authorization,
            args.baseline,
            emit_payload_to_stdout=args.emit_payload_to_stdout,
        )
    except (OSError, RuntimeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    sys.stdout.write(render_plan(plan))
    return 0 if plan["readyForSeparateExecutor"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
