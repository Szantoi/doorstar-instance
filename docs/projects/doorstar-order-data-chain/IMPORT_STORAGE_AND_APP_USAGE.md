# Legacy import storage and web-app usage plan

Status: incremental implementation in progress. `ImportCandidate`,
`OrderDeadlineObservation`, `OrderPositionEvidence`, `ManufacturedItem` and
`ManufacturedItemEvidence` are implemented; the remaining detailed
specification models below are still proposals. This document does not
authorise a production database write, approval, scheduling or work-package
release.

## Decision

Treat a legacy import as **evidence-led draft creation**, not as data
migration. The application may create a new `Project` and an `OrderRevision`
in `DRAFT` / `SALES_DRAFT`, but each imported value remains traceable to a
file, page or workbook row until the survey finalises it.

The existing aggregate already provides the safe write boundary:

```mermaid
flowchart LR
  A["Read-only legacy sources"] --> B["Deterministic preview"]
  B --> C["ImportRun: PREVIEWED"]
  C --> D["Test-schema DRAFT revision"]
  D --> E["Sales documents received"]
  E --> F["Survey verification"]
  F --> G["Technical preparation / Review / Approval"]
  G --> H["Calculator and production planning"]
```

`ImportRun` is already implemented as a provenance envelope and
`POST /api/production/import-runs/:importRunId/apply-draft` is explicitly
restricted to `doorstar_test`. It creates only a fresh Project, a DRAFT
revision, positions and metadata-only document references. It must stay that
way until a separate production-import approval is made.

## What can be stored now

| Data family | Existing storage | Import rule | Web-app use |
| --- | --- | --- | --- |
| Work number, project label | `Project.key`, `num`, `name` | Create a **new** Project only when the work number is unique | Order register and project navigation |
| Customer and contact facts | `OrderRevision` header fields | Copy only a matching current Sales value; a conflicting `Ütemterv` row is review-only | Sales header and contact panel |
| Contractual delivery | `OrderRevision.expectedDelivery` | Set only after a reviewed, authoritative date decision | Order register, deadline badge and later planning input |
| Start/install note | `plannedStart`, `notes`, existing `Project.beepites` | Keep as note unless it has an agreed typed meaning | Sales/survey context, never a production-task due date |
| Basic position identity | `OrderPosition.code`, `name`, `quantity` | Safe DRAFT prefill from a Sales PDF or stable `AlapAdat` row | Position list, survey work queue |
| Opening dimensions | `openingWidthMm`, `openingHeightMm`, `openingDepthMm` | Store available **opening** width/height/wall depth as preliminary values | Survey dimension comparison |
| Door dimensions | `doorWidthMm`, `doorHeightMm`, `doorThicknessMm` | Store only when the source actually labels a door/leaf dimension | Product and calculator input after survey |
| Type and opening direction | `productType`, `openingDirection` | DRAFT candidate only | Survey prefill and route hints |
| Wall treatment and glazing | `wallTreatment`, `glazing`, `glazingSpecification` | Leave null unless survey-verified | Mandatory survey checklist and approval gate |
| Sales PDFs, drawings, XLSM/XLSX | `OrderDocument` | `LEGACY_FOLDER`, relative path, kind and SHA-256 only | Document gate and source navigation |
| Preview provenance | `ImportRun`, `OrderRevision.importRunId` | Immutable preview fingerprint and one-time test import | Audit badge and import history |

## Important semantic boundary: opening versus door thickness

The Sales PDF column **Falnyílás méret** is an opening measurement. Its third
value, `Falvastagság`, maps to `openingDepthMm`; it must never be copied to
`doorThicknessMm`. The latter is the actual door-leaf thickness. A source
that only supplies e.g. `840 × 2150 × —` therefore yields an incomplete DRAFT,
not an assumed door thickness.

The present Survey page shows opening width, opening height and door thickness
in one compact group. Before legacy imports become a normal UI feature, split
that into two labelled groups:

1. **Falnyílás:** width × height × wall depth (`opening*Mm`)
2. **Ajtólap / termék:** width × height × leaf thickness (`door*Mm`)

This prevents one of the most costly import errors: treating a wall thickness
as a door construction dimension.

## Information that needs a small new evidence model

The current schema stores the selected value, but not a row-by-row explanation
of why it was selected. Add these models before making import management a
normal product feature.

| Proposed model | Essential fields | Why it is needed |
| --- | --- | --- |
| `ImportCandidate` | `importRunId`, record type, work number, source root/relative path, sheet/page/row, normalised payload JSON, errors, status (`READY`, `REVIEW`, `BLOCKED`, `APPLIED`, `SKIPPED`) | Keeps the preview's individual records queryable; a JSON file path alone is insufficient for a web queue |
| `OrderDeadlineObservation` | optional revision, work number, source locator, kind (`CONTRACTUAL`, `PLANNED_INSTALL`, `PRODUCTION_END`, `NOTE`), raw value, normalised date, confidence, resolution | Retains all `Ütemterv` views and makes conflicting dates visible without overwriting `expectedDelivery` |
| `OrderPositionEvidence` | revision/position, optional document, source locator, field name, raw value, normalised value, confidence, resolution | Shows whether a dimension/type came from a Sales PDF, XLSM or survey and supports field-level review |
| `PositionFaceAppearance` | position, stable physical side (`SIDE_A`, `SIDE_B`), finish type, colour/code, pattern, notes, source evidence | Prevents the existing one-string `surface` field from losing two physically distinct leaf faces without confusing them with casing roles |
| `PositionCasingSpecification` | position, physical side, presence (`UNRESOLVED`, `NOT_APPLICABLE`, `PRESENT`), optional role (`FIXED`, `ADJUSTABLE`, `OTHER`, `UNRESOLVED`), appearance and profile reference | Keeps casing presence, physical side and profile-specific casing role on separate axes; `FIXED/ADJUSTABLE` never identifies `SIDE_A/SIDE_B` |
| `ManufacturedItem` | revision, kind (`WALL_PANEL`, `FURNITURE_FRONT` initially), optional related door position, code/name, quantity, width/height/thickness, material, finish, work kind, state | Gives panels and fronts their own schedulable/searchable identity without misusing `OrderPosition` |
| `ManufacturedItemEvidence` | item, optional document, source locator, field, raw/normalised value, confidence, resolution | Keeps panel/front dimensions, material and drawing/survey provenance independently reviewable |
| `FurnitureFrontFinish` / `FurnitureFrontEdge` / `FurnitureFrontMachining` | front item, face/edge/machining side, material or operation, colour/code/pattern/geometry | Retains the detail required by cutting, machining and surface treatment |

`OrderPosition` remains the current door-specific model. The incremental
implementation should add `ManufacturedItem` for wall panels and furniture
fronts rather than attempting an unsafe immediate migration of existing door
records. A later domain convergence may introduce a common `ProductionItem`
supertype with door, wall-panel and furniture-front specifications.

The first three may use PostgreSQL `Json` for the raw/normalised payload, but
their status, source locator, timestamp and relation keys must be typed and
indexed. `OrderDocument` remains the canonical document metadata row; the
evidence models reference it when the source is a registered document.

### Position-evidence lifecycle

`OrderPositionEvidence` is append-only source context while a revision is a
mutable DRAFT. Its typed `field` identifies the exact order-position property;
`rawValue` preserves what the document or survey said and `normalizedValue`
stores the machine-readable candidate. Resolving or rejecting evidence changes
only its review metadata—it never changes the position value automatically.

Survey updates must preserve the existing position IDs. Replacing every
position row on save would cascade-delete its evidence and therefore break the
audit chain. A position is deleted, with its evidence, only when it is
explicitly absent from the submitted DRAFT.

### Manufactured-item lifecycle

`ManufacturedItem` is a revision-owned aggregate for `WALL_PANEL` and
`FURNITURE_FRONT`. It may optionally reference the related door position, but
it never inherits opening direction or wall-opening dimensions. A candidate
stores width × height × thickness, material and finish facts in its own
namespace.

Every item starts as `CANDIDATE` or `REVIEW` and requires at least one
`ManufacturedItemEvidence` record. Technical preparation can make the exact
snapshot `VERIFIED` or `REJECTED` with a written resolution. Final states are
immutable. An order revision cannot enter review while it contains unresolved
manufactured items; verified and rejected rows are both retained in the
approval snapshot, while only verified rows may later feed production.

## Source priority and review policy

| Field | Prefill source | Final authority | On conflict |
| --- | --- | --- | --- |
| Work number/project identity | Sales folder + signed/current order | Sales/manager | Block import candidate |
| Customer and delivery date | Matching current Sales order and `Ütemterv` | Sales/manager | Create deadline observations; do not replace header |
| Position count/name/type/direction | Current Sales order or canonical Kalkulátor | Survey | Create DRAFT candidate |
| Opening dimensions | Sales order / field sheet | Survey | Prefill, mark unverified |
| Door thickness, faces, wall treatment, glass | Survey | Survey | Leave null or `REVIEW`; approval is blocked |
| Planning/load fields | Approved calculation and production process | Planning service | Do not import from legacy schedule sheets |

For example, the observed `26147` and `26148` date conflicts become
`OrderDeadlineObservation` rows with `REVIEW` status. The order header keeps
no automatic date until Sales resolves them. The mismatched Aelan/26148 row is
an `ImportCandidate` with `BLOCKED` status, not a customer overwrite.

## Web-app workflow

### 1. Import inbox — implemented office route

`/imports` lists `ImportRun`s and their candidate/deadline counts. Every run
opens a `/imports/:importRunId` evidence page showing:

- source fingerprint and profile version;
- candidate positions with their raw source locator;
- normalised payload summaries and validation errors;
- linked manufactured items when a candidate has already been applied; and
- deadline observations with raw and normalised values side by side.

The evidence itself remains read-only. For a connected test-schema DRAFT the
page exposes one narrow write action: a technical reviewer may select READY
`ManufacturedItemImportPreview` rows one by one, type `BETÖLTÖM`, and apply
them idempotently. The client must return the exact preview fingerprint and
candidate IDs. There is no production target, approval action, automatic
selection or bulk “accept all” control. The existing test-schema-only
`apply-draft` endpoint remains the separate project/DRAFT creation operation.

### 2. Existing order detail — enrich, do not duplicate

The current `/orders/:projectKey` page already presents intake stage,
documents, revisions and position summaries. Add three compact panels rather
than a second order screen:

- **Import provenance:** run id, profile version, fingerprint and creation
  time;
- **Deadline review:** contractual/installation observations with a selected
  value and unresolved conflict badge; and
- **Source evidence:** per-position links such as `Sales PDF p. 1` or
  `Kalkulátor / AlapAdat / row 12`.

### 3. Survey — verification-first editing

Keep the current survey gate. Imported values appear as editable, labelled
prefills with source and confidence. The surveyor confirms/replaces the
opening dimensions, door dimensions, type, direction, fixed/moving finishes,
wall treatment and glazing. Unconfirmed required fields keep the revision in
`SURVEY_PENDING`; they must never be silently defaulted.

### 4. Downstream use after approval

Only the approved revision snapshot may feed the calculator/component
generator, operation candidates and the existing planning preflight. The
legacy `Folyamatok` or deadline workbook remains supporting evidence; it does
not create board tasks, capacity reservations or delivery-ready state.

The exact-revision calculator workspace adds a stricter boundary: an
`ORDER_POSITION`; a verified `MANUFACTURED_ITEM` with at least one, entirely
`RESOLVED` evidence set; or a verified `SUPPLEMENTARY_ITEM` may be referenced
as lineage. A `SOURCE_REVIEW` supplementary item additionally requires at
least one, entirely `RESOLVED` evidence set. None of their quantity,
door/opening dimensions, material, finish or legacy formula result is copied
into a component requirement. Every new component row starts with empty
business fields. Only explicit reviewed adapter output can materialize an
immutable `ComponentSnapshot`.

Future RAG or profile-drawing proposals must retain the exact document version
and relative path, page/sheet/row/drawing locator, raw and normalized values,
candidate component key, calculator/BOM rule key and version, product-profile
fingerprint, human review state and resolution. Physical `SIDE_A/SIDE_B` and
profile-specific `FIXED/ADJUSTABLE` casing roles remain separate fields.
Import/RAG may persist only an open evidence state with empty reviewer/time
audit; final state, resolution, reviewer and timestamp are written solely by
the authorized backend review endpoint.

## Delivery sequence

1. Use the existing test-only `ImportRun` route for one reviewed sample.
2. Implement `ImportCandidate` and `OrderDeadlineObservation`; expose the
   import inbox and deadline review card.
3. Split opening and door dimensions in Survey UI; add position evidence.
4. Model fixed/moving finish details before importing them beyond a free-text
   DRAFT note.
5. Measure the first test-schema run, then seek explicit approval for any
   production-import design. No production writer is in this scope.
