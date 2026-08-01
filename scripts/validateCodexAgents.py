#!/usr/bin/env python3
"""Validate the project-scoped Doorstar Codex identity contract.

The script is dependency-free (Python 3.11+ ``tomllib``) so the same identity
and secret-boundary checks can run locally and in CI.
"""

from __future__ import annotations

import re
import sys
import tomllib
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
AGENT_ROOT = REPO_ROOT / ".codex" / "agents"
BRIDGE_SOURCE = REPO_ROOT / "src" / "doorstar-production-mcp" / "src" / "nexusKnowledge.ts"
HEX_SECRET = re.compile(r"^[0-9a-fA-F]{64}$")

EXPECTED = {
    "doorstar_root.toml": (
        "doorstar_root", "doorstar-root-codex", "DOORSTAR_NEXUS_ROOT_TOKEN", "workspace-write", "root"
    ),
    "doorstar_conductor.toml": (
        "doorstar_conductor", "doorstar-conductor-codex", "DOORSTAR_NEXUS_CONDUCTOR_TOKEN", "workspace-write", "conductor"
    ),
    "doorstar_monitor.toml": (
        "doorstar_monitor", "doorstar-monitor-codex", "DOORSTAR_NEXUS_MONITOR_TOKEN", "read-only", "monitor"
    ),
    "doorstar_backend.toml": (
        "doorstar_backend", "doorstar-backend-codex", "DOORSTAR_NEXUS_BACKEND_TOKEN", "workspace-write", "backend"
    ),
    "doorstar_frontend.toml": (
        "doorstar_frontend", "doorstar-frontend-codex", "DOORSTAR_NEXUS_FRONTEND_TOKEN", "workspace-write", "frontend"
    ),
    "doorstar_import_discovery.toml": (
        "doorstar_import_discovery", "doorstar-import-discovery-codex", "DOORSTAR_NEXUS_IMPORT_DISCOVERY_TOKEN", "workspace-write", "import-discovery"
    ),
}


def read_toml(path: Path) -> dict[str, Any]:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def string_values(value: Any):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for nested in value.values():
            yield from string_values(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from string_values(nested)


def main() -> int:
    errors: list[str] = []
    actual_files = {path.name for path in AGENT_ROOT.glob("*.toml")}
    if actual_files != set(EXPECTED):
        errors.append(f"custom agent file set mismatch: {sorted(actual_files)}")

    bridge_source = BRIDGE_SOURCE.read_text(encoding="utf-8")
    seen_names: set[str] = set()
    seen_principals: set[str] = set()

    for filename, (name, principal, token_env, sandbox, terminal) in EXPECTED.items():
        path = AGENT_ROOT / filename
        if not path.is_file():
            continue
        config = read_toml(path)
        if config.get("name") != name:
            errors.append(f"{filename}: expected name={name!r}")
        if not isinstance(config.get("description"), str) or not config["description"].strip():
            errors.append(f"{filename}: missing description")
        if not isinstance(config.get("developer_instructions"), str) or not config["developer_instructions"].strip():
            errors.append(f"{filename}: missing developer_instructions")
        if config.get("sandbox_mode") != sandbox:
            errors.append(f"{filename}: expected sandbox_mode={sandbox!r}")
        if "model" in config:
            errors.append(f"{filename}: model must inherit from the parent")

        server_name = f"doorstar_knowledge_{terminal.replace('-', '_')}"
        servers = config.get("mcp_servers", {})
        server = servers.get(server_name, {})
        if "doorstar_knowledge" in servers:
            errors.append(f"{filename}: generic parent MCP server must not be overridden")
        if server.get("env_vars") != [token_env]:
            errors.append(f"{filename}: must forward exactly {token_env}")
        if server.get("enabled_tools") != ["search_knowledge"]:
            errors.append(f"{filename}: must expose exactly search_knowledge")
        if server.get("env", {}).get("DOORSTAR_NEXUS_PRINCIPAL") != principal:
            errors.append(f"{filename}: principal mismatch")
        if principal not in bridge_source or token_env not in bridge_source:
            errors.append(f"{filename}: principal-to-token mapping missing from bridge allowlist")

        if not (REPO_ROOT / "terminals" / terminal / "AGENTS.md").is_file():
            errors.append(f"{filename}: terminals/{terminal}/AGENTS.md missing")
        if any(HEX_SECRET.fullmatch(value) for value in string_values(config)):
            errors.append(f"{filename}: possible credential literal in tracked TOML")
        if name in seen_names or principal in seen_principals:
            errors.append(f"{filename}: duplicate name or principal")
        seen_names.add(name)
        seen_principals.add(principal)

    root_config = read_toml(REPO_ROOT / ".codex" / "config.toml")
    if "agents" in root_config:
        errors.append(".codex/config.toml: leave concurrency to the installed Codex runtime")
    root_servers = root_config.get("mcp_servers", {})
    if "doorstar_knowledge" in root_servers:
        errors.append(".codex/config.toml: ambiguous generic knowledge server is forbidden")
    for _filename, (_name, principal, token_env, _sandbox, terminal) in EXPECTED.items():
        server_name = f"doorstar_knowledge_{terminal.replace('-', '_')}"
        server = root_servers.get(server_name, {})
        if server.get("env_vars") != [token_env]:
            errors.append(f".codex/config.toml: {server_name} token forwarding mismatch")
        if server.get("enabled_tools") != ["search_knowledge"]:
            errors.append(f".codex/config.toml: {server_name} must expose exactly search_knowledge")
        if server.get("env", {}).get("DOORSTAR_NEXUS_PRINCIPAL") != principal:
            errors.append(f".codex/config.toml: {server_name} principal mismatch")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print("Doorstar Codex agent contract valid: 6 agents, 6 unique Nexus principals, no token literals.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
