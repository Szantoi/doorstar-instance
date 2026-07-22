# Doorstar Production MCP

Read-only, local `stdio` MCP adapter for the Doorstar Üzemi Tábla production API.
It is a separate **domain MCP**: it belongs to Doorstar and does not contain
Nexus-dev code, Nexus registration, credentials, database access, or write
operations. A later Nexus-dev agent/knowledge setup may register this adapter
as one of its domain MCP servers.

## Scope and safety

The adapter has seven live-production tools backed by fixed `GET` calls to the
local Production Service (`http://127.0.0.1:4610/api/production` by default),
plus two local RAG tools over a curated Doorstar documentation corpus:

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

There is no generic HTTP tool, no write method, no database driver, and no
credential/config file. The RAG corpus is an explicit Markdown allowlist;
it excludes configuration, source code, untracked/modified documents, large
or binary files, symlinks, and documents matching secret patterns. Each
retrieval result contains its path, section, hash and excerpt. Tool errors
deliberately do not expose connection details or response bodies. MCP protocol
data is written only to `stdout`; diagnostics go to `stderr`.

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

## Verification

```powershell
npm test
npm run build
```

The adapter pins the official `@modelcontextprotocol/sdk` v1.29.0 package.
The official SDK still recommends v1.x for production while v2 remains
pre-alpha. The implementation uses the standard `StdioServerTransport` and
declares every tool with `readOnlyHint: true`.

## Intentional next boundary

An agent must not modify Doorstar through this adapter. If an approved writing
MCP is needed later, it should be a separately reviewed capability with real
agent identity, scoped authorization, audit events, and explicit confirmation
for destructive actions. Do not add `POST`, `PUT`, `PATCH`, or `DELETE` to
this adapter as a shortcut.
