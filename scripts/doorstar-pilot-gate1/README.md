# Doorstar pilot Gate 1 runtime-input verifier

This zero-dependency Node tool binds the **exact, already accepted Gate 0
candidate** to the fixed runtime inputs of one future disposable A-03 proof.
It is read-only: it does not run a candidate package, `npm`, Docker,
PostgreSQL, Prisma, a database, an IdP, or a network request. Its only child
process capability is the already-reviewed Gate 0 acceptance verifier's
bounded Git read path.

The output is a structural provenance artifact, **not a Gate 1 human
approval**. A separate, authoritative one-run human Gate 1 record must bind
the resulting `runtimeManifestSha256` and the other redacted output values
before any disposable Docker proof may start.

## Authority limit

This directory is checked-out source, not the required independent verifier
artifact. Its helpers may support review of an external verifier design, but
neither their output nor an unsigned approval record may authorize Docker.
The local `src/doorstar-pilot-staging-proof` CLI intentionally stops with
`a03_gate1_external_trust_anchor_required` before it invokes these helpers.
Execution remains blocked until an immutable verifier release and an
independently administered authenticated approval anchor are separately
approved and provisioned.

## Strict CLI

Run from the repository root with a trusted Node `v24.13.0` process. The
candidate is a full Git SHA; every other input is an absolute path outside the
checkout. There are no environment fallbacks or default locations.

```powershell
node scripts/doorstar-pilot-gate1/verifyGate1RuntimeInputs.mjs `
  --candidate <full-lowercase-commit-sha> `
  --capsule <absolute-external-gate0-capsule-path> `
  --acceptance <absolute-external-gate0-acceptance-marker-path> `
  --runtime-manifest <absolute-external-runtime-manifest-path> `
  --docker-cli <absolute-external-docker-cli-file-path> `
  --prisma-toolchain <absolute-external-prisma-node-modules-directory>
```

The verifier first re-verifies the Gate 0 capsule and acceptance marker for
the exact clean checkout. Only then does it read the runtime manifest and hash
the actual Docker CLI and staged Prisma toolchain inputs. It rejects ambient
Git/Node/pilot/Docker/container-runtime routing variables before that process.
As with Gate 0, clear `NODE_OPTIONS` before starting Node: a preload could
already have run before this script can inspect the environment.

## Canonical runtime manifest v1

The external manifest must be exactly canonical JSON (sorted object keys,
two-space indentation, one final newline) with these and only these fields:

```text
schemaVersion: 1
kind: "doorstar-pilot-gate1-runtime-input-manifest"
status: "GATE1_RUNTIME_INPUTS_BOUND_NOT_APPROVED"
candidate: { commitSha, treeSha, objectFormat }
gate0CapsuleSha256: <64 lowercase hex>
gate0AcceptanceMarkerSha256: <64 lowercase hex>
dockerCliContentSha256: <64 lowercase hex>
postgresImageReference: "postgres@sha256:<64 lowercase hex>"
prismaToolchainTreeSha256: <64 lowercase hex>
nodeVersion: "v24.13.0"
```

Extra keys, a person identity, timestamp, approval field, path, secret,
connection string, hostname, tag-only image reference, noncanonical bytes, or
an unpinned Node version are rejected. The manifest's candidate and Gate 0
hashes must exactly match the freshly verified Gate 0 provenance; the Docker
and Prisma hashes must match the actual external content.

## Bounded external-content rules

The Docker executable and the Prisma toolchain must be deliberately staged
outside the checkout. Every path component and every descendant must be real,
not a symbolic link. Only regular files and real directories are allowed.
The source helper rejects UNC/device paths, alternate data streams and Windows
paths outside the host system-root volume, but that remains a trusted-host path
policy rather than OS-level drive-type attestation; Unix network mounts are
also not distinguishable here. The future independent verifier must use its
own hardened physical-path resolver or a signature-backed artifact authority.

| Input | Maximum |
| --- | ---: |
| Docker CLI regular file | 128 MiB |
| Prisma toolchain regular file | 128 MiB |
| Prisma toolchain total content | 512 MiB |
| Prisma toolchain files / directories | 20,000 / 10,000 |
| Prisma directory depth | 64 |
| Prisma relative UTF-8 path | 4,096 bytes |

The tool hashes an opened Docker file and rejects observed replacement or
growth. The Prisma input is the externally staged `node_modules` source root
used by the approved snapshot procedure. It is walked twice to reject an
observed tree change.

Its tree hash is precisely:

```text
SHA-256(canonicalJson({
  schemaVersion: 1,
  kind: "doorstar-pilot-gate1-prisma-toolchain-tree",
  files: [{ path, size, sha256 }, ...]
}))
```

`files` is sorted by the UTF-8 byte order of slash-normalized relative paths;
each item contains the path, regular-file byte size, and SHA-256 of its exact
content. Directory metadata, absolute roots, owners, timestamps, and paths are
not part of the tree hash or public output.

## Success output

On success stdout is canonical JSON with only:

```text
schemaVersion, kind, status, candidate,
gate0CapsuleSha256, gate0AcceptanceMarkerSha256,
runtimeManifestSha256, dockerCliContentSha256,
postgresImageReference, prismaToolchainTreeSha256, nodeVersion
```

Its status remains `GATE1_RUNTIME_INPUTS_BOUND_NOT_APPROVED`. It deliberately
contains no executable, toolchain, manifest, checkout, evidence, or Docker
socket path. Store it with the separate human Gate 1 decision record; it does
not authorize execution by itself.

## Gate 1 approval-record verifier

`verifyGate1Approval.mjs` first runs the same Gate 0 + Gate 1 runtime-input
verification using the explicitly supplied candidate checkout. Only after that
does it read a separately stored approval record. It never treats a file's
presence, a status value, or this script's output as cryptographic
authentication of a human approver.

```powershell
node scripts/doorstar-pilot-gate1/verifyGate1Approval.mjs `
  --repo-root <absolute-candidate-checkout-path> `
  --candidate <full-lowercase-commit-sha> `
  --capsule <absolute-external-gate0-capsule-path> `
  --acceptance <absolute-external-gate0-acceptance-marker-path> `
  --runtime-manifest <absolute-external-runtime-manifest-path> `
  --docker-cli <absolute-external-docker-cli-file-path> `
  --prisma-toolchain <absolute-external-prisma-node-modules-directory> `
  --approval <absolute-external-gate1-approval-record-path>
```

`--repo-root` is the only input within the candidate checkout. All remaining
artifact and runtime paths must be absolute and external; the approval record
uses the same bounded, regular-file, no-symlink evidence reader as Gate 0.

### Minimal canonical approval record v1

The external record is canonical JSON with exactly these fields:

```text
schemaVersion: 1
kind: "doorstar-pilot-gate1-human-approval"
status: "GATE1_HUMAN_APPROVED"
candidate: { commitSha, treeSha, objectFormat }
runtimeManifestSha256: <64 lowercase hex>
dockerCliContentSha256: <64 lowercase hex>
postgresImageReference: "postgres@sha256:<64 lowercase hex>"
prismaToolchainTreeSha256: <64 lowercase hex>
nodeVersion: "v24.13.0"
permittedAction: "A03_DISPOSABLE_DOCKER_POSTGRES16_PROOF"
```

No other key is accepted. In particular, the record must not contain a person
name or identity, signature claim, timestamp, path, hostname, customer data,
secret, token, transcript, connection string, or a broader action. The human
operations process remains responsible for authoritatively recording who
approved the one run; this verifier checks only the record's immutable input
binding.

On success stdout is canonical redacted approval provenance with only:

```text
schemaVersion, kind, status, candidate,
gate0CapsuleSha256, gate0AcceptanceMarkerSha256,
runtimeManifestSha256, dockerCliContentSha256,
postgresImageReference, prismaToolchainTreeSha256, nodeVersion,
approvalRecordSha256, permittedAction
```

The success status is `GATE1_HUMAN_APPROVAL_RECORD_BOUND`, deliberately not an
authentication or deployment claim. A separately authorized disposable proof
must still perform its own acknowledgement and all runtime safety gates.

## Tests

```powershell
node --test scripts/doorstar-pilot-gate1/test/*.test.mjs
```

These native Node tests use temporary files and injected Gate 0/runtime
verifiers. They do not invoke Git, candidate code, npm, Docker, Prisma,
PostgreSQL, an IdP, or a network service.
