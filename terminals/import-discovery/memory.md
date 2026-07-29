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
