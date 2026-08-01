#!/usr/bin/env python3
"""Create a deterministic, reviewable Doorstar RAG manifest version.

The command is preview-only unless ``--output`` is supplied.  It performs no
network, Nexus, ChromaDB, or source-manifest mutation.  The sole supported
profile replaces every document chunking policy with the audited claim-row v2
contract.  Normal and error output are JSON so automation never has to parse
human-oriented log text.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import re
import sys
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any, NoReturn, Sequence


MANIFEST_SCHEMA = "doorstar-rag-manifest.v1"
TARGET_ISLAND = "doorstar"
DRY_RUN_MODE = "dry-run"
SUPPORTED_PROFILE = "claim-rows-v2"

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
IDEMPOTENCY_FIELDS = {"documentKeyAlgorithm", "duplicatePolicy", "baselineDocuments"}
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
V1_POLICY_FIELDS = {"strategy", "policyVersion", "maxChars", "overlapChars", "headingDepth"}
V2_POLICY_FIELDS = V1_POLICY_FIELDS | {"claimRowsPerChunk", "includeDocumentOverview"}

V1_POLICY = {
    "strategy": "markdown_heading_paragraph",
    "policyVersion": "v1",
    "maxChars": 1600,
    "overlapChars": 0,
    "headingDepth": 3,
}
CLAIM_ROWS_V2_POLICY = {
    "strategy": "markdown_claim_rows",
    "policyVersion": "v2",
    "maxChars": 1600,
    "overlapChars": 0,
    "headingDepth": 3,
    "claimRowsPerChunk": 1,
    "includeDocumentOverview": True,
}

DOCUMENT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,127}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
SEMVER_RE = re.compile(
    r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)"
    r"(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"
)


class ManifestVersioningError(ValueError):
    """A deterministic validation or safe-write failure."""

    def __init__(self, code: str, location: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.location = location
        self.message = message

    def as_json(self) -> dict[str, Any]:
        return {
            "ok": False,
            "error": {
                "code": self.code,
                "location": self.location,
                "message": self.message,
            },
        }


class JsonArgumentParser(argparse.ArgumentParser):
    """Convert command-line mistakes into the command's JSON error contract."""

    def error(self, message: str) -> NoReturn:
        raise ManifestVersioningError("CLI_ARGUMENT_INVALID", "arguments", message)


def _fail(code: str, location: str, message: str) -> NoReturn:
    raise ManifestVersioningError(code, location, message)


def _validate_exact_fields(value: Any, expected: set[str], location: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        _fail("SCHEMA_TYPE_INVALID", location, "Value must be a JSON object.")
    actual = set(value)
    if actual != expected:
        missing = sorted(expected - actual)
        unknown = sorted(actual - expected)
        _fail(
            "SCHEMA_FIELDS_INVALID",
            location,
            f"Exact schema mismatch; missing={missing}, unknown={unknown}.",
        )
    return value


def _parse_semver(value: Any, location: str) -> tuple[int, int, int]:
    if not isinstance(value, str):
        _fail("SEMVER_INVALID", location, "Version must be a semantic-version string.")
    match = SEMVER_RE.fullmatch(value)
    if match is None:
        _fail("SEMVER_INVALID", location, "Version must use strict semantic version syntax.")
    prerelease = match.group(4)
    if prerelease is not None:
        for identifier in prerelease.split("."):
            if identifier.isascii() and identifier.isdigit() and len(identifier) > 1 and identifier.startswith("0"):
                _fail("SEMVER_INVALID", location, "Numeric prerelease identifiers cannot contain leading zeroes.")
    return int(match.group(1)), int(match.group(2)), int(match.group(3))


def _safe_package_path(
    value: Any,
    package_root: Path,
    location: str,
    *,
    suffix: str,
    canonical: bool = False,
) -> str:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value or ":" in value:
        _fail("PACKAGE_PATH_UNSAFE", location, "Path must be a non-empty POSIX-relative package path.")
    pure = PurePosixPath(value)
    if pure.is_absolute() or any(part in {"", ".", ".."} for part in pure.parts) or pure.as_posix() != value:
        _fail("PACKAGE_PATH_UNSAFE", location, "Path must be normalized and cannot escape the package.")
    if pure.suffix.lower() != suffix:
        _fail("PACKAGE_PATH_UNSAFE", location, f"Path must use the {suffix} suffix.")
    if canonical and (len(pure.parts) < 2 or pure.parts[0] != "canonical"):
        _fail("PACKAGE_PATH_UNSAFE", location, "Canonical files must be below the canonical/ directory.")

    root = package_root.resolve()
    resolved = (root / Path(*pure.parts)).resolve(strict=False)
    try:
        resolved.relative_to(root)
    except ValueError:
        _fail("PACKAGE_PATH_UNSAFE", location, "Resolved path escapes the manifest package directory.")
    return value


def _load_manifest(source_manifest: str | Path) -> tuple[Path, dict[str, Any]]:
    source = Path(source_manifest).resolve()
    if not source.is_file():
        _fail("SOURCE_MANIFEST_NOT_FOUND", "sourceManifest", "Source manifest must be an existing file.")
    try:
        raw = source.read_text(encoding="utf-8")
        manifest = json.loads(raw, object_pairs_hook=_reject_duplicate_json_keys)
    except UnicodeError as exc:
        _fail("SOURCE_MANIFEST_UTF8_INVALID", "sourceManifest", f"Source manifest is not valid UTF-8: {exc}.")
    except json.JSONDecodeError as exc:
        _fail("SOURCE_MANIFEST_JSON_INVALID", "sourceManifest", f"Invalid JSON at line {exc.lineno}, column {exc.colno}.")
    return source, _validate_manifest(manifest, source.parent)


def _reject_duplicate_json_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            _fail("SOURCE_MANIFEST_JSON_DUPLICATE_KEY", "sourceManifest", f"Duplicate JSON key '{key}'.")
        result[key] = value
    return result


def _validate_manifest(manifest: Any, package_root: Path) -> dict[str, Any]:
    data = _validate_exact_fields(manifest, MANIFEST_FIELDS, "manifest")
    if data["schemaVersion"] != MANIFEST_SCHEMA:
        _fail("MANIFEST_SCHEMA_INVALID", "manifest.schemaVersion", f"Schema must be exactly '{MANIFEST_SCHEMA}'.")
    if data["targetIsland"] != TARGET_ISLAND:
        _fail("TARGET_ISLAND_INVALID", "manifest.targetIsland", "Target island must be exactly 'doorstar'.")
    if data["mode"] != DRY_RUN_MODE:
        _fail("MODE_NOT_DRY_RUN", "manifest.mode", "Source manifest mode must be exactly 'dry-run'.")
    if data["nexusWrite"] is not False:
        _fail("NEXUS_WRITE_FORBIDDEN", "manifest.nexusWrite", "Source manifest must set nexusWrite=false.")
    if data["chromaWrite"] is not False:
        _fail("CHROMA_WRITE_FORBIDDEN", "manifest.chromaWrite", "Source manifest must set chromaWrite=false.")
    if not isinstance(data["packageId"], str) or not data["packageId"].strip():
        _fail("PACKAGE_ID_INVALID", "manifest.packageId", "Package ID must be a non-empty string.")
    _parse_semver(data["packageVersion"], "manifest.packageVersion")

    _safe_package_path(data["sourceInventoryFile"], package_root, "manifest.sourceInventoryFile", suffix=".json")
    _safe_package_path(data["evalFile"], package_root, "manifest.evalFile", suffix=".json")

    idempotency = _validate_exact_fields(data["idempotency"], IDEMPOTENCY_FIELDS, "manifest.idempotency")
    if idempotency["documentKeyAlgorithm"] != "sha256(id|version|canonicalSha256|policyVersion)":
        _fail("IDEMPOTENCY_ALGORITHM_INVALID", "manifest.idempotency.documentKeyAlgorithm", "Unexpected document-key algorithm.")
    if idempotency["duplicatePolicy"] != "reject":
        _fail("IDEMPOTENCY_POLICY_INVALID", "manifest.idempotency.duplicatePolicy", "Duplicate policy must be 'reject'.")
    if not isinstance(idempotency["baselineDocuments"], list):
        _fail("IDEMPOTENCY_BASELINE_INVALID", "manifest.idempotency.baselineDocuments", "Baseline documents must be an array.")

    documents = data["documents"]
    if not isinstance(documents, list) or not documents:
        _fail("DOCUMENTS_INVALID", "manifest.documents", "At least one document is required.")
    seen_ids: set[str] = set()
    for index, document_value in enumerate(documents):
        location = f"manifest.documents[{index}]"
        document = _validate_exact_fields(document_value, DOCUMENT_FIELDS, location)
        document_id = document["id"]
        if not isinstance(document_id, str) or DOCUMENT_ID_RE.fullmatch(document_id) is None:
            _fail("DOCUMENT_ID_INVALID", f"{location}.id", "Document ID must use audited lowercase identifier characters.")
        if document_id in seen_ids:
            _fail("DUPLICATE_DOCUMENT", f"{location}.id", f"Document ID '{document_id}' is duplicated.")
        seen_ids.add(document_id)
        _parse_semver(document["version"], f"{location}.version")
        _safe_package_path(document["canonicalFile"], package_root, f"{location}.canonicalFile", suffix=".md", canonical=True)

        if not isinstance(document["canonicalSha256"], str) or SHA256_RE.fullmatch(document["canonicalSha256"]) is None:
            _fail("CANONICAL_HASH_INVALID", f"{location}.canonicalSha256", "Canonical SHA-256 must be 64 lowercase hexadecimal characters.")
        for field in ("title", "domain", "reviewStatus", "owner", "sensitivity", "validFrom"):
            if not isinstance(document[field], str) or not document[field].strip():
                _fail("DOCUMENT_VALUE_INVALID", f"{location}.{field}", "Value must be a non-empty string.")
        if not isinstance(document["tags"], list) or not document["tags"] or any(
            not isinstance(tag, str) or not tag.strip() for tag in document["tags"]
        ):
            _fail("DOCUMENT_TAGS_INVALID", f"{location}.tags", "Tags must be a non-empty string array.")
        if not isinstance(document["sourceInventoryRefs"], list) or any(
            not isinstance(ref, str) or not ref for ref in document["sourceInventoryRefs"]
        ):
            _fail("SOURCE_REFS_INVALID", f"{location}.sourceInventoryRefs", "Source inventory refs must be strings.")

        sources = document["sources"]
        if not isinstance(sources, list) or not sources:
            _fail("DOCUMENT_SOURCES_INVALID", f"{location}.sources", "Each document requires at least one source.")
        for source_index, source_value in enumerate(sources):
            source_location = f"{location}.sources[{source_index}]"
            source = _validate_exact_fields(source_value, DOCUMENT_SOURCE_FIELDS, source_location)
            if not isinstance(source["sourceId"], str) or not source["sourceId"].strip():
                _fail("DOCUMENT_SOURCE_ID_INVALID", f"{source_location}.sourceId", "Source ID must be non-empty.")
            if not isinstance(source["relativePath"], str) or not source["relativePath"].strip():
                _fail("DOCUMENT_SOURCE_PATH_INVALID", f"{source_location}.relativePath", "Source path must be non-empty.")
            if not isinstance(source["sourceHash"], str) or SHA256_RE.fullmatch(source["sourceHash"]) is None:
                _fail("DOCUMENT_SOURCE_HASH_INVALID", f"{source_location}.sourceHash", "Source hash must be lowercase SHA-256.")

        policy = document["chunkingPolicy"]
        if not isinstance(policy, dict) or set(policy) not in (V1_POLICY_FIELDS, V2_POLICY_FIELDS):
            _fail("CHUNK_POLICY_SCHEMA_INVALID", f"{location}.chunkingPolicy", "Source policy must use the audited v1 or v2 field set.")
        expected_policy = V1_POLICY if set(policy) == V1_POLICY_FIELDS else CLAIM_ROWS_V2_POLICY
        if policy != expected_policy:
            _fail("CHUNK_POLICY_INVALID", f"{location}.chunkingPolicy", "Source policy is not an audited Doorstar policy.")
    return data


def build_versioned_manifest(
    source_manifest: str | Path,
    package_version: str,
    document_version: str,
    *,
    profile: str = SUPPORTED_PROFILE,
    eval_file: str | None = None,
    inventory_file: str | None = None,
) -> dict[str, Any]:
    """Validate and transform a manifest without writing any file."""

    source, manifest = _load_manifest(source_manifest)
    _parse_semver(package_version, "packageVersion")
    _parse_semver(document_version, "documentVersion")
    if profile != SUPPORTED_PROFILE:
        _fail("PROFILE_UNSUPPORTED", "profile", f"Only profile '{SUPPORTED_PROFILE}' is supported.")
    if eval_file is not None:
        _safe_package_path(eval_file, source.parent, "evalFile", suffix=".json")
    if inventory_file is not None:
        _safe_package_path(inventory_file, source.parent, "inventoryFile", suffix=".json")

    transformed = copy.deepcopy(manifest)
    transformed["packageVersion"] = package_version
    if eval_file is not None:
        transformed["evalFile"] = eval_file
    if inventory_file is not None:
        transformed["sourceInventoryFile"] = inventory_file
    for document in transformed["documents"]:
        document["version"] = document_version
        document["chunkingPolicy"] = copy.deepcopy(CLAIM_ROWS_V2_POLICY)
    return transformed


def render_manifest(manifest: dict[str, Any]) -> str:
    """Return stable UTF-8-friendly JSON with one terminating newline."""

    return json.dumps(manifest, ensure_ascii=False, indent=2, separators=(",", ": ")) + "\n"


def expected_output_name(package_version: str) -> str:
    """Derive the only accepted output filename from package major/minor."""

    major, minor, _patch = _parse_semver(package_version, "packageVersion")
    return f"doorstar-rag-manifest.v{major}.{minor}.json"


def _validate_output_path(source_manifest: str | Path, output: str | Path, package_version: str) -> Path:
    source = Path(source_manifest).resolve()
    candidate = Path(output)
    expected_name = expected_output_name(package_version)
    if candidate.name != expected_name:
        _fail("OUTPUT_NAME_INVALID", "output", f"Output filename must be exactly '{expected_name}'.")
    resolved = candidate.resolve(strict=False)
    if resolved.parent != source.parent:
        _fail("OUTPUT_OUTSIDE_PACKAGE", "output", "Output must be directly inside the source-manifest directory.")
    if resolved == source:
        _fail("SOURCE_OVERWRITE_FORBIDDEN", "output", "The source manifest can never be an output target.")
    if candidate.is_symlink():
        _fail("OUTPUT_SYMLINK_FORBIDDEN", "output", "A symbolic-link output target is not allowed.")
    return resolved


def write_manifest_atomic(
    source_manifest: str | Path,
    output: str | Path,
    package_version: str,
    manifest: dict[str, Any],
    *,
    replace: bool = False,
) -> Path:
    """Atomically publish an already validated manifest inside its package."""

    target = _validate_output_path(source_manifest, output, package_version)
    if target.exists() and not replace:
        _fail("OUTPUT_EXISTS", "output", "Output exists; pass --replace to replace this exact versioned target.")
    if target.exists() and not target.is_file():
        _fail("OUTPUT_TYPE_INVALID", "output", "Existing output target must be a regular file.")

    payload = render_manifest(manifest).encode("utf-8")
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=target.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        if replace:
            if target.is_symlink():
                _fail("OUTPUT_SYMLINK_FORBIDDEN", "output", "A symbolic-link output target is not allowed.")
            os.replace(temporary, target)
        else:
            try:
                os.link(temporary, target)
            except FileExistsError:
                _fail("OUTPUT_EXISTS", "output", "Output appeared concurrently and was not overwritten.")
            temporary.unlink()
        _fsync_directory(target.parent)
    finally:
        if temporary.exists():
            temporary.unlink()
    return target


def _fsync_directory(directory: Path) -> None:
    """Persist the directory entry where the platform supports directory fsync."""

    if os.name == "nt":
        return
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _parser() -> JsonArgumentParser:
    parser = JsonArgumentParser(description=__doc__)
    parser.add_argument("--source-manifest", required=True)
    parser.add_argument("--package-version", required=True)
    parser.add_argument("--document-version", required=True)
    parser.add_argument("--profile", default=SUPPORTED_PROFILE)
    parser.add_argument("--eval-file")
    parser.add_argument("--inventory-file")
    parser.add_argument("--output")
    parser.add_argument("--replace", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    try:
        arguments = _parser().parse_args(argv)
        if arguments.replace and arguments.output is None:
            _fail("REPLACE_WITHOUT_OUTPUT", "replace", "--replace requires --output.")
        result = build_versioned_manifest(
            arguments.source_manifest,
            arguments.package_version,
            arguments.document_version,
            profile=arguments.profile,
            eval_file=arguments.eval_file,
            inventory_file=arguments.inventory_file,
        )
        if arguments.output is not None:
            write_manifest_atomic(
                arguments.source_manifest,
                arguments.output,
                arguments.package_version,
                result,
                replace=arguments.replace,
            )
        sys.stdout.buffer.write(render_manifest(result).encode("utf-8"))
        return 0
    except ManifestVersioningError as exc:
        sys.stderr.buffer.write(render_manifest(exc.as_json()).encode("utf-8"))
        return 2
    except OSError as exc:
        error = ManifestVersioningError("FILESYSTEM_ERROR", "filesystem", f"Filesystem operation failed: {exc}.")
        sys.stderr.buffer.write(render_manifest(error.as_json()).encode("utf-8"))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
