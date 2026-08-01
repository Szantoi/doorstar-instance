# Import Discovery állapot

**Állapot:** kontrollált Nexus RAG-csomag dry-run és review kész; adatfelderítés
aktív; minden élő betöltés és integráció emberi/P0 kapun

**Utolsó frissítés:** 2026-07-31

## Elkészült

- Forrásleltár, mapping, tárolási terv és kereshető tudásréteg-terv.
- Makrómentes order-preview és manufactured-item scanner, unit tesztekkel.
- 2026 archív teljes evidence-szintű átvizsgálása.
- Kontrollált `DSMR-26148` tesztsémás DRAFT-feltöltés, explicit
  `doorstar_test` védelemmel és visszaolvasási ellenőrzéssel.
- Elkészült a `docs/projects/doorstar-nexus-rag/` kontrollált tudáscsomag:
  45 tételes, közvetlenül nem indexelhető forrásleltár; 6 PII- és
  rendelésadat-mentes kanonikus dokumentum; verziózott manifest; 35 kérdéses
  eval-korpusz; determinisztikus offline validátor és review-jelentés.
- A zöld dry-run 6 dokumentumot, 98 claimet és 41 chunkot tervez, 0 hibával és
  0 figyelmeztetéssel. Nexus-, ChromaDB-, hálózati és adatbázisírás nem
  történt; a folyamat emberi jóváhagyásnál megállt.
- Jóváhagyási snapshot: 45/45 aktuális forráshash és bájtméret egyezik;
  package hash
  `34110af5a9ea4c129467034fa3d181cbba6c5601b908abd87be89d078fbae116`.
  A 12/12 validátor unit és a független hardlink/symlink-adverszáriális QA
  zöld, P0/P1 nincs. A locator szemantikai létezésének ellenőrzése emberi
  review marad.

## Következő lépések

1. A Nexus RAG review checklist üzleti tulajdonosi ellenőrzése és explicit
   jóváhagyási vagy elutasítási döntése; addig nincs ingest.
2. A snapshot `SourceCatalog` tesztsémás backend/API és read-only frontend
   munkáját a jóváhagyott ADR alapján taskokra bontani.
3. A 109 konfliktusos/többszörös munkaszám-rekord és a 640 releváns,
   azonosítatlan dokumentum emberi review-listáját elkészíteni.
4. Folytatni a PDF-first projektcsomag-egyeztetést, külön kezelve az ajtókat,
   falpaneleket, bútorfrontokat, kiegészítőket és műhelykomponenseket.
5. Élő Graph-próbát csak a `TODO.md` P0 kapuinak teljesülése után, egyetlen
   kijelölt, read-only könyvtárral indítani.

## Blokkok

- Felmérés nélkül nem zárható le vastagság, végleges felület, üvegezés vagy
  falkezelés.
- A `ManufacturedItem` modell/API elkészült. A preview-k API-kész payloadot és
  mezőszintű evidence-et adnak, de csak jóváhagyott emberi review után,
  DRAFT revízióhoz kötve hozhatók létre.
- A helyi fájlok `CreationTime`/`LastWriteTime` értéke csak szinkronizált
  másolat-metaadat. Hiteles SharePoint létrehozási, módosítási és
  verziótörténeti időkhöz a SharePoint-kapcsolat engedélyezése szükséges.
- A 2026-07-17-i és későbbi újraszinkronizálás miatt helyi fájlidő nem
  kerülhet határidő- vagy átfutásiidő-számításba.
- A SharePoint `Létrehozva` és verziótörténet adat jelenleg nem elérhető.
  A `Módosítva` csak dokumentum-változási evidence; átfutási KPI kizárólag
  explicit Ütemterv-/dokumentumesemény vagy új rendszerben rögzített tényleges
  esemény alapján jelenhet meg.
- Az új webappban a jövőbeli átfutásméréshez explicit eseményeket kell rögzíteni:
  Sales átvéve, felmérés véglegesítve, gyártásra kiadva, lépésenként elkészült,
  rész-/teljes kiszállítva és beépítés lezárva. Minden eseményhez időpont,
  rögzítő és opcionális dokumentumbizonyíték tartozzon.

## SharePoint query follow-up

- `IMPORT_PREVIEW_SHAREPOINT_DOCUMENT_METADATA.json` is generated and
  repeatable through `previewSharePointDocumentMetadata.py`.
- Request a follow-up `.iqy` export containing `Létrehozva` and preferably
  version history. Match it to the `Ütemterv` planned and actual delivery /
  installation milestones before exposing an end-to-end duration KPI.

## 25219 completed sample

- `IMPORT_PREVIEW_DSMR_25219_WALL_PANELS.json` contains 56 structured,
  review-only wall-panel records. No database write was made.
- Next priority is either the separate `DSMR-25159` Swiss Luxury package, or
  a third independent high-evidence package (`25118`, `25163` or `26137`),
  while keeping folder/file work-number conflicts visible for review.
- The `DSMR-25159` second-phase sample confirms that delivery must support
  `PARTIAL` scope. Next independent high-evidence project: `25118`, `25163`
  or `26137`.
- `DSMR-25118` is quarantined for panel/front import: inspect an authoritative
  drawing or corrected finished-size table before creating review candidates.
  Continue next with `25163` or `26137`, while separately retaining 25118
  door-position evidence.
- `DSMR-25163` now offers the strongest next controlled panel-import sample:
  24 API-ready wall-panel candidates, but requires a DRAFT revision and human
  review before database creation. Next discovery candidate: `26137`.

## Current discovery state — DSMR-26137 In_Tuition

- Completed read-only extraction of primary cached XLSM values.
- Preview queue: 18 wall panels + 1 furniture front, all API-shaped but `REVIEW`.
- Deadline source: no matching `Ütemterv.xlsx` row, so all schedule/delivery
  fields remain unknown rather than inferred.
- Document-reference candidate set: 16 SharePoint-export files; 1 local CAD
  `.bak` excluded. No database write performed.
- Next: select another source package with a primary finished-size sheet or
  prepare a specific human-reviewed `doorstar_test` DRAFT revision if test import
  is explicitly requested.

## DSMR-26145 Koroknai — completed source-quality check

- Evidence scan saved; no production-item preview produced. The apparent 40
  panels and 40 fronts are blank template slots, not importable quantities.
- Deadline facts are captured as planned dates only; collection/self-install note
  precludes inference of delivery completion.
- Next discovery should prefer a package with populated primary finished-size rows.

## DSMR-26135 Tormay — completed source-quality check

- Blank template lists quarantined: no panel/front import candidates created.
- Schedule conflict retained for review: expected 2026-07-15 versus scheduled
  2026-08-04. No actual completion inferred.
- Next: scan a populated primary finished-size package; do not promote Kiíró
  template copies to quantity evidence.

## PDF-first source state

- `GYÁRTÁSMEGRENDELÉS` PDF is mandatory first source per project package.
- 26135 Sales PDF preview: 5 door candidates + 2 supplementary candidates.
- 26145 Sales PDF preview: 1 supplementary candidate (12 fm skirting), zero doors.
- Webapp gap: add reviewed `OrderSupplementaryItem` for hardware, skirting, trim
  and similar sales-ordered items; do not misuse ManufacturedItem.
## Sales-PDF batch baseline — 2026-07-30

- Completed: 111 authoritative Sales-PDF previews in
  `IMPORT_PREVIEW_SALES_PDF_BATCH.json`.
- Indexed: 604 door positions, 244 supplementary products, 37 same-content
  duplicate groups, 0 extraction failures.
- Review queue: three canonical work-number variant groups (25163, 26119, 26125).
  They need a decision whether they are a revision, replacement/rework or a
  distinct new Project; no automatic merge applies.
- Next high-value operation: generate field-level Sales-PDF versus survey/XLSM
  conflict records for the high-position and variant groups, then prepare only
  human-approved `doorstar_test` DRAFT imports.
- Procedure documented in `IMPORT_PROCESS.md`; follow it for every newly scanned
  project package and record the outcome in the shared handoff.

## Current verification state — 2026-07-30

- Sales-PDF batch validator: passed with 0 blocking errors and 286 explicit
  review warnings. Do not invent quantities for the 104 incomplete Sales
  position rows or 50 incomplete supplementary-product rows.
- CAD source index is complete for the required Sales and 2026 roots. Next CAD
  step needs an approved read-only DWG-to-DXF converter/parser plus technical
  review; until then all 83 drawings remain document references only.
- Backend verification is green: build, OpenAPI (3.1 / 65 operations / complete
  coverage) and 86 tests. The test runner used only a run-scoped
  `doorstar_test_vitest_*` schema; no legacy source or production/public data
  was written.
- DXF text evidence preview is complete for the 10 available DXFs. Next step is
  targeted technical review of high-value CAD evidence (not bulk import), then
  an approved temporary DWG-to-DXF path if the remaining DWGs are needed.
- Approved CAD safety boundary: conversion input is read-only; temporary output
  is outside source roots/repository; source hash is verified before and after.
- Data-recording method test: 26135 Sales PDF converts to a Zod-valid mutable
  DRAFT payload but remains review-blocked. Revision selection gate rejects
  25129 until a human explicitly chooses one Sales-PDF content hash.
- Evidence-recording method: 26135's 50 field evidence records are API-valid
  and ready to be persisted only as `REVIEW` after a controlled DRAFT write.
- Regression check passed: 25 backend test files / 88 tests in the isolated
  run-scoped schema. No business preview was applied to `doorstar_test`.
- Discovery improvement verified: 26109 shifted-table layout is mapped safely;
  26135 regression remains correct. Full Sales preview was rebuilt and passes
  validation (0 errors, 256 review warnings). Do not auto-link 25167 or 26111
  until their header/document identity conflicts receive human review.
- Frontend handoff written: review-first Import Inbox, project package evidence
  view, version picker, deadline timeline, standalone panel/front and
  supplementary-product lanes, CAD evidence and admin-only test DRAFT guard.

## Parser quality checkpoint — 2026-07-30

- DSMR-25164 visual source check repaired a glyph-split width: `7 1` in raw
  PDF-table evidence is `71 cm`, therefore `710 mm`; the two source positions
  are now 710x2100x125 and 760x2100x120 mm.
- Parser accepts that repair only for all-digit whitespace-separated cells.
  Validator/readiness now retain raw evidence and flag dimensions outside
  width 300–5000, height 1200–5000, depth 30–2000 mm for human review.
- Full rebuilt preview: 111 PDFs / 604 positions / 244 supplementary items / 0
  hard validation errors / 288 review warnings. No database write.

## 25164 deadline checkpoint — 2026-07-30

- `Ütemterv.xlsx` ADAT!151 maps to raw work number 25164 (never format that
  identifier as the Excel serial date 1968-11-22). Source facts: contractual
  2025-12-01, scheduled 2025-12-08, Sales-order-posted 2025-12-12 and note
  "december first half".
- Store them as separate REVIEW `OrderDeadlineObservation` candidates. No
  delivery, installation or actual-completion event exists in this source.
- `inspectDeadlineWorkNumber.py` and three unit checks are reusable and green.

## 26107 source package checkpoint — 2026-07-30

- PDF visual/source mapping: three doors 750x2080x160, 860x2100x130 and
  860x2100x160 mm; API DRAFT/evidence contract is valid but still review-only.
- Header date 2026-02-28 conflicts with footer and schedule Sales-posted date
  2026-03-02. Preserve both source facts.
- Exact schedule row is ADAT!147: contractual 2026-04-30, scheduled
  2026-05-04, fixed-date note. Two customer-name-only matches belong to 24158
  and are marked TEXT_FALLBACK, never project links.

## 26107 survey and manufactured-item checkpoint — 2026-07-30

- The visual survey's handwritten final dimensions exactly reconcile with the
  Sales PDF's three normalized opening dimensions. This is high-confidence
  field agreement, retained as review evidence until the normal approval flow.
- Four macro containers were read cache-only. 437 panel/front keyword rows are
  unstructured templates, therefore zero manufactured-item candidates.
- Scanner now requires labelled width, height and quantity in one row; this
  prevents template quantities from polluting import candidates.

## 26107 production-sheet checkpoint — 2026-07-30

- The visual Gyártóilap corroborates all three FNY opening measurements and
  explicitly exposes reviewable door-leaf sizes: 683x2038, 777x2050 and
  777x2050 mm.
- BKM and TOK component dimensions are source evidence but a schema gap:
  propose a separate position manufacturing-specification record rather than
  mixing them into opening or door-leaf fields.

## 26107 installation evidence checkpoint — 2026-07-30

- The hand-over PDF is an unsigned/unfilled template: no item quantities,
  recipient, site, completion date or acknowledgement. Checklist labels do not
  prove delivery/installation; record no actual event and keep state UNKNOWN.

## SharePoint metadata simulation checkpoint — 2026-07-30

- The read-only `Fájlok_Módositás_dátuma.xlsx` query export produced a safe
  metadata catalog (5,855 documents; 2,974 exported folders plus 14 derived
  ancestors = 2,988 folders; 3,977 relevant-type candidates; 271 strong
  project-package candidates). The runtime never connects to SharePoint, opens macros or
  writes a database.
- `simulateSharePointMetadataCatalog.py` models relative `sites/...` paths as
  virtual folders/documents/project packages. There are 105 single
  filename/path conflicts plus 4 multiple-number rows (109 review rows, 76
  among relevant types); there are 1,512 single path-only records, 515 among
  relevant types. These are review candidates, not automatically trusted links.
- Real sync gate: receive selected-library, read-only Graph access with stable
  site/drive/item/version metadata, then review project linking before any
  approved `OrderDocument` import. Do not turn raw source catalog rows into
  reviewed order-document revisions directly.
- Golden snapshot fingerprint:
  `cc4c13d962a29dbcdc27651dd2b7ef0512e5a1489e3e32852055f900a6fea30f`;
  source snapshot key: `spsnapshot_43e46abbdf1872e530dc`; deterministic
  transformation fingerprint:
  `dbd6e5b6026cbffb5558984a80dd0081156fab44ea1624fe7e5b0dbc54068076`;
  run key: `spcatalog_974bb607bd9c693017d1`. All 9,297 input rows reconcile;
  reusable validation returns zero errors and no silent row cap is active.
- QUALITY.md audit decision is recorded in
  `ADR-2026-07-30-sharepoint-readonly-source-catalog.md`. Live connector work
  is stopped at the architecture gate until Entra/OIDC auth, selected-library
  read grant, persistent cursor/tombstone model and named reviewer exist.

## DSORD-03 checkpoint (2026-07-30)

- Completed catalog-backed technical survey fields: door type, finish, glass,
  hardware, wall solution, material, machining and technical note. The source
  is backend versioned configuration, not frontend constants.
- Added a test-schema-only `OrderPosition` migration and the read-only
  `/api/production/technical-catalog` contract. Catalog validation applies to
  every position writer and preserves old free-text imports when no key is
  selected.
- Current regression proof: production-service build, OpenAPI 66-operation
  coverage, frontend build and Docker-backed Vitest 26 files / 91 tests are
  green. No generated Vitest schema remains after completion.

## SharePoint semantic-contract verification — 2026-07-30

- Shared pure mapping: `sharePointMetadataRules.py`; preview and simulator no
  longer maintain separate relevance/work-number/package rules.
- Simulator recomputes every semantic label from filename, extension and
  parent path. Forged JPG relevance, `FILENAME_DSMR` and `PROJECT_FOLDER`
  evidence are rejected by adversarial tests.
- Policy: explicit DSMR filename may retain strong Sales-package evidence in a
  filename/path conflict, but it remains mandatory project-link review.
  Folder-only package evidence is suppressed on conflict.
- Golden output remains byte-exact: run
  `spcatalog_974bb607bd9c693017d1`, validation error count 0.
- Current gates: backend build PASS; OpenAPI 78/78 operations; full backend
  Vitest 32 files / 98 tests PASS. Test DB was isolated
  `doorstar_test_vitest_*`; no business import, public/production write,
  SharePoint write or deploy occurred.

## Frontend component-workspace source contract — 2026-07-30

- Received and incorporated
  `inbox/2026-07-30_007_frontend-component-workspace-source-contract.md`.
  The exact-revision calculator route is
  `/orders/:projectKey/revisions/:revision/calculator`.
- Component source links are lineage only. Import does not copy quantity,
  door/opening dimensions, material, finish or formula output into component
  rows, and it never creates component rows from filenames or work numbers.
- `SIDE_A/SIDE_B` is the stable physical axis. `FIXED/ADJUSTABLE` is a
  profile-specific casing role; it does not identify physical side, handing or
  hinge/strike jamb.
- Future RAG/profile-drawing output stays read-only candidate evidence with
  exact document version/path, locator, raw/normalized value, component key,
  rule version, profile fingerprint and review resolution.
- Manufactured source-evidence P0 CLOSED. The backend provides a one-way,
  role-protected evidence-review endpoint, requires at least one completely
  audited `RESOLVED` row before parent `VERIFIED`, and independently rechecks
  the evidence set before component-snapshot materialization. Direct fake
  `VERIFIED` source is blocked. Targeted backend verification: 10/10 PASS in an
  isolated `doorstar_test_vitest_*` schema.
- Frontend source-evidence adoption is complete: every row shows immutable
  raw/normalized value and locator, accepts one explicit decision, and requires
  state + resolution + reviewer + timestamp for usability. Targeted frontend
  verification: 6 files / 19 tests PASS.
- The final Calculator gate derives readiness from the revision's complete
  manufactured/supplementary parent collections, not from selected component
  rows or the outgoing payload. Omitting an unresolved source item therefore
  cannot bypass the gate. Independent full frontend verification: 22 files /
  68 tests PASS; lint and build PASS. Separate adversarial QA found no P0/P1
  logic gap (5 relevant files / 19 tests PASS).
- P2 page-level coverage CLOSED. `ComponentWorkspacePage.unit.test.tsx`
  renders the real calculator route with a mutation spy and proves that an
  otherwise-ready revision with one VERIFIED manufactured parent carrying open
  REVIEW evidence shows the 0/1 gate and audit link, omits the editor/create
  button from the DOM, and invokes create zero times. Independent full
  frontend verification: 23 files / 69 tests PASS; lint and build PASS.
  Separate read-only targeted QA: 1 file / 1 test PASS; no P0-P2 functional
  gap remains.
- P3 test robustness CLOSED. `componentWorkspaceRoute.ts` is the single route
  pattern/path-builder source consumed by App, OrderDetailPage,
  ProjectProcessOverview and the page regression. No duplicate calculator
  route literal remains outside that helper. The named blocker region must
  contain exactly one list item with the evidence-audit error, proving every
  other fixture gate is ready. Full frontend verification remains 23 files /
  69 tests PASS; lint and build PASS. Separate read-only targeted QA: 1 file /
  1 test PASS, with no duplicate route literal outside the helper. No P0-P3
  gap remains.
- Import/RAG authority remains restricted: it may create source lineage and an
  open evidence candidate, but never final review state, resolution,
  reviewer identity or review timestamp.
