#!/usr/bin/env python3
"""Stream an audited Doorstar v1.1 candidate corpus to an offline evaluator.

The command writes nothing and performs no network, Nexus, ChromaDB, database,
or subprocess operation.  Canonical text is emitted only to stdout so it can be
passed through a raw-byte pipe to the exact-model evaluator; it is never added
to the RAG package as a payload or preview artifact.
"""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import re
import sys
from pathlib import Path
from typing import Any, Sequence


SCRIPT_DIR = Path(__file__).resolve().parent
VALIDATOR_PATH = SCRIPT_DIR / "prepareDoorstarNexusRag.py"
SPEC = importlib.util.spec_from_file_location("doorstar_rag_candidate_validator", VALIDATOR_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Doorstar RAG validator could not be loaded.")
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


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


def _content_free_report(value: dict[str, Any], optional_write: bool) -> dict[str, Any]:
    projected = copy.deepcopy(value)
    proof = projected.get("dryRunProof")
    if isinstance(proof, dict):
        proof["optionalLocalReportWrite"] = optional_write
    warnings = projected.get("warnings")
    if isinstance(warnings, list):
        retained = [
            warning
            for warning in warnings
            if not isinstance(warning, dict)
            or warning.get("code") != "INVENTORY_UNREFERENCED_SOURCE_DRIFT"
        ]
        removed_count = len(warnings) - len(retained)
        projected["warnings"] = retained
        summary = projected.get("summary")
        if removed_count and isinstance(summary, dict) and isinstance(summary.get("warningCount"), int):
            summary["warningCount"] -= removed_count
    return projected


def build_candidate_input(
    manifest_path: str | Path,
    inventory_path: str | Path,
    dry_run_report_path: str | Path,
) -> dict[str, Any]:
    """Reconstruct the exact package-only candidate input in memory."""

    manifest_file = Path(manifest_path).resolve()
    inventory_file = Path(inventory_path).resolve()
    report_file = Path(dry_run_report_path).resolve()
    manifest = _load_json(manifest_file)
    stored_report = _load_json(report_file)
    if (
        manifest.get("targetIsland") != "doorstar"
        or manifest.get("packageVersion") != "1.1.0"
        or manifest.get("mode") != "dry-run"
        or manifest.get("nexusWrite") is not False
        or manifest.get("chromaWrite") is not False
    ):
        raise ValueError("Candidate input requires the Doorstar v1.1 dry-run manifest.")
    current_report = VALIDATOR.validate_package(manifest_file, inventory_file)
    if not current_report.get("ok"):
        raise ValueError("Candidate package no longer passes the dry-run validator.")
    if _content_free_report(current_report, True) != _content_free_report(stored_report, True):
        raise ValueError("Stored dry-run report differs from exact current reconstruction.")
    summary = stored_report.get("summary")
    if (
        not isinstance(summary, dict)
        or summary.get("documentCount") != 6
        or summary.get("claimCount") != 98
        or summary.get("chunkCount") != 104
        or summary.get("evalQuestionCount") != 35
        or summary.get("errorCount") != 0
    ):
        raise ValueError("Candidate report must prove 6 documents, 98 claims, 104 chunks, and 35 questions.")

    eval_relative = manifest.get("evalFile")
    if not isinstance(eval_relative, str):
        raise ValueError("Candidate manifest evalFile is invalid.")
    eval_file = manifest_file.parent / eval_relative
    evaluation = _load_json(eval_file)
    questions = evaluation.get("questions")
    if not isinstance(questions, list) or len(questions) != 35:
        raise ValueError("Candidate eval must contain exactly 35 questions.")
    for question in questions:
        if not isinstance(question, dict) or question.get("expectedDocumentMode") not in {"ALL", "ANY"}:
            raise ValueError("Every candidate eval question needs explicit ALL/ANY document semantics.")

    reconstructed_chunks: list[dict[str, Any]] = []
    claim_citations: list[dict[str, Any]] = []
    reconstructed_report_chunks: list[dict[str, Any]] = []
    documents = manifest.get("documents")
    if not isinstance(documents, list) or len(documents) != 6:
        raise ValueError("Candidate manifest must contain exactly six documents.")
    for document in documents:
        if not isinstance(document, dict):
            raise ValueError("Candidate manifest document is invalid.")
        canonical_relative = document.get("canonicalFile")
        if not isinstance(canonical_relative, str):
            raise ValueError("Candidate canonicalFile is invalid.")
        canonical_file = (manifest_file.parent / canonical_relative).resolve()
        try:
            canonical_file.relative_to(manifest_file.parent.resolve())
        except ValueError as exc:
            raise ValueError("Candidate canonicalFile escapes the package.") from exc
        text = canonical_file.read_text(encoding="utf-8")
        chunks = VALIDATOR.build_chunks(
            text,
            document["id"],
            document["version"],
            document["chunkingPolicy"],
            include_content=True,
        )
        for chunk in chunks:
            reconstructed_report_chunks.append({
                key: value for key, value in chunk.items() if key not in {"content", "section"}
            })
            source_ids = sorted({match.group("source") for match in VALIDATOR.CITATION_RE.finditer(chunk["content"])})
            reconstructed_chunks.append({
                "chunkKey": chunk["chunkKey"],
                "documentId": chunk["documentId"],
                "chunkKind": chunk["chunkKind"],
                "claimIds": chunk["claimIds"],
                "content": chunk["content"],
            })
            if chunk["chunkKind"] == "CLAIM":
                if len(chunk["claimIds"]) != 1 or not source_ids:
                    raise ValueError("Every CLAIM chunk must have one claim ID and at least one audited citation.")
                claim_citations.append({"claimId": chunk["claimIds"][0], "sourceIds": source_ids})

    reconstructed_chunks.sort(key=lambda item: item["chunkKey"])
    reconstructed_report_chunks.sort(key=lambda item: item["chunkKey"])
    report_chunks = sorted(stored_report["chunks"], key=lambda item: item["chunkKey"])
    if reconstructed_report_chunks != report_chunks:
        raise ValueError("Candidate chunk set differs from the dry-run report.")
    if len({item["chunkKey"] for item in reconstructed_chunks}) != 104:
        raise ValueError("Candidate chunk keys must be unique.")
    claim_ids = [claim_id for item in reconstructed_chunks for claim_id in item["claimIds"]]
    if len(claim_ids) != 98 or len(set(claim_ids)) != 98:
        raise ValueError("Candidate must map every claim to exactly one unique chunk.")
    claim_citations.sort(key=lambda item: item["claimId"])
    if [item["claimId"] for item in claim_citations] != sorted(claim_ids):
        raise ValueError("Candidate claim citation mapping is incomplete or duplicated.")

    return {
        "schemaVersion": "doorstar-rag-candidate-eval-input.v1",
        "package": {
            "packageId": manifest["packageId"],
            "packageVersion": manifest["packageVersion"],
            "packageHash": stored_report["packageHash"],
            "targetIsland": "doorstar",
        },
        "chunks": reconstructed_chunks,
        "claimCitations": claim_citations,
        "questions": questions,
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Stream a validated Doorstar v1.1 candidate corpus to stdout only.")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--dry-run-report", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        value = build_candidate_input(args.manifest, args.inventory, args.dry_run_report)
    except (OSError, UnicodeDecodeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n"
    sys.stdout.buffer.write(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
