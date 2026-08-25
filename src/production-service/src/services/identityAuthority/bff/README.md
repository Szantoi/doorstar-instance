# Doorstar M2B BFF foundation

This directory is a source-only security foundation. It is not imported by the
Express application and cannot issue a browser cookie, query PostgreSQL, call
Keycloak, call the Kernel, change CORS, or mount a route.

## Contents

- **mac.ts** — named deployment-secret HMAC adapter with explicit key versions,
  fixed domains, binary length-prefixed inputs, constant-time verification, and
  a service-enforced current-plus-one-previous key ring. Raw key bytes are not
  part of its production API.
- **session.ts** — exact opaque selector.verifier and CSRF grammar, secure
  host-only cookie header plans, pairwise-distinct credential validation, and
  nanosecond-preserving access-token/ID-token/maximum expiry minimum.
- **humanOidcProfile.ts** — opaque factory for the complete static human OIDC
  profile and its canonical SHA-256 fingerprint; it derives exactly `openid`
  plus one product scope and no caller supplies a digest.
- **pkceTransaction.ts** — one-time selector-derived S256 PKCE material,
  strict raw callback parsing, repository start/CAS ports, and one closure-only
  callback that receives code/verifier/nonce only after the CAS succeeds.

A decision that is safe to log contains only a kind field. Opaque state, nonce,
PKCE verifier, authorization code, session selector/verifier and CSRF values
remain closure-local. There is no public decision-to-secret accessor; the PKCE
boundary invokes its trusted callback only after a successful atomic claim.

## Activation boundary

A later reviewed composition root in the evidence module will combine this
foundation with strict human OIDC token validation, M0 resolver revalidation and
the typed session repository. That work is blocked by the release-pinned human
OIDC profile, canonical public host, M1B disposable migration proof,
runtime-principal preflight, native audit-actor decision, Kernel release
attestation, and explicit approval for an isolated integration stack.

See DSCONV-03-M2B-BFF-SESSION-AND-CUTOVER-DESIGN.md for the full contract.
