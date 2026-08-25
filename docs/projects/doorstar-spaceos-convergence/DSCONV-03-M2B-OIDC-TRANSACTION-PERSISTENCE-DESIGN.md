# DSCONV-03 — M2B OIDC login-transaction persistence design

- **Status:** reviewed source-only design; no database migration has run
- **Date:** 2026-08-25
- **Scope:** the durable, one-time PKCE transaction record used before a
  future human OIDC code exchange

## Goal and non-goals

The existing PKCE boundary creates an immutable transaction before it sends an
authorization redirect, then supplies an opaque, one-use post-CAS delivery.
Its guarded consumer exposes code/verifier/nonce only while consuming that
genuine delivery; a second consumer cannot retry the code. This slice gives
that boundary a typed, forward-only PostgreSQL record and a narrow repository
adapter without mounting a route, setting a cookie, calling an OIDC endpoint,
or running a migration.

It is not a login implementation. It does not store an authorization code,
state value, nonce, PKCE verifier, access token, ID token, refresh token,
client assertion, client secret, raw MAC key, browser role, station, tenant,
or consumer selector. The later code-exchange contract remains blocked by the
release-pinned Doorstar human OIDC artifact.

## Record shape

`DoorstarOidcLoginTransaction` contains only the immutable values already
covered by the transaction state MAC:

| Field group | Stored values | Rule |
| --- | --- | --- |
| Lookup | `id`, `selector` | selector is a unique 43-character canonical base64url value |
| MAC state | `keyVersion`, `stateMacKeyVersion`, 32-byte `stateMac` | positive versions; no raw key or state value |
| Profile snapshot | `issuer`, `clientId`, `redirectUri`, `profileDigest` | exact static profile fields, immutable after insert |
| Exact time | issued/expires wire, epoch-second and nanosecond triples | canonical triples; `issued < expires`; lifetime is 1–600 seconds |
| Lifecycle | nullable `consumedAt`, database-owned `createdAt` | only `NULL → database clock` consumption is legal |

The record intentionally retains no relation to an evidence/session row: an
attempt may be consumed even when its subsequent token exchange or resolver
check fails. This prevents retrying a one-time authorization code.

## Database invariants

The forward-only migration reuses the M1B migration schema's trusted
`pg_catalog, <migration-schema>, pg_temp` function search path and its exact
UTC-triplet helper.

- `selector` is unique and has the exact opaque selector grammar;
- `stateMac` is exactly 32 bytes and both key versions are positive;
- issued/expires triples must agree with their canonical wire values and the
  duration must be between one second and the PKCE maximum of ten minutes;
- all profile, MAC and time fields are insert-only;
- `createdAt` is overwritten by the database clock; a supplied `consumedAt` is
  rejected; the sole update is `consumedAt: NULL → clock_timestamp()`;
- delete and `TRUNCATE` are blocked. Retention must be a later, separately
  reviewed privileged cleanup workflow; the BFF runtime principal never gets a
  deletion path.

The trigger is `ENABLE ALWAYS`. That protects ordinary application sessions
from accidental trigger disabling, but it does not replace the later
non-owner/non-superuser runtime-principal proof.

## Repository contract

The current `DoorstarOidcTransactionRepository` is deliberately retained:

```ts
begin(transaction) -> "started" | "not_started"
findUnconsumedBySelector(selector) -> transaction | undefined
claimMatching({ selector, stateMacKeyVersion, stateMac, profileDigest, now })
  -> "claimed" | "not_claimed"
```

`begin` is a single insert, never an upsert: a selector collision produces
`not_started`. `findUnconsumedBySelector` filters `consumedAt IS NULL`, but can
return an expired record so the PKCE boundary can keep its precise
`transaction_expired` result.

`claimMatching` is one conditional `UPDATE`, not read-then-write. Its predicate
requires the selector, key-version, exact 32-byte state MAC, profile digest,
unconsumed lifecycle state, and a lexicographically exact expiry tuple greater
than the trusted canonical `now` tuple. Exactly one updated row is the only
success condition. The database, rather than caller input, writes `consumedAt`.

Thus a malformed state/profile callback does not consume the transaction, while
racing valid callbacks can consume it only once. Once a CAS succeeds, any
later exchange/JWT/resolver failure remains terminal and must not retry the
code.

## Required evidence

- source adapter: malformed/proxy records reject before use; unique collision
  maps only to `not_started`; claimed rows are not found; MAC/profile/expiry
  mismatch produces no claim; a race permits one claim only;
- migration proof: forward deployment from M1B, selector/MAC/UTC/TTL checks,
  immutable fields, database-owned audit times, one-time consumption,
  delete/revert/`TRUNCATE` rejection and `ENABLE ALWAYS` trigger;
- static scan: no authorization code, state, nonce, verifier, access/ID/refresh
  token, client assertion, secret or raw MAC key appears in the model,
  repository result, logging or public response contract;
- `prisma generate`, focused unit suite, TypeScript build, OpenAPI gate and
  `git diff --check` must pass. The disposable PostgreSQL proof remains opt-in.

## Activation and external gates

The source may be reviewed and committed without a database connection. Actual
`migrate deploy` still requires the explicit disposable loopback approval
contract. A later BFF runtime principal must be non-owner/non-superuser and
receive only the narrow `INSERT`/`SELECT`/`UPDATE(consumedAt)` grants needed by
this repository.

The actual code-exchange client remains non-mountable until the reviewed
Doorstar OIDC artifact fixes client authentication, exact token response
grammar, refresh-token policy, issuer, redirect URI, canonical host and edge
callback-log policy. Kernel release attestation and an explicitly approved
isolated Keycloak–Kernel–Doorstar E2E remain separate trial gates.
