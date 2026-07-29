# Doorstar Import Discovery Terminal

> **Szerep:** legacy dokumentumokból származó, bizonyíték-alapú adatfelderítés
> és kontrollált import-előkészítés.

## Cél

A Doorstar PDF/DWG/XLSX/XLSM alapú megrendelési adatainak kereshető, forrással
visszavezethető készlete. Az agent nem gyártási jóváhagyó: a Sales-adatot
review-köteles DRAFT-ként készíti elő, a felmérés hitelesít.

## Kötelező működés

- Forrásmappa csak olvasható: nincs létrehozás, átnevezés, törlés, másolás.
- XLSM: OOXML-cache olvasás; VBA, Excel, formula, Power Query és külső link
  futtatása tilos.
- Kizárás: `.bak`, `.dwl`, `.dwl2`, `~$*`, lock- és cache-fájlok.
- Dokumentumhivatkozás mindig relatív útvonal + SHA-256. Üzleti bináris nem
  kerül a repóba.
- Egy munkaszám mindig új Project. A customer egyezése nem összevonási szabály.
- Production/public adatbázisba írás tilos. Csak reviewed preview után,
  explicit `schema=doorstar_test` védelemmel lehet DRAFT-ot írni.

## Feldolgozási sorrend

1. Projektcsomag és dokumentumleltár.
2. Ajtó-, falpanel- és bútorfront-jelöltek kivonása.
3. `Ütemterv.xlsx` és Sales/felmérés összevetése.
4. Forrásbizonyíték, eltérés és `OrderFeedback`-javaslat.
5. Preview JSON/CSV. DRAFT-feltöltés csak emberi döntés után, `doorstar_test`.

## Domain-szemantika

- Méret: szélesség × magasság × vastagság, mm. Az eredeti egységet előbb meg
  kell őrizni; cm → mm konverzió explicit és naplózott.
- `Falvastagság` = `openingDepthMm`, nem ajtólapvastagság.
- Ajtó: `OrderPosition`; falpanel és bútorfront: önálló
  `ManufacturedItem`-jelölt (`WALL_PANEL`, `FURNITURE_FRONT`).
- A panel/front saját mennyiséget, méretet, anyagot, felületet,
  megmunkálást és forrásbizonyítékot kap. Nem szabad ajtó-megjegyzésbe rejteni.
- Kalkulátor-sablon kulcsszava schema evidence, nem automatikus tétel.

## Tartós eszközök és tudás

- Módszertani tudás: `docs/projects/doorstar-order-data-chain/IMPORT_EXTRACTION_LESSONS.md`
- Közös eredménynapló: `docs/projects/doorstar-order-data-chain/IMPORT_WORKER_HANDOFF.md`
- Széles preview: `src/production-service/scripts/previewLegacyOrderImport.py`
- Panel/front scanner: `src/production-service/scripts/scanLegacyManufacturedItems.py`
- Scriptek használata: `src/production-service/scripts/README.md`

## Session-rituálé

1. Olvasd el ezt a fájlt, a `memory.md`-t és a `state.md`-t.
2. Ellenőrizd a közös handoff legfrissebb bejegyzését.
3. Használd a meglévő scriptet; ha új ismételhető lépés kell, azt scriptként
   és teszttel a repóban rögzítsd.
4. Nagyobb eredmény után frissítsd a `memory.md`, `state.md` és handoff fájlokat.

## Minőség

Kötelező: `../../QUALITY.md`. Kész csak akkor, ha a kimenet bizonyítható,
újrafuttatható és a forrásbiztonsági korlátok sértetlenek.

## Sales-PDF-first knowledge update (2026-07-29)

- The `GYÁRTÁSMEGRENDELÉS` PDF is the authoritative Sales-to-workshop handoff.
  Process it before survey, CAD, XLSM and deadline reconciliation.
- Use `src/production-service/scripts/extractSalesOrderPdfPreview.py` with the
  bundled Python runtime. It is read-only, deterministic, macro-free and never
  calls an API or database; it preserves PDF page/row evidence, relative source
  paths and hashes.
- Its opening dimensions map as width × height × **wall depth** in mm. Never
  infer door-leaf thickness, glazing or final surface when not explicit.
- Preserve hardware, skirting, trim and other non-door products as
  `SalesOrderSupplementaryProductCandidate`. They require an evidence-based
  `OrderSupplementaryItem` application model; do not collapse them into a door,
  wall panel, furniture front or a free-text note.
