# Doorstar M2B BFF foundation

This directory is a source-only security foundation. It is not imported by the
Express application and cannot by itself issue a browser cookie, call Keycloak
or the Kernel, change CORS, or mount a route. Its typed transaction adapter
accepts a future injected Prisma delegate, but no client/configuration/runtime
composition exists here and module loading opens no database connection.

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
  plus one product scope, and fingerprints the JWT types, token lifetime caps,
  nested authority contract and ID-token authority prohibition as well.
- **pkceTransaction.ts** — one-time selector-derived S256 PKCE material,
  strict raw callback parsing, repository start/CAS ports, and one closure-only
  callback that receives code/verifier/nonce only after the CAS succeeds.
- **oidcTransactionRepository.ts** — the narrow typed Prisma adapter for the
  durable PKCE transaction record. It has insert-only start, unconsumed lookup
  and one conditional expiry-aware CAS; it never stores callback or token
  material and is not mounted by the application.
- **strictJson.ts** — bounded fatal-UTF-8 parser that rejects duplicate decoded
  JSON keys at every object depth and preserves root primitive lexemes for
  canonical NumericDate checks.
- **humanJwksPort.ts** — opaque JWKS source factory bound to one profile's
  release/issuer/URI/digest. Its future loader receives an abort signal and
  64 KiB streaming cap, and is cut off after two seconds.
- **humanJwtVerifier.ts** — profile-pinned, no-cache RS256 access/ID pair
  validator. Its compact-JWS, strict-claims and exact JWKS parser is module-local
  (not an importable runtime API), deliberately stricter than a default Keycloak
  mapper surface: one nested native tenant projection and no ID-token authority.
  It accepts raw JWKS bytes only through the profile-bound source port and
  delivers token-free access authority facts once, in a callback-local opaque
  capability.

A decision that is safe to log contains only a kind field. Opaque state, nonce,
PKCE verifier, authorization code, session selector/verifier and CSRF values
remain closure-local. There is no public decision-to-secret accessor; the PKCE
boundary invokes its trusted callback only after a successful atomic claim.

## Activation boundary

A later reviewed composition root in the evidence module will combine this
foundation with a bounded code-exchange transport, this strict human OIDC token
validation, M0 resolver revalidation and the typed session repository. The
current verifier does not fetch, cache or mount anything; a source port exists
only for a future profile-pinned JWKS transport adapter. That work is blocked
by the release-pinned human OIDC artifact, canonical public host, M1B disposable
migration proof, runtime-principal preflight, native audit-actor decision,
Kernel release attestation, and explicit approval for an isolated integration
stack.

The OIDC transaction migration has its own stronger disposable proof command:
`npm run test:migration:m2b-oidc`. It refuses the earlier M1B approval token,
normal application database variables and persistent Docker port; it remains
deliberately unrun until its exact new approval and loopback target exist.

See DSCONV-03-M2B-BFF-SESSION-AND-CUTOVER-DESIGN.md and
DSCONV-03-M2B-HUMAN-JWT-JWKS-VALIDATION-DESIGN.md for the full contract.
