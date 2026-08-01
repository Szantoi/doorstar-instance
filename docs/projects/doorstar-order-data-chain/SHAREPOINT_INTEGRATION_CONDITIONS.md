# SharePoint metadata integration and folder simulation

## Decision

Doorstar can use the existing `Fájlok_Módositás_dátuma.xlsx` export immediately
as a **read-only SharePoint catalog simulation**. It must not pretend to be a
live SharePoint synchronisation. The simulation powers document discovery,
virtual folder browsing and project-link review; it never changes SharePoint,
does not copy a document binary, and cannot close a production milestone.

The live Microsoft Graph integration is a later, separately approved connector.
It becomes admissible only when every identity, security and operational gate
below is met.

## What works now: snapshot simulation

`simulateSharePointMetadataCatalog.py` consumes the macro-free metadata preview
and creates only repository JSON:

- exported folder nodes, including empty folders, plus missing derived ancestors;
- source-document nodes with modified-by/modified-at metadata;
- work-number package candidates;
- an explicit `PATH_SIMULATION_ONLY` identity; and
- `PROJECT_LINK_REVIEW` for filename/path work-number conflicts.

The snapshot has a SHA-256 source fingerprint and deterministic catalog-run key.
A path is still a presentation locator, not a stable external identity.
Rename, move, deletion and document-version events therefore cannot be
synchronised reliably from this snapshot alone.

## Current evidence and safety result

The latest snapshot reconciles all 9,297 source rows: 5,855 metadata documents,
2,974 exported folders, 14 missing derived ancestors and 468 excluded
`.bak/.dwl/.dwl2` records. It contains 2,988 virtual folders, 3,977 potentially
relevant PDF/DWG/XLSX/XLSM documents and 271 strong work-number package groups.

Raw five-digit detection yields 306 distinct selected number candidates, but
only 271 have strong DSMR-filename or canonical project-folder evidence and
become package candidates. Product/decor/hash-like numbers remain weak
document-level review evidence.

Explicit `DSMR` in a filename remains strong Sales-package evidence even if a
different work number occurs in the enclosing path. Such a document is still a
mandatory `CONFLICT` project-link review; the evidence does not auto-link it.
Path-only/canonical-folder evidence is suppressed on conflict. The preview and
catalog simulator share one pure mapping module and the simulator recomputes
relevance and package evidence from filename, extension and parent path instead
of trusting upstream labels.

There are 105 single filename/path conflicts plus 4 multi-number records in all
metadata. Together 109 rows need identity review, 76 among potentially relevant
document types. There are 1,512 single path-only work-number fallbacks in all
metadata, 515 among potentially relevant types. The remaining relevant split
is 3,261 single project-link candidates and 640 documents without a work-number
candidate. Consequently no catalog row automatically
creates, merges or attaches a Project. A new work number remains a proposed new
Project, pending the normal Sales package review.

`Módosítva` remains source document-version metadata. It is not order receipt,
survey finalisation, manufacturing completion, dispatch or installation time.

## Web-app storage and use

Keep the source catalog independent from `OrderDocument`. `OrderDocument` is a
reviewed order-revision reference; the catalog is a larger external index that
can contain unrelated, unlinked and conflicting files.

| Proposed record | Key fields | Use |
| --- | --- | --- |
| `SourceCatalog` | source system, tenant/site/drive/root scope, mode, enabled | one bounded external library |
| `SourceCatalogSyncRun` | catalog, type/status, captured-at, input hash, counts, error | audit one snapshot/sync run |
| `SourceCatalogCursor` | catalog, protected delta cursor, last successful run | atomic incremental checkpoint; never returned by API |
| `SourceCatalogFolder` | catalog, external folder ID, parent ID, relative path, display name, first/last seen, tombstone | persistent virtual document browser tree |
| `SourceCatalogDocument` | catalog, external item ID, parent, path, filename, extension, modified metadata, first/last seen, tombstone | persistent searchable source item |
| `SourceCatalogDocumentVersion` | document, version/eTag, observed run, source metadata, optional hash | immutable source observation |
| `SourceCatalogProjectLink` | catalog document, proposed work number/project, resolution state, reviewer/note | preserves a human-reviewed project association |
| `SourceCatalogLinkAudit` | link, actor, old/new state, decision and reason | append-only review history |

In the current simulation, external IDs and version/eTag remain `null` and the
catalog identity is explicitly path-derived. Only a reviewer may promote a
catalog document into a metadata-only `OrderDocument` reference. The stored
application reference always remains source-root + relative path + identity
metadata; no Windows path or business binary enters the database.

Live items are not owned by a sync run: a stable `(catalogId, itemId)` document
survives rename/move operations. Runs only provide first-seen/last-seen and
version provenance. Deletion becomes a tombstone; it never cascades into
approved order evidence.

Recommended UI:

1. **Source catalog** — searchable virtual folders with file type, modified-by,
   modified-at and work-number resolution badge.
2. **Project package review** — show exact candidates, path fallbacks and
   conflicts separately; require a reviewer before linking a document.
3. **Document version panel** — show version/eTag only after live integration;
   until then label the result `snapshot metadata, not version history`.
4. **Import Inbox** — only reviewed links can enter a project DRAFT. The source
   catalog itself has no Project-creation or database-apply button.

The UI keeps four independent state axes rather than overloading one status:

- lifecycle: `ACTIVE | TOMBSTONED`;
- identity: `PATH_SIMULATION_ONLY | STABLE_GRAPH_ITEM`;
- link review: `UNRESOLVED | CANDIDATE | REVIEW | RESOLVED | REJECTED`;
- version: `SNAPSHOT_ONLY | CURRENT | CHANGED_SINCE_REVIEW`.

## Gate A — data contract for a live connector

The connector must receive and persist, at minimum, for every file and folder:

- tenant/site identity: `siteId`;
- library identity: `driveId`;
- immutable item identity: `itemId`;
- parent item identity and name/path;
- `createdDateTime`, `lastModifiedDateTime`, `lastModifiedBy`;
- `eTag` and, where required, version identity/history;
- file/folder/deleted facets; and
- a stable web URL only when it is safe to expose it to an authorised user.

The first run must enumerate a chosen document library completely and save the
returned delta token. Later runs must process every `nextLink` page, atomically
persist the latest `deltaLink` only after successful processing, and retain
deletions as tombstones until the UI/reference review has resolved them.

## Gate B — least-privilege security

- Doorstar must have real Entra/OIDC authentication and server-side RBAC before
  any live catalog or sync-trigger API is exposed. The current optional
  `X-Role` header and its `vezeto` default are explicitly not authentication.
- Create a dedicated Entra application or managed identity for Doorstar.
- Grant read-only access to the selected production-document site/library only;
  do not use write scopes for discovery.
- Prefer a site-scoped grant such as `Sites.Selected` with an explicit read
  assignment. Do not grant tenant-wide write access for this workflow.
- Store credentials outside the repository, rotate them, log connector access
  and never expose raw access tokens in preview files or browser responses.
- The connector has no upload, move, rename, delete or permission-management
  endpoint. Doorstar remains a reader of SharePoint, not its editor.
- Validate returned pagination/delta URLs against both the Microsoft Graph
  origin and the configured drive; a different drive on the same host is not
  admissible.

## Gate C — link and version rules

1. `itemId` is the only stable identity for a live document. Path is display
   metadata and may change.
2. `driveId + itemId + eTag/versionId` forms a version observation. A changed
   eTag creates a new source snapshot; it never silently overwrites approved
   order evidence.
3. A filename work number and a path work number that disagree creates a
   `PROJECT_LINK_REVIEW` record. Filename precedence may propose a candidate,
   but cannot attach it automatically.
4. A path-only work number is a `PATH_FALLBACK` candidate, always reviewable.
5. Same content hash can identify copies but cannot choose a business revision.
6. `Módosítva` can sort document versions but cannot generate a deadline or
   completion event.

## Gate D — operating model

1. Start with the current snapshot simulation in a separate Source Catalog UI.
2. Review the 76 relevant-type conflict/multiple-number rows and sampled
   path-fallback records
   before enabling a live connector.
3. Run the first Graph sync against one approved library only.
4. Compare the Graph snapshot count and sampled document identities with the
   existing query export; record a reconciliation report.
5. Enable scheduled delta polling only after that reconciliation passes.
6. Keep all Project/DRAFT creation behind the existing human-reviewed,
   `doorstar_test`-only import route. A source sync must never apply an order.

The snapshot milestone stops only when a regenerated golden run reconciles
9,297 input rows, 5,855 documents, 2,988 folders and 271 strong package
candidates; contains no
absolute/traversal paths or duplicate path identities; and independently
reproduces the summary counts. The live milestone starts only after real
authentication, tenant-admin scope, persistent catalog/cursor/tombstone design
and an approved ADR. It is not part of the current implementation.

## Required authority before implementation

Live integration needs an authorised tenant administrator to provide the chosen
site/library scope and grant the read-only application access. It also needs a
business owner to decide which library paths are in scope and who can resolve
project-link conflicts. Until those decisions exist, the snapshot simulation is
the correct operating mode.

The current P0 blocker is therefore not file parsing but authority and identity:
the selected library, Entra application, read grant, authenticated application
roles and business reviewer must be named before connector implementation.

## References

- Microsoft Graph delta tracks hierarchy changes and provides a reusable delta
  link after the initial enumeration: https://learn.microsoft.com/en-us/graph/api/driveitem-delta?view=graph-rest-1.0
- `driveItem` exposes identifiers, creation/modification timestamps and eTag
  metadata: https://learn.microsoft.com/en-us/graph/api/resources/driveitem?view=graph-rest-1.0
- Microsoft Graph permission guidance requires least privilege; `Sites.Selected`
  restricts an application to explicitly configured site collections:
  https://learn.microsoft.com/en-us/graph/permissions-reference
