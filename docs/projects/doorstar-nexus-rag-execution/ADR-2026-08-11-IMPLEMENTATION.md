# ADR-2026-08-11 implementation checkpoint

**Status:** Code and local validation complete; no VPS deployment or credential
rotation was performed by this change.

## Delivered boundary

- The local bridge uses only the fixed Tailnet `:3467/mcp` woodworking tenant,
  requires an explicitly selected audited principal, and fails closed after an
  authenticated health and static-manifest attestation.
- The tenant exposes only `search_knowledge` over the deterministic Doorstar
  woodworking cards. It does not read repository, book, OCR, network, or
  development content during retrieval.
- The card manifest follows the canonical six-stage Doorstar workflow,
  including the separate `6. Kiszállítható` card.
- The deployment closure, systemd unit, one-time installer, and credential
  provisioner keep runtime code immutable to `doorstar-rag`, generate six new
  tenant-only tokens, retain a root-only rollback copy through live
  verification, and restore a prior tenant state on failed rotation.

## Local evidence

- `npm test` — 36 passing tests.
- `npx tsc -p tsconfig.json --noEmit`, `npm run build`, and
  `npm run build:tenant-runtime` passed.
- Both PowerShell deployment scripts passed parser validation.

## Required operator handoff

1. From `src/doorstar-production-mcp`, run
   `./scripts/installTenantWoodworkingRuntime.ps1` to install the private VPS
   runtime and unit.
2. Run `./scripts/provisionTenantWoodworkingCredentials.ps1`. It writes the
   six Windows user variables and performs live verification; do not paste or
   log any credential values.
3. Open a new Codex task after a successful rotation. The project MCP config
   currently starts bridge entrypoints from the main checkout, so activation
   requires the reviewed change to be present there as well.
