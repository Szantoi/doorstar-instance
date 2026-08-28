# Doorstar pilot — owner-controlled release checklist

This is the release checklist for the isolated Doorstar named-user pilot. It
uses the accountable company owner's recorded GO rather than a separate
signing service or external verifier artifact. It is intentionally sized for
one small company; it is not a template for a multi-company or Plant-connected
release.

The checklist is an operations record, not a command. It does not permit
automatic deployment and it must never contain credentials, tokens, cookies,
raw OIDC subjects, customer records, or browser-derived authority.

## Fixed boundaries

Every checklist item is a NO-GO if it would cross one of these boundaries:

- use a fresh, dedicated pilot PostgreSQL database, database identities,
  Keycloak realm/client, service account, loopback listener, and nginx vhost;
  never reuse a legacy Doorstar Board/SpaceOS runtime, database, Keycloak
  realm, service, ingress, backup, or credential. The approved hostname may
  be bound only by that new pilot vhost; it does not authorise reuse of a
  historical vhost configuration;
- never use a JoineryTech Plant database, service, UI, role, token, station,
  or execution authority;
- expose the public application over HTTPS only. Plain HTTP is closed or is
  limited to a direct redirect to the equivalent HTTPS URL; the Node/BFF
  listener remains `127.0.0.1`-only; and
- keep authority server-side. No browser header, query value, cookie payload,
  token, role, scope, actor, station, or Plant value may create authority.

## Owner GO record

Before external activation, record these redacted fields in the
operations-owned release record:

| Field | Required record |
| --- | --- |
| Candidate | Clean commit identifier and build/check result summary |
| Owner GO | Accountable owner, date/time, and explicit GO or NO-GO |
| Operator | Authorised person who will carry out the release |
| Pilot resources | Redacted identifiers for the new database, IdP realm/client, service, and vhost |
| Backup and rollback | Backup reference, recovery owner, and stop/restore decision |
| Activation outcome | Service, ingress, identity/mail, and named-user smoke-check results |

A missing, failed, or materially changed entry is a NO-GO. The owner records a
new GO only after the changed item has been checked again.

## Checklist

### 1. Source candidate

- [ ] The candidate worktree is clean and its commit is recorded.
- [ ] `src/doorstar-pilot-foundation`, `src/doorstar-pilot-bff`, and
      `src/doorstar-pilot-bootstrap` pass their versioned `npm test`, build,
      and lint/source verification checks as applicable.
- [ ] The BFF web build contains the reviewed shell and `/login` route, and no
      source, package, or configuration points at a legacy Doorstar/SpaceOS or
      Plant component.

The Gate 0 capsule may be retained as extra candidate-identification evidence,
but it is not a required signing or external-approval mechanism for this
owner-GO pilot.

### 2. Dedicated pilot data and rollback

- [ ] A new, dedicated pilot PostgreSQL database and the separate migrator,
      runtime, and bootstrap identities are identified. No legacy Doorstar or
      Plant connection string, role, data, backup, or schema is reused.
- [ ] The reviewed pilot migrations, one approved pilot scope, and the exact
      database role mappings/grants are applied or ready for the recorded
      activation step.
- [ ] A backup reference exists before the first business write. The owner has
      recorded who can restore it and whether a failed first activation means
      disable-only, restore, or both.

### 3. Identity and mail smoke checks

- [ ] A dedicated confidential Keycloak authorization-code client is configured
      with the exact HTTPS callback required by
      [`OIDC-CLIENT-COMPATIBILITY.md`](OIDC-CLIENT-COMPATIBILITY.md). Its
      callback reaches `GET /auth/callback` with exactly one `code` and one
      `state`; an incompatible callback is a NO-GO, not an ingress rewrite.
- [ ] Server-side secrets are injected only into the dedicated service account.
      No secret is committed, copied into the release tree, or exposed to a
      browser.
- [ ] Brevo's configured sender and the Keycloak mail delivery path are smoke
      checked with a controlled named-user invitation or recovery message. The
      release record stores only the outcome, never email content or addresses.
- [ ] The first approved administrator is provisioned through the reviewed
      server-side/bootstrap path; there is no shared account, self-service
      registration, or browser-created first-admin authority.

### 4. Service and HTTPS ingress sanity

- [ ] The new systemd service starts only after its BFF/database preflight and
      listens only on the expected `127.0.0.1` port under the new least-
      privilege service account.
- [ ] The new nginx vhost passes its syntax check and proxies only to that
      loopback listener. It does not serve or proxy a historical Doorstar
      Board/SpaceOS endpoint or any Plant UI/service.
- [ ] The approved origin is `https://doorstar.joinerytech.hu`; the public
      sign-in surface is `https://doorstar.joinerytech.hu/login`. TLS
      certificate, host, redirect, cookie origin, and callback origin match
      the configured values.

### 5. Named-user acceptance and rollback decision

- [ ] The authorised operator verifies a named-user login, session read,
      logout, administrator invite, deactivation, and recovery flow without
      loading customer business data or Plant authority.
- [ ] The owner records either `GO` or `NO-GO`, including the rollback choice.
      On a failure, stop before the next step; disable the new pilot ingress or
      service as recorded, revoke/disable the new pilot identity if needed,
      and restore only from the dedicated pilot backup.

## Optional staging assurance

`src/doorstar-pilot-staging-proof` and historical A-03/Gate 1 material remain
optional additional assurance. They are not evidence that the current release
candidate passed a disposable proof, are not required for the owner-GO pilot,
and this checklist does not make their fail-closed Docker command executable.

## Scope change

Before a second company, Plant connection, broader user volume, or material
authority/data expansion, stop and create a new release decision. The owner-GO
exception does not silently extend to that scope.
