# Doorstar legacy import mapping

Mapping version: `doorstar-legacy-order-preview-v1`. This mapping produces
only DRAFT candidates. It never approves a revision, issues a work package or
writes to the production database.

## Target aggregate and API boundary

The existing Prisma aggregate is:

```text
Project -> ProductionOrder -> OrderRevision (DRAFT) -> OrderPosition
                                           -> OrderDocument
```

`POST /api/production/production-orders/sales-intake` is the eventual atomic
write boundary for a **new** Project, its `ProductionOrder`, revision 1 and
positions. It must be called only after the preview has one reviewed,
complete payload. `POST .../documents` adds metadata-only `OrderDocument`
references. No importer may address a previous customer Project for a new
order.

## Project and order mapping

| Legacy source | Doorstar field | Rule | Automation |
| --- | --- | --- | --- |
| DSMR/work number in folder, filename or `MEGR. SZÁMA` | `Project.key` | `DSMR-<work-number>`; new record for every order | Candidate only; duplicate key check and review required |
| Same | `Project.num` | Source work number | Automatic when recognised |
| Folder label after work number | `Project.name` | Proposed project name | Automatic only when clear; otherwise review |
| `Ütemterv` `MEGRENDELŐ NEVE` | `OrderRevision.customerName` | Customer is header metadata, not a project reuse key | Review required |
| `Vállalt szállítási határidő` | `OrderRevision.expectedDelivery` | Normalise to ISO datetime only after date-format validation | Review required |
| `Tervezett beépítés` / actual-install note | `Project.beepites` and review note | Do not infer a committed delivery date from free text | Review required |
| priority column | `OrderRevision.priority` | Map only after an agreed numeric priority table | Review required |
| fixed source rule | `ProductionOrder` | Created automatically with the new Project by Sales intake | Automatic inside the reviewed atomic request |
| reviewed import run | `OrderRevision.importRunId` | Links the resulting DRAFT to its immutable preview provenance | Automatic only through the test-schema import route |

There is no independent deadline table in the current Prisma schema. A
preview `Deadline` record is a provenance record for the eventual revision's
`expectedDelivery` (and optional project installation text), not a task or a
production schedule entry.

## Position mapping

| Kalkulátor `AlapAdat` field | Doorstar `OrderPosition` field | Automation |
| --- | --- | --- |
| `Sorszám` | `code` | Automatic when non-empty |
| `Ajtó megnevezése` | `name` | Automatic candidate; review blanks |
| `Ajtó Menyisége` / `Ajtó Mennyisége` | `quantity` | Automatic if positive integer |
| `Ajtó Tipus` | `productType` | Candidate; survey confirmation required |
| `Ajtó Nyitás` | `openingDirection` | Candidate; survey confirmation required |
| `Ajtó Falnyilás Szélessége/Magassága/Vastagság` | `openingWidthMm/openingHeightMm/openingDepthMm` | Automatic candidate after numeric-unit validation |
| `Ajtó Szélesség`, `Ajtó Hosszúság`, `Ajtó Vastagság` | `doorWidthMm/doorHeightMm/doorThicknessMm` | Candidate only; preserve **width × height × thickness, mm**; all observed thicknesses need review |
| `FixOldal` + `MozgoOldal` surface fields | `surface` | Manual join and survey review; do not collapse two sides silently |
| blende/falpanel fields | `wallTreatment` (`NONE`, `WALL_PANEL`, `BLENDE`) | Manual join and survey review |
| `Üveg` fields | `glazing`, `glazingSpecification` | Manual join and survey review; `GLAZED` requires specification |

The preview emits one `OrderPosition` record per readable `AlapAdat` source
row and marks the three cross-sheet technical groups as errors/review gates.
It does not claim that duplicate workbook rows are independent door positions.

## Wall-panel mapping

`wallTreatment = WALL_PANEL` only says that a door position has a related
wall-panel requirement. It is not sufficient to plan, manufacture, document or
search the panel itself. A wall panel can be a standalone project work item
(for example, a remanufactured panel with no door position), so the import
preview must also emit a `WallPanelCandidate` whenever a Sales PDF, survey,
DWG or calculator field describes one.

| Legacy source | Proposed Doorstar wall-panel field | Automation |
| --- | --- | --- |
| work number / customer | `Project` relation | New Project per work number; never attach by customer alone |
| panel identifier / room / position | `WallPanel.code`, `name`, optional `OrderPosition` relation | Candidate only; review room/door linkage |
| quantity | `WallPanel.quantity` | Automatic if a positive integer is explicit |
| width × height × thickness, mm | `WallPanel.widthMm/heightMm/thicknessMm` | Preserve only explicit units; survey confirms |
| surface, colour, material | `WallPanel.finish`, later structured face/material rows | Candidate; final survey/Sales review |
| new / remanufacture | `WallPanel.workKind` (`NEW`, `REMANUFACTURE`) | Automatic when the source says it explicitly |
| PDF, DWG, image, survey locator | `WallPanelEvidence` + `OrderDocument` | Relative reference, hash, page/sheet/row only |

Until the Prisma schema contains `WallPanel` and `WallPanelEvidence`, retain
these as review-only `ImportCandidate` payloads; do not force panel work into
`OrderPosition` or an unstructured `notes` field. This preserves its own
quantity, geometry, finish, source evidence and production status.

## Furniture-front mapping

Furniture fronts (`bútorfront`, `front`, `fiókelő`, `bútorajtó`) are likewise
standalone manufactured items. They must not be represented as Doorstar door
positions: front drilling, edge banding, handle/cut-out and cabinet linkage
have a different production meaning from a door opening and direction.

| Legacy source | Proposed Doorstar furniture-front field | Automation |
| --- | --- | --- |
| item/room/cabinet label | `FurnitureFront.code`, `name`, `cabinetReference` | Candidate; review ambiguous labels |
| quantity | `FurnitureFront.quantity` | Automatic if explicit positive integer |
| width × height × thickness, mm | `FurnitureFront.widthMm/heightMm/thicknessMm` | Preserve explicit values and units; review any conversion |
| material/core | `FurnitureFront.material` | Candidate only |
| visible/front and back finish | structured `FurnitureFrontFinish` rows | Candidate; do not merge into one string |
| edge-band / edge profile | `FurnitureFrontEdge` rows | Candidate; review side and material |
| handle bore, hinge bore, milling/cut-out | `FurnitureFrontMachining` rows | Review unless a canonical calculator row exists |
| panel/front drawing, PDF/DWG/XLSM row | `ManufacturedItemEvidence` + `OrderDocument` | Relative reference, SHA-256 and page/sheet/row only |

The import source may use a different vocabulary for the same object. Initial
classification is keyword-assisted (`front`, `fiókelő`, `bútorajtó`) but must
remain `REVIEW` unless a human confirms it. A front can have no related door
position and still be scheduled through cutting, machining, surface treatment,
assembly and packaging.

## Document reference mapping

| Legacy attribute | `OrderDocument` field | Automation |
| --- | --- | --- |
| fixed source | `source = LEGACY_FOLDER` for `01 - Megrendelés` | Automatic |
| relative path beneath its named source root | `relativePath` | Automatic; absolute Windows paths are never output |
| filename | `displayName` | Automatic |
| extension/path classification | `kind` (`SALES_ORDER`, `SURVEY`, `DRAWING`, `OTHER`) | Candidate; review required |
| SHA-256 | `contentSha256` | Automatic evidence value |
| Sales folder rule | `OrderRevision.documents` | `01 - Megrendelés` is a Sales reference; archive/deadline items are review references only |

Document binaries remain in their source/object storage. The current database
stores only metadata and a relative reference.

## Deadline workbook mapping

| `Ütemterv.xlsx` field | Target / preview field | Automation |
| --- | --- | --- |
| `MEGR. SZÁMA` | `Deadline.projectNumber`, then `Project.num/key` match | Automatic candidate |
| `MEGRENDELŐ NEVE` | `Deadline.customerName`, then `OrderRevision.customerName` | Review required |
| `Vállalt szállítási határidő` | `Deadline.expectedDelivery`, then revision expected delivery | Review date and duplicate lifecycle view |
| `Tervezett beépítés` | `Deadline.installation`, then project installation note | Review required |
| `Gyártásra Kiadva`, planned/end/completed columns | source-only workflow evidence | Not imported into the current order schema |
| counters such as door count, glass, blende, finish | reconciliation checks | Not imported as technical position truth |

`ADAT`, `Tervezett_beépítések` and `Ütemterv` may describe the same order.
Deduplicate by reviewed work number plus source recency; do not create three
delivery records.

## Preview tool

Run from `src/production-service` or with repository-relative paths:

```powershell
python .\scripts\previewLegacyOrderImport.py `
  --sales-root 'C:\Users\szant\Doorstar Kft\Gyártás-Dokumentumok - Dokumentumok\01 - Megrendelés' `
  --deadlines-root 'C:\Users\szant\Doorstar Kft\Gyártás-Dokumentumok - Dokumentumok\03 - Határidők' `
  --archive-root 'C:\Users\szant\Doorstar Kft\Gyártás-Dokumentumok - Dokumentumok\2026' `
  --output-json .\tmp\doorstar-import-preview.json `
  --output-csv .\tmp\doorstar-import-preview.csv
```

The only mode is preview. The JSON contains stable `Project`,
`ProductionOrder`, `OrderRevision`, `OrderPosition`, `WallPanelCandidate`, `OrderDocument` and
`Deadline` records, each with source file, source row where applicable,
review flag and errors. The CSV is a flat equivalent. Output ordering and the
`generatedAt` marker are deterministic. There is no database client, no
production connection string and no import switch.

### Reusable panel/front scanner

`src/production-service/scripts/scanLegacyManufacturedItems.py` scans legacy
XLSX/XLSM cached values for wall-panel and furniture-front evidence. It never
opens Excel, executes a macro or connects to a database. A keyword hit is only
schema evidence; a review candidate additionally needs an explicit numeric
value in the same cached row and can never become an automatic import.

```powershell
python .\scripts\scanLegacyManufacturedItems.py `
  --archive-root "C:\...\2026" `
  --output-json "$env:TEMP\doorstar-manufactured-item-preview.json"
```

The output includes a relative source path, hash, sheet, logical row, cached
cells, extraction state and ignored macro-container list. The companion unit
test is `tests/legacyManufacturedItemScan.unit.test.ts`.

## Controlled first import route

`POST /api/production/import-runs/:importRunId/apply-draft` is the sole
database-writing legacy-import boundary. It accepts a complete new-project
Sales-intake payload and at least one metadata-only document reference.

It rejects every request unless all of these are true:

- the live connection uses `schema=doorstar_test`;
- the caller is an administrator;
- the referenced `ImportRun` exists and remains `PREVIEWED`;
- the supplied position count does not exceed the preview candidate count;
- the project key has never been used; and
- the import run has not already been applied.

The transaction creates the Project, ProductionOrder, DRAFT revision,
positions and document references, records `importRunId`, and then changes the
run to `APPLIED`. It cannot approve, plan, issue, overwrite a historical
project, copy a document binary, or write to `public`.

## Controlled first import recommendation

First use a local test-schema dry run only after a single fresh work number
has passed review: one current Sales package, one current `Ütemterv` row, a
single canonical Kalkulátor revision and two to five survey-complete
positions. Create one DRAFT revision through the existing Sales-intake API,
append metadata-only Sales document references, and verify the retrieved
order. Do not approve, calculate, plan or issue it.

Use the controlled route only after an importer has prepared and a human has
reviewed a complete payload. The first applied revision must remain
`SALES_DRAFT` / `SURVEY_PENDING` until the survey verifies its technical data.

## SharePoint document-metadata import preview

`Fájlok_Módositás_dátuma.xlsx` is a SharePoint `.iqy` query export, not a
local filesystem inventory. It maps as follows:

| SharePoint export column | Doorstar preview field | Importability |
|---|---|---|
| `Név` + `Elérési út` | `DocumentReference.sourceRelativePath`, filename | Automatic after project-link review |
| `Módosítva` | `DocumentSourceMetadata.sourceLastModifiedAt` | Automatic, source metadata only |
| `Módosította` | `DocumentSourceMetadata.sourceLastModifiedBy` | Automatic, source metadata only |
| `Elemtípus` | `sharePointItemType` | Automatic; `Mappa` is excluded from document records |

The current export has no `Létrehozva` or version-history field. Therefore
`Módosítva` means **last SharePoint document modification**, never an
order-received, survey-finalised or delivered event. `.bak`, `.dwl` and
`.dwl2` remain excluded. PDF, DWG, XLSX and XLSM are potential import
documents; macros are never executed.

`scripts/previewSharePointDocumentMetadata.py` creates the metadata-only JSON
preview and has no database-writing mode.

## Work-number precedence for mixed archive folders

Some legacy folders contain documents for a later, separate order. The
SharePoint metadata preview therefore resolves `workNumberCandidate` in this
order: explicit work number in the **filename**, then work number in the
folder path. A filename/folder disagreement is a review signal; it must not
silently attach the document to the enclosing folder's Project.

## GYÁRTÁSMEGRENDELÉS PDF — elsődleges Sales → műhely forrás

A `GYÁRTÁSMEGRENDELÉS` PDF a Sales által műhelynek átadott megrendelési bizonylat.
Minden projektben ezt kell először feldolgozni, majd a felmérés, CAD és készméretlista
ellenőrizheti vagy véglegesítheti a műszaki adatot. A preview `SALES_DOCUMENTS_RECEIVED`
állapotú és review-köteles; közvetlen adatbázisírás tilos.

| PDF mező | Doorstar cél / használat | Automatikus előnézet | Review-szabály |
| --- | --- | --- | --- |
| DSMR munkaszám, kelte | új Project / Sales DRAFT azonosító | igen | minden munkaszám új Project |
| Ügyfél, telefon, szállítási cím | ügyfél- és kapcsolattartó adatok | igen | telefonból leválasztott név ellenőrzendő |
| Várható szállítási idő | `expectedDeliveryText` evidence | igen | csak pontos ISO dátum lehet `expectedDelivery` |
| Sorszám, megnevezés, mennyiség | `OrderPosition.code/name/quantity` | igen | a felmérés véglegesíti |
| Falnyílás szélesség, magasság, falvastagság (cm) | `openingWidthMm`, `openingHeightMm`, `openingDepthMm` (`×10`) | igen | 3. érték falvastagság, **nem** ajtólapvastagság |
| Nyitásirány, típus, tokoldali blende | `openingDirection`, `productType`, `wallTreatment=BLENDE` | igen | csak explicit szöveg alapján |
| Zár, pánt, borítás, szín, minta, megjegyzés | mezőszintű PDF evidence + review-notes | igen | nem automatikus üvegezés/felület |
| Kilincs, zártest, lábazat, egyéb kiegészítő | `SalesOrderSupplementaryProductCandidate` | igen | külön `OrderSupplementaryItem` modell kell |

Az `extractSalesOrderPdfPreview.py` csak olvasható, determinisztikus JSON preview-t
ír relatív útvonallal, oldal/sor evidence-szel és SHA-256 hash-sel. A PDF-ben nem
szereplő üvegezés, ajtólapméret vagy végleges felület `null` marad.
