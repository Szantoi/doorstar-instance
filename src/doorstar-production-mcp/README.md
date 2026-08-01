# Doorstar Production MCP

Read-only, local `stdio` MCP adapters for Doorstar. The package contains two
separate processes and capability surfaces:

- `dist/index.js`: the Doorstar Üzemi Tábla production API and the curated
  repository documentation corpus;
- `dist/nexusBridge.js`: one narrow `search_knowledge` proxy to the
  server-scoped Doorstar Nexus island.

Neither process exposes a write operation, generic HTTP method, database
driver, credential value, or caller-selectable island/collection.

## Scope and safety

The adapter has seven live-production tools backed by fixed `GET` calls to the
local Production Service (`http://127.0.0.1:4610/api/production` by default),
plus two local RAG tools over a curated Doorstar documentation corpus. The
separate Nexus process exposes one additional tool over the indexed woodworking
corpus:

| MCP tool | Production Service endpoint |
| --- | --- |
| `get_overview` | `GET /projects` + `GET /board?week=...` |
| `list_projects` | `GET /projects` |
| `get_project` | `GET /projects/:key` |
| `get_board` | `GET /board?week=...` |
| `get_kanban` | `GET /kanban?station=...&week=...` |
| `get_load` | `GET /load?week=...` |
| `get_task` | `GET /tasks/:id` |
| `search_knowledge` | Curated local Markdown retrieval (BM25-style) |
| `corpus_status` | Curated local corpus provenance/status |

| Nexus MCP tool | Fixed upstream operation |
| --- | --- |
| `search_knowledge` | Authenticated `tools/call` to the server-assigned `doorstar` island |

There is no generic HTTP tool, no write method, no database driver, or
credential literal in the package. The RAG corpus is an explicit Markdown allowlist;
it excludes configuration, source code, untracked/modified documents, large
or binary files, symlinks, and documents matching secret patterns. Each
retrieval result contains its path, section, hash and excerpt. Tool errors
deliberately do not expose connection details or response bodies. MCP protocol
data is written only to `stdout`; diagnostics go to `stderr`.

The Nexus bridge uses the fixed shared Nexus endpoint. A strict principal
allowlist maps each Doorstar Codex role to exactly one Windows user-environment
credential name; an unknown principal or missing role credential fails closed
and never falls back to the compatibility identity. The tool accepts only a
trimmed query and a result limit from 1 to 10. It rejects redirects, oversized
or malformed responses, mismatched JSON-RPC IDs, and every response that does
not explicitly confirm `island: "doorstar"`. Unknown upstream fields are
stripped. Credentials are never stored in this repository or emitted in errors.

## Installation and local run

This directory intentionally has its own dependencies and lockfile. From this
directory, install and build it:

```powershell
npm install
npm run build
```

The Production Service must be running locally on port `4610`. Then configure
an MCP host to launch the compiled adapter:

```json
{
  "mcpServers": {
    "doorstar-production": {
      "command": "node",
      "args": ["C:\\Users\\szant\\Documents\\Development\\doorstar-instance\\src\\doorstar-production-mcp\\dist\\index.js"]
    }
  }
}
```

For a non-default local endpoint, set the parent process environment variable
`DOORSTAR_PRODUCTION_API_BASE_URL`. It must be an `http` or `https` URL; no
tokens or API keys are needed in this MVP.

```powershell
$env:DOORSTAR_PRODUCTION_API_BASE_URL = "http://127.0.0.1:4610/api/production"
npm start
```

The six uniquely named role bridges (`doorstar_knowledge_<role>`) are
registered project-locally in `../../.codex/config.toml`; the matching role
contracts also live under `../../.codex/agents/`. Codex CLI 0.144.5 loads the
custom instructions but does not add a child-only MCP server, so the base
registration is the compatibility layer. Specialist instructions require their
role-specific server and forbid every other role server. Credentials live in
the Windows user environment. On
Windows the bridge reads the selected current user-scoped value from
`HKCU\\Environment` through the absolute System32 `reg.exe`; this also makes a
rotated token authoritative when an older Codex background host still carries
the previous process value. If that lookup is unavailable, only the selected
role's inherited value is considered. Nothing is printed. A new task is still
required to load new custom-agent definitions; restarting only the UI does not
mutate an existing task's agent inventory.

```powershell
# Values are provisioned out-of-band and must not be committed or pasted in logs.
# Example variable name only; use the matching custom-agent configuration.
$env:DOORSTAR_NEXUS_FRONTEND_TOKEN = [Environment]::GetEnvironmentVariable(
  "DOORSTAR_NEXUS_FRONTEND_TOKEN", "User"
)
$env:DOORSTAR_NEXUS_PRINCIPAL = "doorstar-frontend-codex"
npm run start:nexus
```

## Verification

```powershell
npm test
npm run build
npm run verify:nexus-identities
npm audit --omit=dev --audit-level=high
```

The adapter pins the official `@modelcontextprotocol/sdk` v1.29.0 package.
The official SDK still recommends v1.x for production while v2 remains
pre-alpha. The implementation uses the standard `StdioServerTransport` and
declares every tool with `readOnlyHint: true`.

The six server-side role identities all resolve to the `doorstar` island and
therefore to the `doorstar-knowledge` collection. Nexus also enforces their
knowledge-only profile: `tools/list` contains exactly `search_knowledge`, while
explicit-list, formerly global, and unlisted/default tool calls all return 403.
The retired shared `doorstar-codex` identity has no live token or island
mapping. `npm run verify:nexus-identities` proves the complete live role matrix
without printing credential values.

This MCP is a development assistant capability; it is not a browser UI/backend
contract. RAG excerpts are advisory evidence and must not become dimensions,
formulas, tolerances, materials, finishes or released manufacturing decisions
without authoritative source review.

## Intentional next boundary

An agent must not modify Doorstar through this adapter. If an approved writing
MCP is needed later, it should be a separately reviewed capability with real
agent identity, scoped authorization, audit events, and explicit confirmation
for destructive actions. Do not add `POST`, `PUT`, `PATCH`, or `DELETE` to
this adapter as a shortcut.
