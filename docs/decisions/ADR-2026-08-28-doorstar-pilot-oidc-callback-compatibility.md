# ADR-2026-08-28 — Doorstar pilot OIDC callback compatibility

**Status:** Accepted for source configuration guidance
**Date:** 2026-08-28

## Context

The isolated Doorstar pilot BFF has a deliberately narrow public surface. Its
authorization-code + PKCE callback uses the exact HTTPS redirect URI configured
by `DOORSTAR_PILOT_OIDC_REDIRECT_URI`, and accepts only one non-empty `code`
and one non-empty `state` in a `GET` query.

This is stricter than the callback shape emitted by some identity providers.
For example, Keycloak documents that it can append `session_state` to an OIDC
authentication response, with a per-client compatibility switch to exclude it.
The historical `KEYCLOAK_DOORSTAR_CONFIG.md` targets the retired
SpaceOS/Kernel soft launch; it is not an activation guide for this pilot.

## Decision

1. Keep the BFF callback allowlist unchanged: only `code` and `state` are
   accepted. Duplicate values, `session_state`, `iss`, error fields, fragments
   and form posts fail closed. No proxy or ingress may strip fields to change
   that result.
2. An approved IdP client must use a confidential authorization-code client
   with PKCE S256, an exact HTTPS redirect URI, and a GET query response that
   contains only the allowed fields. For Keycloak, a separately approved Gate
   2 configuration must use its documented per-client exclusion of
   `session_state` when that field would otherwise be returned.
3. `.env.example` documents the mandatory, non-production redirect URI name
   and shape. It contains no usable secret or deployment value.
4. The Gate 2 record must preserve only a redacted proof of callback parameter
   names and the accepted/rejected outcome. It must not retain authorization
   codes, state values, tokens, subjects, cookies or customer data.
5. Any need to accept another callback parameter requires a separate security
   decision, tests and independent review. It is not an operator workaround.

## Consequences

- The callback parser remains resistant to parameter-confusion and duplicate
  value ambiguity, but an IdP is not compatible merely because it supports
  OIDC.
- Keycloak can be used only after its client configuration has been verified
  against the source contract and separately approved under the operations
  gate. This ADR neither creates a client nor changes an IdP.
- The legacy Keycloak specification remains historical evidence only. It must
  not supply the pilot audience, password grant, role mapping or callback
  settings.

## References

- [Pilot OIDC compatibility contract](../projects/doorstar-isolated-pilot/OIDC-CLIENT-COMPATIBILITY.md)
- [Pilot operations and release gate](../projects/doorstar-isolated-pilot/OPERATIONS-RELEASE-GATE.md)
- [Keycloak documented `session_state` compatibility setting](https://www.keycloak.org/docs/latest/upgrading/)
