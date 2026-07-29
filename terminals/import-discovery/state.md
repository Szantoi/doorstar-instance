# Import Discovery állapot

**Állapot:** aktív adatfelderítés

**Utolsó frissítés:** 2026-07-29

## Elkészült

- Forrásleltár, mapping, tárolási terv és kereshető tudásréteg-terv.
- Makrómentes order-preview és manufactured-item scanner, unit tesztekkel.
- 2026 archív teljes evidence-szintű átvizsgálása.
- Kontrollált `DSMR-26148` tesztsémás DRAFT-feltöltés, explicit
  `doorstar_test` védelemmel és visszaolvasási ellenőrzéssel.

## Következő lépések

1. Másik magas bizonyítékszámú projekt mintaelemzése (`25219`, `25118`,
   `25163` vagy `26137`).
2. A `DSMR-24170` 57 front-sorának PDF/felmérési bizonyítékkal való
   keresztellenőrzése, csak eltérés esetén review-hiba felvétele.
3. Panel/front adatmodell és Import Inbox fejlesztői kézfogása.

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
