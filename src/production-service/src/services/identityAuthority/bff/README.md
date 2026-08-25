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
  strict raw callback parsing, repository start/CAS ports, and an opaque
  one-use post-CAS delivery. Its guarded consumer removes code/verifier/nonce
  before invoking the trusted callback and the boundary waits for any started
  consumption.
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
- **humanOidcCodeExchangePort.ts** — opaque, complete-profile-bound source
  port between the PKCE CAS callback and a future token-endpoint adapter. It
  sends the loader only the canonical authorization-code request fields, gives
  it one 2 s / 64 KiB-bounded attempt, and releases an exact access/ID compact
  JWS pair only through a one-use callback-local delivery whose started
  consumption is awaited before a completion can be accepted. It is not an
  HTTP client and does not define the token HTTP/JSON or client-auth grammar.
- **humanJwtVerifier.ts** — profile-pinned, no-cache RS256 access/ID pair
  validator. Its compact-JWS, strict-claims and exact JWKS parser is module-local
  (not an importable runtime API), deliberately stricter than a default Keycloak
  mapper surface: one nested native tenant projection and no ID-token authority.
  It accepts raw JWKS bytes only through the profile-bound source port and
  delivers token-free access authority facts once, in a callback-local opaque
  capability.
- **controlPlaneRepository.ts** — narrow injected-Prisma issuance adapter.
  It can only load the complete binding snapshot and, after the evidence
  boundary unlocks a genuine opaque commit, write preallocated immutable
  evidence and its session in one interactive transaction. It deliberately has
  no session read, validation, revoke or generic persistence operation.

A decision that is safe to log contains only a kind field. Opaque state, nonce,
PKCE verifier, authorization code, session selector/verifier and CSRF values
remain callback-local. There is no decision-to-secret return accessor: the
guarded PKCE consumer accepts only a genuine post-CAS delivery and removes its
secret snapshot before a trusted consumer runs.

## Activation boundary

`evidence.ts:createDoorstarIdentityBoundary(...)` now composes the PKCE
callback, this profile-bound code-exchange source port, strict human OIDC token
validation, M0 resolver revalidation and this typed issuance repository. Its
only authority-bearing input is a genuine post-CAS claimed delivery. The JWT
verifier, production resolver and issuance commit are each guarded by
module-owned runtime capabilities, so a structural test double cannot become an
authority source or generic persistence DTO. An `accepted` source-port
completion still proves only that the trusted callback consumed its one token
delivery; it never by itself means identity validation or session issuance
succeeded.

The actual profile-pinned HTTP adapter remains absent: its exact client-auth,
form, response/error/refresh grammar needs the release-pinned human OIDC
artifact first. Nothing in this directory fetches, caches, mounts or directly
issues browser cookies. The boundary merely hands cookie header plans to a
future injected HTTP boundary after the transaction has committed. Activation
is also blocked by the canonical public host, M1B/M2B disposable migration
proof, runtime-principal preflight, native audit-actor decision, Kernel release
attestation, and explicit approval for an isolated integration stack.

The OIDC transaction migration has its own stronger disposable proof command:
`npm run test:migration:m2b-oidc`. It refuses the earlier M1B approval token,
normal application database variables and persistent Docker port; it remains
deliberately unrun until its exact new approval and loopback target exist.

See DSCONV-03-M2B-BFF-SESSION-AND-CUTOVER-DESIGN.md,
DSCONV-03-M2B-HUMAN-JWT-JWKS-VALIDATION-DESIGN.md and
DSCONV-03-M2B-OIDC-CODE-EXCHANGE-PORT-DESIGN.md, and
DSCONV-03-M2B-IDENTITY-BOUNDARY-AND-ISSUANCE-DESIGN.md for the full contract.
