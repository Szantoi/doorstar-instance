# Doorstar Production MCP

Read-only, local `stdio` MCP adapters for Doorstar. The package contains two
separate processes and capability surfaces:

- `dist/index.js`: the Doorstar Üzemi Tábla production API and a static,
  tenant-scoped woodworking-card corpus;
- `dist/nexusBridge.js`: one narrow `search_knowledge` proxy to the dedicated,
  Tailnet-only Doorstar woodworking tenant.

Neither process exposes a write operation, generic HTTP method, database
driver, credential value, or caller-selectable island/collection.

## Scope and safety

The adapter has seven live-production tools backed by fixed `GET` calls to the
local Production Service (`http://127.0.0.1:4610/api/production` by default),
plus two local RAG tools over static Doorstar woodworking cards. The
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
| `search_knowledge` | Static Doorstar woodworking-card retrieval (BM25-style) |
| `corpus_status` | Tenant corpus provenance/status |

| Nexus MCP tool | Fixed upstream operation |
| --- | --- |
| `search_knowledge` | Authenticated `tools/call` to the fixed `doorstar-woodworking` tenant |

There is no generic HTTP tool, no write method, no database driver, or
credential literal in the package. The local RAG corpus is a deterministic
in-memory tenant manifest: it reads neither the repository nor an external
drive at request time. Its original, concise cards contain no book, scan, OCR
export, source title, page number, or filesystem location. Results expose only
a synthetic card reference, section, hash, and excerpt.

The Nexus bridge pins `http://100.82.133.87:3467/mcp`, never the broad `:3466`
corpus. Before every search it verifies the authenticated `/health` attestation
for `doorstar-woodworking`, the `doorstar` tenant, `woodworking` scope, a
non-empty corpus, port 3467, and the local corpus fingerprint. It sends only
the fixed `domain: "woodworking"` filter. The response must reproduce the
local manifest card order, metadata, deterministic excerpt, and (when present)
score; otherwise it fails closed. There is no fallback to `:3466`.

A strict principal allowlist maps each Doorstar Codex role to exactly one
Windows user-environment credential name; unknown principals and missing role
credentials fail closed. Credentials are never stored in this repository or
emitted in errors.

## Installation and local run

This directory intentionally has its own dependencies and lockfile. From this
directory, install and build it:

```powershell
npm install
npm run build
npm run build:tenant-runtime
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

## Private tenant runtime

`npm run build:tenant-runtime` creates the dependency-free ESM deployment
closure in `dist/tenant-woodworking-runtime/`: the tenant server, static corpus,
and a minimal `package.json`. It intentionally excludes `agents.json` and every
credential. The VPS service template is
`deploy/nexus-dev-doorstar-woodworking.service`; it binds only
`100.82.133.87:3467` and must not receive an nginx site, public DNS route, or
public UFW rule.

For the first VPS installation, run only from the Doorstar Windows-user
context:

```powershell
.\scripts\installTenantWoodworkingRuntime.ps1
.\scripts\provisionTenantWoodworkingCredentials.ps1
```

The installer builds and checks the exact closure, verifies copied SHA-256
values, creates the `doorstar-rag` system user/group, installs a
`root:doorstar-rag` `0750` runtime with `root:root` `0644` code, and validates
the systemd unit. It requires a disabled, credential-free tenant state and
never transfers a credential. The provisioner then creates six tenant-only values, keeps a
root-only rollback copy until the live six-principal attestation passes, and
restores the prior configuration/state on failure. Never copy the old `:3466`
credentials. Open a new Codex task after success so its bridge inventory reads
the rotated values.

## Verification

```powershell
npm test
npm run build
npm run build:tenant-runtime
npm run verify:nexus-identities
npm audit --omit=dev --audit-level=high
```

The adapter pins the official `@modelcontextprotocol/sdk` v1.29.0 package.
The official SDK still recommends v1.x for production while v2 remains
pre-alpha. The implementation uses the standard `StdioServerTransport` and
declares every tool with `readOnlyHint: true`.

The six server-side role identities resolve only to the `doorstar` tenant and
`doorstar-woodworking` corpus. The tenant exposes exactly `search_knowledge`;
unlisted/default tool calls return 403. The retired shared `doorstar-codex`
identity has no live token or tenant mapping. `npm run verify:nexus-identities`
proves the live role matrix, health attestation, and woodworking-only response
contract without printing credential values.

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
