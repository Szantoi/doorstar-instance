# Import Discovery memória

## Tartós döntések

- A rendszer digitalizálás alatt áll; a legacy Excel/PDF/DWG a forrás, nem
  létező éles adatbázist kell migrálni.
- Sales dokumentumcsomagot ad; a felmérés a végleges műszaki adat forrása.
- Falpanel és bútorfront önálló gyártási tétel, nem ajtópozíció-attribútum.
- Mértékegységet nem szabad feltételezni. A 24170-es készméretlap cm-es.
- A Kalkulátor, Kiíró és Gyártásmegrendelő ugyanazt a tételt ismételheti;
  elsődleges forrás a Gyártásmegrendelő, a többi ellenőrző nézet.

## Jelenlegi bizonyítékok

- `DSMR-24181` és `DSMR-26148` tesztsémás DRAFT-ként szerepelnek;
  `DSMR-26148` `SURVEY_PENDING`, két pozícióval és négy nyitott feedbackdel.
- `DSMR-26147`: önálló falpanel-újragyártási jelölt, méret felmérésre vár.
- `DSMR-25171`: 35 rajzi falpanel-jelölt (`FP/1`–`FP/35`) és front-jelölések;
  előzetes mérés, karanténos review.
- `DSMR-24170`: 57 elsődleges bútorfront-sor a Sales készméretlapján;
  ugyanazok ismétlődnek a Kalkulátorban/Kiíróban. A falpanel-kódok jelenleg
  méretérték nélküliek.
- `DSMR-24170`: a 57 sorhoz elkészült a mezőcímkés, relatív forráshivatkozást
  és fájlhash-t megőrző review-preview. A `cm->mm` konverzió naplózott;
  például 39 × 77,5 × 1,8 cm = 390 × 775 × 18 mm. A rekordok nem
  közvetlen importjelöltek: a `ManufacturedItem` célmodell/API elkészült,
  de a DRAFT revízióhoz kötött emberi review továbbra is kötelező.
- A 2026-os archívban a panel/front kulcsszó gyakran sablonmező: a tételhez
  explicit készméret + mennyiség vagy konkrét rajzi bizonyíték kell.

## Utolsó nagy futás

- 2026 archív: 223 munkafüzet, 13 324 schema evidence, 4 944 review-jelölt,
  215 ignorált VBA-konténer. Ez nem gyártási darabszám és deduplikációt kér.

## Nyitott irány

1. Deduplikációs kulcs: project/work number + primary source + item code.
2. Készméret oszlopok típussá alakítása, egységmegőrzéssel.
3. `ManufacturedItem` + evidence perzisztencia és Import Inbox a webappban.
4. Dokumentum-evidence mezők: SharePoint `createdAt`, `modifiedAt`, szerző,
   verzió és relatív webhivatkozás; ezekből számítható az átvételtől a
   tervezett/tényleges kiszállításig eltelt idő.

## Időbélyeg-biztonság

- A helyi Doorstar dokumentummappa 2026-07-17-én és később újra szinkronizálva
  lett. Emiatt a helyi Windows `CreationTime` és `LastWriteTime` nem
  használható megrendelési, gyártási vagy kiszállítási üzleti időpontként.
- Ezt a metaadatot legfeljebb technikai leltárhoz lehet megtartani,
  határidőszámításhoz nem. Az idővonal hiteles alapja csak a SharePoint
  szerveroldali metaadata, az `Ütemterv`, illetve a dokumentumokban szereplő
  kifejezett dátum lehet.

## SharePoint query evidence

- The SharePoint `.iqy` export is now an approved metadata source: 5,855
  document records after excluding 2,974 folders and 468 technical lock/
  backup records. It supplies only `lastModifiedAt` and `lastModifiedBy`.
- `DSMR-24170` has a planned 52-day interval from the 2026-07-06 production
  release to the 2026-08-27 scheduled date. Do not infer a delivery duration
  from its 2024-12-01 legacy commitment because the deadline note documents a
  customer-driven deferral.
- A `Létrehozva` és verziótörténet adat jelenleg nem lesz elérhető. Ez nem
  akadályozza a digitalizálást: a SharePoint `Módosítva` kizárólag dokumentum-
  változási evidence, a rendelési és szállítási eseményt csak explicit
  Ütemterv-/dokumentumadatból vagy későbbi alkalmazásbeli rögzítésből képezzük.
- A hiány nem hozzáférési, hanem történeti adatminőségi korlát: a cég a
  tényleges rendelés-, gyártás- és kiszállítási eseményeket korábban nem
  dokumentálta következetesen. Hiányzó tényleges eseményt nem rekonstruálunk
  fájldátumból vagy következtetéssel; `UNKNOWN`/üres marad.

## DSMR-25219 lesson

- `DSMR-25219` is the first strong structured wall-panel import sample: 56
  primary `FP_1`–`FP_56` records from a `Készméret - Falpanel` source sheet.
  Each can preserve panel code, mm-converted dimensions, quantity, material,
  surface, colour and drawing-pattern flag as review-only ManufacturedItems.
- Do not use enclosing folder name alone for identity. The 25219 folder
  contains explicit `25159` files, which represent a separate new Project.
  Source filename work number has precedence over folder work number.
- `DSMR-25159` is a distinct Swiss Luxury second-phase Project candidate, not
  a 25219 revision. It has 11 structured wall-panel candidates and a partial
  furniture-front delivery note (2026-05-20); the entire phase remains
  separate from that partial delivery.
- `DSMR-25118` Propellant: primary panel/front finished-size sheets contain
  material/type structure but blank measurement and quantity values. Kiíró
  occurrences are repeated views, so no automatic ManufacturedItem candidate
  may be created from them. Door-position evidence remains available from
  `Alap adatok`; panels/fronts stay review-only pending a dimension source.
- `DSMR-25163`: 24 API-ready wall-panel review records from a populated
  primary finished-size sheet. The deadline note proves a residual-work state:
  only a curved panel remained while other items were already installed.
  Keep this as partial completion, never as total project delivery.

## DSMR-26137 In_Tuition (2026-07-29)

- Primary source `26137 - In_Tuition Kft - Gyartasmegrendelő.xlsm` was parsed
  from cached OOXML only: macro execution remains disabled.
- Separate finished-size source groups: 18 wall panels and one furniture front.
  `IMPORT_PREVIEW_DSMR_26137_WALL_PANELS.json` and
  `IMPORT_PREVIEW_DSMR_26137_FURNITURE_FRONTS.json` contain 18 + 1 API-ready
  `REVIEW` candidates respectively. All require a human-reviewed DRAFT revision
  before any test-schema API write.
- `Ütemterv.xlsx` contains neither a 26137 row nor an In_Tuition name match.
  Do not synthesize deadline, delivery or installation events.
- SharePoint metadata has 16 potential `.pdf`/`.dwg`/`.xlsm` documents, latest
  document change 2026-07-27 10:51:50 (CAD DWG). This is not an operational date.

## DSMR-26145 Koroknai Richárd (2026-07-29)

- Cached XLSM primary `Készméret - Falpanel` and `Készméret - Bútorfront` sheets
  are 40-row templates each. Width, length, quantity, finish and colour values
  are absent in every row. Scanner's 40 + 40 Kiíró candidates are duplicates,
  never quantity evidence. No ManufacturedItem preview may be generated.
- Keep only source-schema/evidence in `IMPORT_PREVIEW_DSMR_26145_EVIDENCE.json`
  (4 workbooks, 395 schema evidence, 40 unverified review occurrences).
- Deadline row: release 2026-06-29, scheduled 2026-07-20, expected 2026-07-31.
  Personal collection/self-installation note means no total actual-delivery event.
- SharePoint: 14 potential documents, last-modified range 2026-06-22–2026-06-29.

## DSMR-26135 Tormay (2026-07-29)

- Primary cached finished-size lists contain 40 blank panel templates and 39
  blank furniture-front templates; 0 complete width/length/quantity rows.
  Two Kiíró-sheet copies create 80 unverified occurrences, not 80 items.
- `IMPORT_PREVIEW_DSMR_26135_EVIDENCE.json`: 4 workbooks, 438 schema evidence,
  80 unverified occurrences; one `.bak` excluded. No item preview or DB write.
- Deadline conflict: order posted 2026-06-03, release 2026-07-03, expected
  2026-07-15, scheduled 2026-08-04 (20 days later). Keep both source facts and
  flag a human decision; do not call this actual delay or completion.
- SharePoint: 17 potential PDF/DWG/XLSM documents, 2026-05-18–2026-07-03.

## GYÁRTÁSMEGRENDELÉS PDF first (2026-07-29)

- User clarification: this PDF is the authoritative Sales-to-workshop handoff.
  Discover it first in every package; the survey finalises technical facts.
- `extractSalesOrderPdfPreview.py` uses bundled `pdfplumber`, writes deterministic
  preview JSON only and records page/row evidence, relative path and hash.
- 26135 PDF: five door positions with complete opening W×H×wall-depth, direction,
  type, quantity and BLENDE evidence; five handles and five lock bodies too.
- 26145 PDF: one skirting candidate, 5×2.4 fm = 12 fm, no delivery/installation.
  It needs a dedicated app model; it is not a door/panel/front item.
## Full Sales-PDF batch index (2026-07-30)

- `previewSalesOrderPdfBatch.py` completed read-only processing of all 111
  matching GYÁRTÁSMEGRENDELÉS PDFs (53 Sales-folder + 58 2026-folder files).
  Result: 604 door-position candidates, 244 supplementary-product candidates,
  0 extraction failures, 53 literal work-number labels and 50 canonical numeric
  work numbers.
- Deduplication: 37 identical-content SHA-256 groups. They are references to be
  linked/reviewed, not automatic duplicate projects.
- Canonical-variant review: 25163 / 25163 mód., 26119 / 26119 mód., and 26125 /
  26125 mód. The full source identifier is preserved; numeric grouping only
  surfaces the decision and never merges projects or revisions.
- The batch is deterministic and preview-only (`databaseWrite:false`,
  `macroExecution:false`). `IMPORT_METHODS.md` now documents PDF-first,
  selective OCR, reconciliation, template quarantine, versioning and test-import
  methods.
- `IMPORT_PROCESS.md` is the canonical repeatable procedure: source authority,
  PDF-first extraction, reconciliation, quality gates and test-import boundary.

## Validation and CAD baseline — 2026-07-30

- Full Sales-PDF validation is green after correcting the quality rule: missing
  source quantities are review warnings, never inferred as one piece. Blocking
  errors remain reserved for unsafe/malformed preview data.
- CAD metadata index: 83 records (73 DWG, 10 DXF), 76 filename work-number
  candidates, 73 known DWG headers and 3 same-content groups. Geometry is not
  imported from CAD without an approved temporary DXF conversion/parser and a
  technical visual review.
- DXF text pilot: 291 review evidence strings across 10 files; only 3 native
  DIMENSION values. Source unit and entity scope remain unverified. 26114-folder
  versus 21199-filename is a concrete document-link conflict.
- CAD conversion preservation: original DWG/DXF files remain read-only, with
  source SHA-256 checked before and after a converter run. Temporary DXF output
  must stay outside source roots and the repository.
- Sales-to-DRAFT preflight is now contract-tested with real 26135 evidence:
  valid API shape, five positions, no database write. `contractValid` is not
  approval. Multi-hash work numbers (for example 25129) must select a reviewed
  document SHA before a draft preview can be made.
- The same 26135 preflight validates all 50 field-level Sales evidence records
  against the OrderPositionEvidence contract (0 errors). Future test imports
  must create that evidence after the DRAFT returns its position/document IDs.
- PDF parser feedback loop: 26109 exposed a one-cell table shift after the
  position name. `SHIFTED_AFTER_NAME` now restores 800x2160x115 mm, direction,
  product type and quantity only when its numeric pattern is present. Header
  values that concatenate unrelated text are nulled rather than guessed.
- Rebuilt Sales batch: 111 PDFs, 52 canonical work-number candidates, 0 hard
  errors and 256 review warnings. Sales-only small-package review queue:
  25164, 26107, 26135; all still need survey/deadline/CAD reconciliation.

## 25164 PDF visual reconciliation — 2026-07-30

- Visual evidence must be used to confirm a new parser pattern before data is
  promoted. The Arador DSMR-25164 PDF displays 71x210x12.5 cm and
  76x210x12 cm; the raw first width was `7 1`, not 7 cm.
- The parser now rejoins digit-only whitespace-split cells before centimetre to
  millimetre conversion. It does not remove whitespace from arbitrary text.
- A conservative opening plausibility gate prevents dimensions such as 70 mm
  width from becoming a readiness candidate. It is warning/review only, never
  a guessed correction. Full rebuilt batch now has 288 review warnings and no
  blocking validation errors.

## Deadline numeric identifier lesson — 2026-07-30

- Do not apply generic Excel serial-date formatting to an order/work-number
  column. Numeric `25164` is a project identifier even though its numeric value
  falls inside the Excel-date range.
- DSMR-25164 deadline evidence is `Ütemterv.xlsx/ADAT!151`: contractual
  2025-12-01, scheduled 2025-12-08, Sales order posted 2025-12-12 and a
  December-first-half note. Keep each as an independent REVIEW observation;
  none proves actual delivery or installation.

## Customer-name collision lesson — 2026-07-30

- A text/customer fallback can find historical rows for a different work
  number. Surface those as `TEXT_FALLBACK` review evidence, but allow only
  `WORK_NUMBER_EXACT` to propose a project link.
- DSMR-26107 demonstrates both: ADAT!147 is the exact current source, while
  ADAT!64 and Ütemterv!76 are 24158 records sharing the Pintér Mónika name.

## Template quarantine regression — 2026-07-30

- `ManufacturedItemCandidate` needs one structured, labelled source row with
  width, height and positive quantity. Keyword hits or numbers elsewhere in a
  panel/front template remain schema evidence only.
- 26107 validates the rule: four macro containers, 437 keyword occurrences,
  and correctly zero panel/front import candidates.

## Production-sheet modelling lesson — 2026-07-30

- Treat a Gyártóilap as a reviewed manufacturing derivation. Its FNY values
  corroborate opening dimensions; explicitly labelled LAP width/height may
  populate the existing reviewed door-leaf fields.
- BKM fix/moving and TOK values need their own searchable component model with
  evidence and review state. Never force them into door, opening or standalone
  panel/front records.

## Completion-evidence rule — 2026-07-30

- An installation/hand-over document becomes an actual delivery or installation
  event only with completed relevant rows plus signed/dated receipt or an
  equivalent explicit completion fact. A blank template with default `Kész`
  labels remains a document reference and `UNKNOWN` completion state.

## SharePoint folder simulation lesson — 2026-07-30

- Treat the current query-export spreadsheet as a point-in-time, read-only
  metadata snapshot. It can faithfully simulate relative folder/document
  navigation and candidate project packages, but cannot infer creation time,
  version history, deletions or authoritative identity.
- Filename/path work-number disagreement is a hard review state. Path-only
  numbers help discovery but never establish a project relationship.
- Keep a future live-source catalog separate from approved `OrderDocument`
  revisions. A live read-only delta sync needs stable Graph IDs, version/etag,
  timestamps and intentionally granted selected-library access.
- Preserve explicit folder rows from the query export. In the current snapshot
  they expose 2,974 folders, including empty ones; document paths add only 14
  missing ancestors. Path-derived-only traversal would lose real structure.
- Keep relevance and project-link state independent. All 105 single
  filename/path conflicts and 4 multi-number rows remain visible; 76 belong to
  the currently relevant PDF/DWG/XLSX/XLSM lane.
- A five-digit token is not necessarily a Doorstar work number. Only explicit
  DSMR filenames or canonical project-folder names form package candidates;
  product, decor and hash-like numbers remain weak document-review evidence.
- Fail closed on truncation, absolute/traversal paths, duplicate relative
  document paths and input/output path equality. A preview must never silently
  omit rows or overwrite its source.
- Keep the immutable source snapshot fingerprint separate from the
  transformation fingerprint. Parser/profile/config changes must create a new
  catalog run key even when the source workbook bytes are unchanged.
- Real Entra/OIDC authentication is a P0 gate. The temporary `X-Role` header
  cannot protect a live source catalog, even if Graph access itself is read-only.

## DSORD-03 technical catalog configuration (2026-07-30)

- `technicalCatalog.json` is the versioned backend source of Doorstar door
  types, finishes, glass, hardware, wall solutions, materials and machining
  choices. It is exposed read-only at `/api/production/technical-catalog`.
- `OrderPosition` stores the stable selection keys plus hardware/machining
  arrays and a technical note. Server-side validation rejects unknown or
  duplicated keys on sales intake, draft update and new-revision creation.
- Selected keys derive legacy compatibility fields (product type, finish,
  glazing and wall treatment); absent catalog keys preserve import/legacy
  free-text values. The survey UI reads the API instead of embedding choices.
- Verification: test-schema migration applied to Docker Postgres; production
  service build and OpenAPI coverage (66 operations) pass; frontend build
  passes; backend Vitest is green at 26 files / 91 tests with teardown.

## Shared semantic mapping lesson — 2026-07-30

- A downstream validator must not trust upstream semantic labels merely because
  their enum and internal references are valid. Recompute relevance,
  work-number resolution and package evidence from the raw filename, extension
  and parent path through one shared pure function.
- Keep evidence strength separate from link certainty. An explicit DSMR
  filename is strong Sales-package evidence even if the path carries another
  number, but that mismatch remains a mandatory human `CONFLICT` review.
  Canonical-folder evidence alone is suppressed on conflict.
- Require both object-exact and byte-exact golden replay after rule changes.
  Current proof: `spcatalog_974bb607bd9c693017d1`, validation 0 errors,
  backend build PASS, OpenAPI 78 operations, Vitest 32 files / 98 tests.

## Session handoff checkpoint — 2026-07-30

- The current durable working set is `CLAUDE.md` + `memory.md` + `state.md` +
  `TODO.md`; every new import-discovery session must read all four before
  processing source data.
- The safe next milestone is the snapshot-backed, read-only Source Catalog and
  its human review queues. Live Graph work remains stopped at the P0 auth,
  selected-library, stable-identity/cursor and named-reviewer gates.
- No source file, SharePoint item, production/public schema or deployed system
  was changed while saving this checkpoint.

## Exact-revision component lineage lesson — 2026-07-30

- A component source relation identifies provenance, not data inheritance.
  Never copy quantity, door/opening dimensions, material, finish, cutting size
  or a cached legacy formula merely because a component row points to an order
  position, manufactured item or supplementary item.
- Physical side and construction role are orthogonal: `SIDE_A/SIDE_B` is the
  stable spatial identity; `FIXED/ADJUSTABLE` describes a present casing in a
  proven profile. Neither establishes hinge/strike jamb, handing or the other
  axis.
- Safe future RAG/profile evidence requires document version + relative path,
  page/sheet/row/drawing locator, raw and normalized values, candidate
  component key, calculator/BOM rule key and version, product-profile
  fingerprint, review state and resolution.
- Until Doorstar approves a versioned product profile, every such result is a
  read-only candidate. Only the exact-revision office review and backend may
  materialize an immutable `ComponentSnapshot`.
- Backend evidence gates must be checked per source kind, not assumed from a
  shared `VERIFIED` label. Supplementary and manufactured items now enforce
  complete resolved evidence, and component materialization independently
  rechecks source audit completeness.
- Client-side eligibility is a useful fail-closed mitigation, not authority.
  The calculator UI now checks non-empty/all-`RESOLVED` manufactured evidence
  and `SOURCE_REVIEW` supplementary evidence, but a direct backend request must
  be rejected by the same server-side invariant.
- Final evidence authority never belongs to an import/RAG adapter. It may
  capture raw/normalized values, locators and an open state; only the
  role-protected backend review action may write resolution, reviewer and
  timestamp. A `RESOLVED` label without the complete audit remains unusable.
- Revision readiness must be calculated from every manufactured and
  supplementary parent item in the exact revision, never from only the
  selected component rows or outgoing payload. Otherwise omission would become
  an audit bypass. The frontend now mirrors this full-parent invariant and the
  backend remains the final authority.
- A pure gate test is not the final UI proof. The route-level regression must
  also demonstrate the user-visible count/audit link, absence of editor and
  materialize controls, and zero create-mutation calls. This page-level proof
  now exists for an open manufactured evidence row.
- Shared route identity is part of the regression contract: application
  registration, navigation links and tests must consume one route pattern/path
  builder. To prove a specific audit is the sole blocker, assert the named
  blocker region contains exactly one item with that expected reason.

## Controlled Nexus RAG package lesson — 2026-07-31

- A forrásleltár és a kereshető tudás két külön biztonsági réteg. A leltár
  őrizheti a korlátozott relatív útvonalat, érzékenységet és kizárási döntést,
  de egészében `ragIndexable:false`; Nexus csak PII- és rendelésadat-mentes
  kanonikus állítást kaphat.
- Minden kanonikus claim külön `VERIFIED`, `INFERENCE` vagy `OPEN` állapotot,
  inventory source ID-t, teljes SHA-256-at és lokátort kap. Egy `OPEN` állítás
  kereshető lehet, de nem válhat automatikus defaulttá vagy gyártási döntéssé.
- Az offline manifest `targetIsland=doorstar`, `mode=dry-run`,
  `nexusWrite=false`, `chromaWrite=false`; az indexelő és adatbázis-kliens
  hiánya szándékos biztonsági tulajdonság.
- Dokumentumkulcs: SHA-256 az id, verzió, kanonikus hash és policy-verzió
  kombinációjából. Azonos id+verzió azonos hash mellett skip, eltérő hash
  mellett blokkol. Offline Nexus-baseline nélkül a CREATE csak terv, nem írás.
- A validátor újrahash-eli a teljes inventoryt és a kanonikus fájlokat,
  ellenőrzi a claim-citációt, PII/rendelésszám mintákat, eval-hivatkozásokat és
  determinisztikus chunkokat. A bevált golden eredmény: 6 dokumentum,
  98 claim, 41 chunk, 35 eval, 0 hiba és 0 warning.
- A dry-run és review után kötelező megállni. Emberi jóváhagyás nélkül nincs
  Nexus/ChromaDB ingest; jóváhagyás után is külön baseline-összevetés és
  kontrollált végrehajtási terv kell.
- A dry-run outputját csak a package saját `DRY_RUN_REPORT.json` útjára szabad
  atomikusan írni. A symlink/hardlink azonosságot minden manifest-, inventory-,
  eval-, kanonikus és inventory-forrásfájllal szemben tiltani kell; különben
  egy látszólag biztonságos report-út bemenetet írhatna felül.
- Az eval forrása csak akkor érvényes, ha legalább egy elvárt dokumentum
  manifest-forrása, és `EXCLUDE` forrás soha nem lehet elvárt találat.
- Végső baseline: package
  `34110af5a9ea4c129467034fa3d181cbba6c5601b908abd87be89d078fbae116`,
  report
  `c4e74c696495c96b3ee649d26003ef54fedbbacf28a8b7a2f5c1e320729e5cc2`;
  12/12 validator unit, dupla bájtazonos dry-run, független QA PASS P0/P1=0.
