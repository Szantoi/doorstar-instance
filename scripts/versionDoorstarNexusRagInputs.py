#!/usr/bin/env python3
"""Version Doorstar RAG inventory/eval inputs without mutating their source.

The command is preview-only unless ``--output`` is supplied.  Inventory hash
refreshes are restricted to sources that are not referenced by any canonical
manifest document.  Both subcommands emit deterministic UTF-8 JSON and only
write an exact versioned filename next to the source artifact.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tempfile
from copy import deepcopy
from datetime import date
from pathlib import Path, PurePosixPath
from typing import Any, Sequence


SEMVER_RE = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
SOURCE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
ALLOWED_DOCUMENT_MODES = {"ALL", "ANY"}


class _DuplicateJsonKeyError(ValueError):
    pass


def _reject_duplicate_json_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise _DuplicateJsonKeyError(f"Duplicate JSON key: {key}")
        value[key] = item
    return value


def _load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_reject_duplicate_json_keys,
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, _DuplicateJsonKeyError) as exc:
        raise ValueError(f"Invalid UTF-8 JSON input: {path.name}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"JSON input must be an object: {path.name}")
    return value


def _render(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _semver(value: str, field: str) -> tuple[int, int, int]:
    if SEMVER_RE.fullmatch(value) is None:
        raise ValueError(f"{field} must be semantic version syntax.")
    core = re.split(r"[-+]", value, maxsplit=1)[0]
    return tuple(int(part) for part in core.split("."))  # type: ignore[return-value]


def _version_label(value: str) -> str:
    major, minor, _ = _semver(value, "version")
    return f"{major}.{minor}"


def _safe_repo_relative(value: Any) -> bool:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        return False
    path = PurePosixPath(value)
    return (
        not path.is_absolute()
        and ":" not in path.parts[0]
        and all(part not in {"", ".", ".."} for part in path.parts)
    )


def _find_repository_root(start: Path) -> Path:
    for candidate in (start, *start.parents):
        if (candidate / ".git").exists():
            return candidate.resolve()
    raise ValueError("Repository root could not be found from the source input.")


def _resolve_inside(root: Path, relative: str) -> Path:
    candidate = (root / Path(*PurePosixPath(relative).parts)).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as exc:
        raise ValueError("Source path escapes the repository root.") from exc
    return candidate


def _assert_doorstar_dry_run(
    value: dict[str, Any], *, inventory: bool = False, manifest: bool = False
) -> None:
    if value.get("targetIsland") != "doorstar":
        raise ValueError("Target island must be exactly doorstar.")
    if manifest and (
        value.get("mode") != "dry-run"
        or value.get("nexusWrite") is not False
        or value.get("chromaWrite") is not False
    ):
        raise ValueError("Manifest must remain dry-run with Nexus and ChromaDB writes disabled.")
    if inventory:
        if value.get("dryRunOnly") is not True or value.get("ragIndexable") is not False:
            raise ValueError("Inventory must remain dry-run-only and non-indexable.")
        policy = value.get("mutationPolicy")
        if not isinstance(policy, dict) or policy.get("nexus") != "FORBIDDEN" or policy.get("chromaDb") != "FORBIDDEN":
            raise ValueError("Inventory must forbid Nexus and ChromaDB mutation.")


def version_inventory(
    source_path: str | Path,
    manifest_path: str | Path,
    version: str,
    snapshot_date: str,
    refresh_source_ids: Sequence[str],
) -> dict[str, Any]:
    """Return a versioned inventory projection; never write the source file."""

    source = Path(source_path).resolve()
    manifest_file = Path(manifest_path).resolve()
    inventory = _load_json(source)
    manifest = _load_json(manifest_file)
    _assert_doorstar_dry_run(inventory, inventory=True)
    _assert_doorstar_dry_run(manifest, manifest=True)
    old_version = str(inventory.get("inventoryVersion", ""))
    if _semver(version, "version") <= _semver(old_version, "inventoryVersion"):
        raise ValueError("New inventory version must be greater than the source version.")
    try:
        parsed_date = date.fromisoformat(snapshot_date)
    except ValueError as exc:
        raise ValueError("snapshot-date must be an ISO calendar date.") from exc
    if parsed_date.isoformat() != snapshot_date:
        raise ValueError("snapshot-date must be canonical YYYY-MM-DD.")
    if manifest_file.parent != source.parent:
        raise ValueError("Manifest and inventory must belong to the same package directory.")

    documents = manifest.get("documents")
    if not isinstance(documents, list) or not documents:
        raise ValueError("Manifest must contain canonical documents.")
    referenced_sources: set[str] = set()
    for document in documents:
        if not isinstance(document, dict) or not isinstance(document.get("sources"), list):
            raise ValueError("Manifest document sources are invalid.")
        for declared in document["sources"]:
            if not isinstance(declared, dict) or not isinstance(declared.get("sourceId"), str):
                raise ValueError("Manifest source declaration is invalid.")
            referenced_sources.add(declared["sourceId"])

    sources = inventory.get("sources")
    if not isinstance(sources, list) or inventory.get("sourceCount") != len(sources):
        raise ValueError("Inventory sourceCount does not match its sources array.")
    indexed: dict[str, dict[str, Any]] = {}
    for entry in sources:
        if not isinstance(entry, dict):
            raise ValueError("Inventory source entry must be an object.")
        source_id = entry.get("sourceId")
        if not isinstance(source_id, str) or SOURCE_ID_RE.fullmatch(source_id) is None or source_id in indexed:
            raise ValueError("Inventory source IDs must be unique audited identifiers.")
        indexed[source_id] = entry

    requested = list(refresh_source_ids)
    if not requested or len(set(requested)) != len(requested):
        raise ValueError("At least one unique refresh-source-id is required.")
    repository_root = _find_repository_root(source.parent)
    projected = deepcopy(inventory)
    projected_by_id = {entry["sourceId"]: entry for entry in projected["sources"]}
    for source_id in sorted(requested):
        if source_id not in indexed:
            raise ValueError(f"Unknown inventory source ID: {source_id}")
        if source_id in referenced_sources:
            raise ValueError(f"Referenced canonical source cannot be refreshed: {source_id}")
        entry = indexed[source_id]
        relative = entry.get("relativePath")
        if not _safe_repo_relative(relative):
            raise ValueError(f"Unsafe repository-relative source path: {source_id}")
        observed = _resolve_inside(repository_root, relative)
        if not observed.is_file() or observed.is_symlink():
            raise ValueError(f"Refresh source must be a regular non-symlink file: {source_id}")
        target_entry = projected_by_id[source_id]
        target_entry["sha256"] = _sha256_file(observed)
        target_entry["sizeBytes"] = observed.stat().st_size

    projected["inventoryVersion"] = version
    projected["snapshotDate"] = snapshot_date
    return projected


def version_eval(source_path: str | Path, version: str, document_mode: str = "ALL") -> dict[str, Any]:
    """Return an eval projection with explicit document matching semantics."""

    source = Path(source_path).resolve()
    value = _load_json(source)
    _assert_doorstar_dry_run(value)
    _semver(version, "version")
    if document_mode not in ALLOWED_DOCUMENT_MODES:
        raise ValueError("document-mode must be ALL or ANY.")
    if value.get("schemaVersion") != "doorstar-rag-eval.v1":
        raise ValueError("Only the audited Doorstar eval v1 schema can be versioned.")
    questions = value.get("questions")
    if not isinstance(questions, list) or len(questions) < 20:
        raise ValueError("At least 20 eval questions are required.")
    ids: set[str] = set()
    projected = deepcopy(value)
    for question in projected["questions"]:
        if not isinstance(question, dict) or not isinstance(question.get("id"), str):
            raise ValueError("Eval question identities are invalid.")
        question_id = question["id"]
        if question_id in ids:
            raise ValueError("Eval question IDs must be unique.")
        ids.add(question_id)
        for field in ("expectedDocumentIds", "expectedSourceIds", "expectedClaimIds"):
            values = question.get(field)
            if not isinstance(values, list) or not values or any(not isinstance(item, str) or not item for item in values):
                raise ValueError(f"Eval expectation is invalid: {question_id}.{field}")
        question["expectedDocumentMode"] = document_mode
    projected["evalVersion"] = version
    return projected


def build_live_baseline(
    dry_run_report_path: str | Path,
    live_apply_audit_path: str | Path,
) -> dict[str, Any]:
    """Project the exact applied v1.0 hash set into the planner baseline schema."""

    report_path = Path(dry_run_report_path).resolve()
    report = _load_json(report_path)
    audit = _load_json(Path(live_apply_audit_path).resolve())
    if report.get("schemaVersion") != "doorstar-nexus-rag-dry-run-report.v1":
        raise ValueError("Unsupported dry-run report schema for live baseline projection.")
    if report.get("packageVersion") != "1.0.0" or report.get("ok") is not True:
        raise ValueError("Live baseline source must be the successful v1.0 dry-run report.")
    summary = report.get("summary")
    documents = report.get("documents")
    chunks = report.get("chunks")
    if (
        not isinstance(summary, dict)
        or summary.get("documentCount") != 6
        or summary.get("chunkCount") != 41
        or not isinstance(documents, list)
        or len(documents) != 6
        or not isinstance(chunks, list)
        or len(chunks) != 41
    ):
        raise ValueError("Live baseline source must contain exactly six documents and 41 chunks.")
    package = audit.get("package")
    successful = audit.get("successfulRun")
    target = audit.get("target")
    if (
        audit.get("schemaVersion") != "doorstar-nexus-rag-live-apply-audit.v1"
        or not isinstance(package, dict)
        or package.get("packageHash") != report.get("packageHash")
        or package.get("dryRunReportSha256") != _sha256_file(report_path)
        or not isinstance(successful, dict)
        or successful.get("status") != "APPLIED"
        or successful.get("createdCount") != 41
        or successful.get("postCount") != 2016
        or not isinstance(target, dict)
        or target.get("island") != "doorstar"
        or target.get("collection") != "doorstar-knowledge"
    ):
        raise ValueError("Live apply audit does not prove the exact v1.0 package state.")

    document_key_by_pair: dict[tuple[str, str], str] = {}
    projected_documents: list[dict[str, Any]] = []
    for document in documents:
        if not isinstance(document, dict):
            raise ValueError("Dry-run document row is invalid.")
        document_id = document.get("id")
        document_version = document.get("version")
        document_key = document.get("documentKey")
        canonical_sha = document.get("canonicalSha256")
        if (
            not isinstance(document_id, str)
            or not isinstance(document_version, str)
            or SHA256_RE.fullmatch(str(document_key)) is None
            or SHA256_RE.fullmatch(str(canonical_sha)) is None
        ):
            raise ValueError("Dry-run document identity/hash is invalid.")
        pair = (document_id, document_version)
        if pair in document_key_by_pair:
            raise ValueError("Dry-run document identity is duplicated.")
        document_key_by_pair[pair] = str(document_key)
        projected_documents.append({
            "documentKey": document_key,
            "documentId": document_id,
            "documentVersion": document_version,
            "canonicalSha256": canonical_sha,
            "chunkKeys": [],
        })

    projected_by_key = {item["documentKey"]: item for item in projected_documents}
    projected_chunks: list[dict[str, str]] = []
    chunk_keys: set[str] = set()
    for chunk in chunks:
        if not isinstance(chunk, dict):
            raise ValueError("Dry-run chunk row is invalid.")
        pair = (chunk.get("documentId"), chunk.get("documentVersion"))
        document_key = document_key_by_pair.get(pair)  # type: ignore[arg-type]
        chunk_key = str(chunk.get("chunkKey", ""))
        content_sha = str(chunk.get("contentSha256", ""))
        if (
            document_key is None
            or SHA256_RE.fullmatch(chunk_key) is None
            or SHA256_RE.fullmatch(content_sha) is None
            or chunk_key in chunk_keys
        ):
            raise ValueError("Dry-run chunk ownership/hash is invalid or duplicated.")
        chunk_keys.add(chunk_key)
        projected_by_key[document_key]["chunkKeys"].append(chunk_key)
        projected_chunks.append({
            "chunkKey": chunk_key,
            "contentSha256": content_sha,
            "documentKey": document_key,
        })
    created_ids_sha = hashlib.sha256(
        json.dumps(sorted(chunk_keys), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    if successful.get("createdIdsSha256") != created_ids_sha:
        raise ValueError("Live apply created-ID receipt does not match the v1 dry-run chunk set.")
    for document in projected_documents:
        document["chunkKeys"].sort()
        if not document["chunkKeys"]:
            raise ValueError("Every live baseline document must own at least one chunk.")
    projected_documents.sort(key=lambda item: (item["documentId"], item["documentVersion"]))
    projected_chunks.sort(key=lambda item: item["chunkKey"])
    return {
        "schemaVersion": "doorstar-nexus-rag-readonly-baseline.v1",
        "targetIsland": "doorstar",
        "targetCollection": "doorstar-knowledge",
        "documents": projected_documents,
        "chunks": projected_chunks,
    }


def _write_exact_versioned(
    value: dict[str, Any], source: Path, output: str | Path, expected_name: str, replace: bool
) -> None:
    target = Path(output).absolute()
    if target.parent != source.resolve().parent or target.name != expected_name:
        raise ValueError(f"Output must be package-local and named exactly {expected_name}.")
    if target.resolve() == source.resolve():
        raise ValueError("The source artifact cannot be overwritten.")
    if target.is_symlink():
        raise ValueError("Output must not be a symbolic link.")
    if target.exists() and not replace:
        raise ValueError("Output already exists; use --replace for an intentional regeneration.")
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="\n", prefix=f".{expected_name}.", suffix=".tmp",
            dir=target.parent, delete=False
        ) as handle:
            handle.write(_render(value))
            temporary = Path(handle.name)
        temporary.replace(target)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def _write_live_baseline(value: dict[str, Any], report_path: Path, output: str | Path, replace: bool) -> None:
    repository_root = _find_repository_root(report_path.resolve().parent)
    expected_parent = repository_root / "docs" / "projects" / "doorstar-nexus-rag-execution"
    target = Path(output).absolute()
    expected_name = "PACKAGE_BASELINE.live-v1.0.json"
    if target.parent != expected_parent.resolve() or target.name != expected_name:
        raise ValueError(f"Live baseline output must be exactly docs/projects/doorstar-nexus-rag-execution/{expected_name}.")
    if target.is_symlink() or (target.exists() and not replace):
        raise ValueError("Live baseline output is a symlink or already exists without --replace.")
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="\n", prefix=f".{expected_name}.", suffix=".tmp",
            dir=target.parent, delete=False
        ) as handle:
            handle.write(_render(value))
            temporary = Path(handle.name)
        temporary.replace(target)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Version Doorstar RAG inventory/eval inputs; preview is the default.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    inventory = subparsers.add_parser("inventory")
    inventory.add_argument("--source", required=True)
    inventory.add_argument("--manifest", required=True)
    inventory.add_argument("--version", required=True)
    inventory.add_argument("--snapshot-date", required=True)
    inventory.add_argument("--refresh-source-id", action="append", required=True)
    inventory.add_argument("--output")
    inventory.add_argument("--replace", action="store_true")

    evaluation = subparsers.add_parser("eval")
    evaluation.add_argument("--source", required=True)
    evaluation.add_argument("--version", required=True)
    evaluation.add_argument("--document-mode", choices=sorted(ALLOWED_DOCUMENT_MODES), default="ALL")
    evaluation.add_argument("--output")
    evaluation.add_argument("--replace", action="store_true")

    baseline = subparsers.add_parser("baseline")
    baseline.add_argument("--dry-run-report", required=True)
    baseline.add_argument("--live-apply-audit", required=True)
    baseline.add_argument("--output")
    baseline.add_argument("--replace", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "baseline":
            source = Path(args.dry_run_report).resolve()
            value = build_live_baseline(source, args.live_apply_audit)
            if args.output:
                _write_live_baseline(value, source, args.output, args.replace)
            sys.stdout.write(_render(value))
            return 0
        source = Path(args.source).resolve()
        if args.command == "inventory":
            value = version_inventory(
                source, args.manifest, args.version, args.snapshot_date, args.refresh_source_id
            )
            expected = f"SOURCE_INVENTORY.v{_version_label(args.version)}.json"
        else:
            value = version_eval(source, args.version, args.document_mode)
            expected = f"RAG_EVAL_QUESTIONS.v{_version_label(args.version)}.json"
        if args.output:
            _write_exact_versioned(value, source, args.output, expected, args.replace)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    sys.stdout.write(_render(value))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
