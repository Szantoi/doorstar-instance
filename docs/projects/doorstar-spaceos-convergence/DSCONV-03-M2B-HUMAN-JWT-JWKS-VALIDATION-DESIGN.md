# DSCONV-03 — M2B strict human JWT/JWKS validation design

- **Status:** reviewed source-only design; no runtime activation
- **Date:** 2026-08-25
- **Scope:** the strict validation boundary between a future OIDC code exchange
  and the private evidence boundary

## Goal and non-goals

This slice turns the existing opaque, release-pinned human OIDC profile into a
fail-closed verifier contract for the two tokens that a future PKCE code
exchange returns. It accepts an authority-bearing access token only together
with a nonce-bound ID token, emits normalized token-free facts only after both
validate, and never fetches, mounts a route, sets a cookie, stores a token, or
calls Keycloak, Kernel, Prisma, Express, or the network.

It is deliberately not an authorization decision and it cannot mint the M1
`VerifiedHumanIdentityProof`. That private capability remains in `evidence.ts`.
The later composition root will supply the verifier with the callback-local
code-exchange values after the PKCE transaction CAS has succeeded.

## Public boundary

`createDoorstarHumanJwtVerifier({ profile, jwksTextSource, now })` accepts only
a factory-issued `DoorstarHumanOidcProfile`, an opaque source factory-issued
for that **same** profile, and a trusted clock. The source captures the
canonical release ID, issuer, JWKS URI and profile digest; a source constructed
for any other profile makes verifier construction fail. It gives a future
transport no browser-controlled `kid`, issuer, URI, or token input.

The source loader receives only that canonical binding, an abort signal, and a
64 KiB pre-materialization response cap. The port races the loader against a
two-second deadline, aborts the signal on either completion or timeout, and
accepts only a bounded raw UTF-8 byte sequence. A real transport must enforce
the cap while streaming; it may not call `Response.text()` or allocate an
unbounded response before returning to this port.

The resulting verifier exposes only:

```ts
verifyAndConsume(
  { accessToken, idToken, expectedNonce, claimedProfile },
  async (delivery) => delivery.consume((facts) => result),
)
```

`claimedProfile` is the complete validation-profile snapshot obtained only from
the successful PKCE CAS closure. Before token or JWKS processing, it must match
the verifier factory's opaque profile exactly. The callback receives a one-use
`delivery`; only `delivery.consume` exposes the `facts` value inside that
callback scope. The facts contain normalized subject, one tenant, versions,
canonical grant sequences, access-token issued / expiry instants, and ID-token
expiry. They contain no raw JWT, decoded header, decoded payload, JWK, `kid`,
nonce, authorization code, redirect URI, or profile object. The completion is
only an accepted/denied/unavailable static outcome; it does not carry facts or
a callback result. No public decision-to-secret accessor is introduced.

## Release-pinned validation profile

The existing opaque profile is extended before the validator is implemented.
The following verifier-relevant values are exact profile fields and are all
included in its length-prefixed SHA-256 fingerprint:

- `accessTokenJoseType`, `accessTokenPayloadType`, and `idTokenJoseType`;
- separate `accessTokenMaximumLifetimeSeconds` and
  `idTokenMaximumLifetimeSeconds`, bounded by the protocol safety ceiling;
- `authorityProjectionContract: "spaceos-v1-nested-single-tenant"`;
- `idTokenAuthorityClaims: "forbidden"`.

This prevents a release from changing a token type, lifetime, authority claim
model, or ID-token authority policy without changing the transaction-bound
profile fingerprint. The factory accepts no caller-supplied fingerprint or
partial validation profile. The actual trial values still require a reviewed,
release-pinned Doorstar artifact.

## Fixed protocol grammar

The `doorstar-human-oidc-v1` protocol fixes RS256, the exact field shapes, and
the nested authority contract. A future protocol revision requires a new
profile-version and review, not a runtime downgrade; its release-specific type
and lifetime values are fingerprinted through the profile above.

| Item | Access token | ID token |
| --- | --- | --- |
| Compact JWS | exactly 3 canonical base64url segments | exactly 3 canonical base64url segments |
| JOSE header | exactly `{ alg: "RS256", typ: profile.accessTokenJoseType, kid }` | exactly `{ alg: "RS256", typ: profile.idTokenJoseType, kid }` |
| Signature | RSA SHA-256, static algorithm argument | RSA SHA-256, static algorithm argument |
| Payload type | `typ === profile.accessTokenPayloadType` | no payload `typ` field |
| Clock claims | exact integer `iat`, `nbf`, `exp` | exact integer `iat`, `nbf`, `exp` |

The access payload has exactly these fields:

```text
iss, sub, aud, azp, iat, nbf, exp, typ,
spaceos_tenants, spaceos_membership_version, spaceos_projection_version
```

The ID payload has exactly these fields:

```text
iss, sub, aud, azp, iat, nbf, exp, nonce
```

This is intentionally more restrictive than an unpinned default Keycloak
token. A trial release artifact must configure its mapper/claim surface to this
shape (or first introduce a reviewed new profile version); silently allowing
unknown claims would make the release pin ineffective. The historical flat /
ES256 Keycloak document is not a valid artifact for this protocol.

## JSON, JWK and signature safety

A BFF-local full-depth JSON scanner runs before `JSON.parse` for every compact
JWS header/payload and raw JWKS document. The compact-JWS, JWK and claim parser
pipeline is module-local to `humanJwtVerifier.ts`; it is not a runtime-importable
pre-verification authority API. It uses fatal UTF-8 decoding, exact
byte caps, a bounded nesting depth, and a decoded-key set for **each** object.
Thus duplicate escaped keys such as `"a"` and `"\\u0061"` cannot be collapsed
by `JSON.parse`; duplicate key rejection also covers nested tenant entries and
nested JWK fields. The old resolver parser remains root-only and is not reused.

The initial release accepts a JWKS root of exactly `{ keys }`, one through eight
keys, and each key exactly:

```text
{ kid, kty: "RSA", use: "sig", alg: "RS256", n, e }
```

`kid` uses a bounded canonical grammar and is globally unique across the whole
JWKS. There is no no-`kid` fallback, first-key fallback, `jku`, embedded `jwk`,
certificate, symmetric, EC, private-key, or algorithm fallback. Only a copied
`{ kty: "RSA", n, e }` object reaches Node's `createPublicKey`; the imported
key must be public RSA, at least 2048 bits, with exponent 65537. Verification
always calls `verify("RSA-SHA256", ...)`, never an algorithm selected by the
untrusted header.

## Claim binding and time rules

Both tokens must have the profile's exact issuer, audience set, and authorized
party. `aud` may be a canonical string or sorted, unique array, but after
normalization it must exactly equal the profile's corresponding audience set.
The access and ID issuer and subject must match exactly. The ID nonce must be
the callback-local expected nonce using a fixed-length-safe comparison.

All NumericDate values are safe integer Unix seconds representable in the
canonical UTC range. For each token:

- `iat <= now + clockSkew`;
- `nbf <= now + clockSkew`;
- `exp > now - clockSkew`;
- `iat <= exp`, `nbf <= exp`, and `exp - iat <=` the corresponding
  profile-pinned maximum lifetime.

Skew applies only to acceptance. The output preserves the raw access `iat` and
`exp`; it never extends an evidence or session expiry. The existing evidence
policy and session-minimum calculation therefore remain stricter at use time.

Only the access token provides authority facts. It must contain exactly one
`spaceos_tenants` entry with exact fields `tenant_id`, `permissions`, and
`enabled_modules`; the tenant ID, grant count/order/pairs, and positive safe
integer membership/projection versions use the existing v1 grammar. Flat,
mixed, unknown, multi-tenant, duplicate, unordered, or version-invalid
authority claims fail closed. The ID token must have no `spaceos_*` field and
cannot provide authority, issuance, cutoff, or expiry facts.

## Outcome handling and future composition

Malformed tokens, unknown `kid`, signature mismatches, invalid claims, and
access/ID binding drift return only static `denied` codes. A malformed,
cryptographically unusable, oversized or timed-out JWKS document is an
infrastructure contract failure and therefore returns static `unavailable`, as
does a thrown JWKS source or clock failure; neither error detail nor raw
material enters a log or response. The verifier has no cache or grace path.

The later `evidence.ts` composition root will call the validator only inside
the post-CAS PKCE closure, mint the private proof from the access-only facts,
perform the fresh M0 resolver comparison, and then atomically persist evidence
and session. Until the release-pinned OIDC artifact, canonical public host,
M1B migration proof, runtime-principal preflight, and approved integration
environment exist, this source is not mountable or trial-activating.

## Required evidence

- valid 2048-bit RS256 access + ID pair reaches the consumer with no raw token;
- duplicate JSON keys at header, nested payload and JWK depth are rejected;
- bad/padded/noncanonical segments, `alg=none`, wrong header, wrong key,
  1024-bit/EC/private/duplicate JWK, `kid` collision and no-match all reject;
- issuer/audience/azp/subject/nonce/time edge cases, noncanonical NumericDate,
  wrong payload type, extra claim, and native-claim grammar failures reject;
- no JWK source failure becomes authorization and no skew changes raw expiry;
- the verifier import graph contains no Express, Prisma, fetch, route, cookie,
  database, or evidence-proof mint dependency.
- every build clears the exact `dist` output first and then proves its compiled
  verifier has only the factory export and no stale pre-verification contract
  artifact.
