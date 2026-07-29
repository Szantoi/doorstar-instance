# Doorstar legacy extraction lessons

This document records evidence-based rules learned while reading the legacy
Doorstar Sales folders. It is the operating guide for repeatable discovery;
it does not authorise a production import.

## Non-negotiable processing boundary

- Read source folders only. Never alter, copy or delete their business files.
- Read XLSM as an OOXML/ZIP container only. Do not open Excel, execute VBA,
  evaluate formulas, run Power Query or refresh external links.
- Exclude `.bak`, `.dwl`, `.dwl2`, Office lock files (`~$*`) and cache files.
- Store only relative references and SHA-256 fingerprints in Doorstar. Do not
  place business-document binaries in this repository.
- A database writer is allowed only after a reviewed preview and only against
  the isolated `doorstar_test` schema. `public` is never an import target.

## Source authority and record lifecycle

1. Every new order/work number creates a new Project.
2. Sales documents provide a DRAFT starting point; the survey confirms the
   technical truth.
3. Sales/PDF and survey conflicts are feedback records, not silent overwrites.
4. A preview may create `SURVEY_PENDING` DRAFT data. It may not approve,
   release to production or infer missing measurements.

## Dimensions and units

- Preserve the source's original unit and locator first. Convert only with an
  explicit, logged conversion rule.
- Legacy `Készméret` sheets can declare `cm`; Doorstar production fields use
  mm. For example, `39 × 77.5 × 1.8 cm` is a review candidate for
  `390 × 775 × 18 mm`, not an unqualified automatic fact.
- A Sales PDF's `Falvastagság` is `openingDepthMm`; it is never
  `doorThicknessMm`.
- The required order is width × height × thickness. Missing third dimensions
  remain null and create `MISSING_SURVEY_MEASUREMENTS` feedback.

## Panels, fronts and door positions

- `OrderPosition` is door-specific. A wall panel or furniture front must not
  be forced into a door position merely to make it importable.
- Use `ManufacturedItem` as the incremental target for `WALL_PANEL` and
  `FURNITURE_FRONT`; retain its own item code, quantity, dimensions, material,
  finish, work kind and evidence. A later model can converge these into a
  common production-item aggregate.
- A wall-panel flag on a door only describes the relationship. A standalone
  panel, including rework, remains a separately searchable manufacturing item.
- Furniture fronts need separate front/back finish, edge-band and machining
  details. They have no opening-direction or wall-opening semantics.

## Workbook interpretation rules

- A `falpanel` or `bútorfront` keyword is normally template/schema evidence,
  not proof of a real manufactured item. The 2026 archive reuses these fields
  in many empty calculators.
- A review candidate needs a relevant item/készméret sheet and explicit cached
  width, height/length and quantity values. Parameter/variable sheets are not
  item rows.
- The same item occurs in the Gyártásmegrendelő, Kalkulátor and Kiíró. Treat
  the Sales/Gyártásmegrendelő table as the primary source and the others as
  consistency checks until a source-priority rule says otherwise.
- Formula cells may have no cached values. Empty cached measurement cells are
  data gaps, not zero and not permission to calculate a substitute.

## Concrete evidence patterns

| Case | Meaning | Safe action |
| --- | --- | --- |
| `DSMR-24170` front rows repeat in three workbooks | duplicate source views, not tripled production quantity | deduplicate by work number + item code + primary Sales table |
| `DSMR-24170` wall-panel codes lack cached sizes | panel structure exists, dimensions are absent | retain evidence; do not create dimensioned item |
| `DSMR-25171` drawing lists `FP/1`–`FP/35` with dimensions | drawing is valid panel evidence | create review-only panel candidates; survey confirms thickness/material/finish |
| `DSMR-26147` says panel-element remanufacture | standalone panel rework, not door work | create a `WALL_PANEL` review candidate with work kind `REMANUFACTURE` |
| `DSMR-26151` is explicitly preliminary | technical values are not final | quarantine; no import run |

## Reusable scripts

| Script | Purpose | Output / safety |
| --- | --- | --- |
| `previewLegacyOrderImport.py` | Inventory documents, workbooks, deadline rows and basic positions | JSON/CSV preview only; no database client |
| `scanLegacyManufacturedItems.py` | Discover panel/front evidence from cached XLSX/XLSM rows | JSON preview only; macro execution disabled; original source unit retained |

Run the scripts from `src/production-service` and write business-data previews
to a secure temporary or approved import-artifact location, never alongside
source binaries. Run their unit tests after changes.

## Next improvements

1. Define primary-source and deduplication keys per project/workbook family.
2. Map actual `Készméret` columns to typed panel/front fields, preserving units.
3. `ManufacturedItem`/evidence persistence and the Import Inbox are now
   implemented; loading remains review-only in `doorstar_test`.
4. Sources, field-level evidence and unresolved feedback are visible in the
   web app.
5. Deterministic preview-to-API payload generation is implemented. Every
   API-ready row carries its exact request body, explicit work kind and
   field-level evidence; incomplete identification or source location blocks
   the row.
6. The controlled uploader is implemented. It links only explicitly selected
   READY candidates to the same ImportRun's DRAFT in `doorstar_test`, checks
   the preview fingerprint and returns existing items on repeated requests.
7. The next step is a versioned bulk registration command that turns one
   approved preview artefact into an `ImportRun` plus queryable candidates
   without manual per-row API calls. It must be resumable and preserve the
   same fingerprint and quarantine rules.
