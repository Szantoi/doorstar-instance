# ADR-2026-08-28 — Doorstar pilot owner-GO release model

**Status:** Accepted for the isolated small-company pilot
**Date:** 2026-08-28

## Context

The isolated named-user pilot has source checks, a dedicated-resource design,
and a reviewed BFF, but its previous release path required a
candidate-independent verifier and an externally signed one-run approval
anchor. That control remains appropriate for a broad or high-consequence
release, but it is disproportionate to Doorstar's first, single-company
pilot.

Doorstar's owner has explicitly accepted a simpler release model. This changes
release governance only. It does not weaken the pilot's database, identity,
network, or Plant boundary.

## Decision

1. For this isolated Doorstar small-company pilot, the recorded GO of the
   accountable company owner is the release authority. It replaces the R-05
   requirement for an external verifier artifact or signing/audit-store
   approval anchor.
2. Before an authorised operator changes an external runtime, the owner must
   review and record the checklist in
   [`OPERATIONS-RELEASE-GATE.md`](../projects/doorstar-isolated-pilot/OPERATIONS-RELEASE-GATE.md).
   It covers a clean source candidate and source checks, a dedicated pilot
   backup, service and HTTPS-ingress sanity, Keycloak and Brevo smoke checks,
   and a rollback decision.
3. The release record names the candidate commit, redacted resource identifiers,
   owner GO, operator, time, check outcomes, backup reference, and rollback
   decision. It contains no credentials, tokens, cookies, raw OIDC subject,
   customer data, or browser-supplied authority.
4. The pilot remains physically isolated: it uses a new pilot database,
   database identities, Keycloak realm/client, service account, listener and
   nginx vhost. It must not reuse a historical Doorstar Board/SpaceOS runtime,
   database, Keycloak realm, service, ingress, or any JoineryTech Plant
   resource.
5. The public application is HTTPS-only at the approved origin. Plain HTTP is
   either closed or only redirects to the equivalent HTTPS URL. The BFF remains
   loopback-only behind that TLS ingress. A browser cookie, header, query value,
   token, role, scope, actor, station, or Plant value is never authority; the
   server and database continue to resolve Office authority.
6. The existing A-03/Gate 1 staging harness and its historical proof material
   are optional additional assurance. They are not a release prerequisite for
   this pilot, do not become executable by this decision, and must not be
   presented as a proof of the current release candidate.
7. A later multi-company, high-volume, Plant-connected, or materially expanded
   pilot requires a new release decision. It may restore independent verifier
   and approval-anchor controls; this small-company exception does not carry
   forward automatically.

## Consequences

- R-05 is complete as a documented owner-controlled policy decision; R-01
  remains pending until the actual dedicated resources are prepared, checked,
  and released.
- The owner can make a practical, reviewable pilot-release decision without
  building a separate signing service first.
- A failed checklist item, missing record, or boundary violation is a NO-GO.
  The operator must stop and use the recorded rollback decision rather than
  falling back to a legacy Doorstar or Plant resource.
- This ADR supersedes only the external-trust-anchor and mandatory-disposable-
  proof release preconditions for this isolated small-company pilot. The
  fail-closed staging source remains intact and its prior design decisions
  remain available for a future stronger gate.

## Verification

This is a policy/documentation change. Its verification is a source review that
the owner checklist names the required checks and preserves the dedicated
pilot, HTTPS-only, server-side-authority, and no-legacy/no-Plant boundaries.
No database, IdP, mail, VPS, ingress, Docker, or deployment action is implied
or performed by accepting this ADR.

## References

- [Owner-controlled release checklist](../projects/doorstar-isolated-pilot/OPERATIONS-RELEASE-GATE.md)
- [Pilot web deployment contract](../projects/doorstar-isolated-pilot/PILOT-WEB-DEPLOYMENT.md)
- [Prior external trust-anchor ADR](ADR-2026-08-28-doorstar-pilot-gate1-external-trust-anchor.md)
- [Pilot web composition ADR](ADR-2026-08-28-doorstar-pilot-web-composition.md)
