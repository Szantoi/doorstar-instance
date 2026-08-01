# Legacy import scripts

These tools are source-read-only and deterministic. They do not run Excel,
VBA, formulas or Power Query. The explicitly documented recovery and reviewed
preview-registration exceptions below are the only database-writing modes.

## `registerBulkPreview.ts`

The reviewed-preview registration exception takes one versioned manifest and
registers its existing JSON previews as one resumable `ImportRun`. It only
writes `ImportRun`/`ImportCandidate` evidence in `doorstar_test`; it does not
create a Project, DRAFT, manufactured item, approval or production task. A
typed confirmation and review note are required. Re-running the identical
manifest returns the same run and adds only records missing after an interrupted
attempt.

```json
{
  "schemaVersion": "doorstar-bulk-preview-registration/v1",
  "profileVersion": "legacy-evidence/v1",
  "previewArtifacts": [
    "docs/projects/doorstar-order-data-chain/IMPORT_PREVIEW_DSMR_26148.json"
  ]
}
```

```powershell
npx tsx .\scripts\registerBulkPreview.ts `
  --manifest docs/projects/doorstar-order-data-chain/IMPORT_BULK_MANIFEST.example.json `
  --review-note "A preview sorait és karanténjait ellenőriztem." `
  --dry-run
```

After copying and reviewing a manifest, omit `--dry-run` and use the explicit
human confirmation to register it:

```powershell
npx tsx .\scripts\registerBulkPreview.ts `
  --manifest docs/projects/doorstar-order-data-chain/IMPORT_BULK_MANIFEST.json `
  --review-note "A preview sorait és karanténjait ellenőriztem." `
  --confirm-bulk-preview-registration
```

## `recoverDsmr26148Utf8.ts`

The sole exception is this deliberately narrow recovery tool. It removes and
recreates only the `DSMR-26148` DRAFT in `doorstar_test`, from the reviewed
UTF-8 preview, preserving its source hash, two positions, document reference,
deadline observations, feedback and a new audit ImportRun. It rejects every
other schema and requires a typed human confirmation; it cannot touch
production/public data.

```powershell
npx tsx .\scripts\recoverDsmr26148Utf8.ts --confirm-dsmr-26148-utf8-reload
```

## `cleanupLegacyTestFixtures.ts`

Removes the four historical `Minta Kft.` integration fixtures that were left
in the former shared `doorstar_test` schema. The fixed key allow-list and
schema guard prevent it from deleting review data or production data.

```powershell
npx tsx .\scripts\cleanupLegacyTestFixtures.ts --confirm-legacy-test-fixture-cleanup
```

## `previewLegacyOrderImport.py`

Builds the broad document/workbook/deadline preview for the Sales and deadline
folders. Its JSON/CSV output is a review artefact, not an import command.

## `scanLegacyManufacturedItems.py`

Finds wall-panel and furniture-front evidence in cached XLSX/XLSM cells.

```powershell
python .\scripts\scanLegacyManufacturedItems.py `
  --archive-root "C:\path\to\2026" `
  --output-json "$env:TEMP\doorstar-manufactured-item-preview.json"
```

The scanner records source path, file hash, sheet, logical row, raw cached
cells and source unit. It emits a review candidate only on a relevant item or
finished-size sheet with cached width, height/length and quantity values.
Template and parameter sheets stay schema evidence only.

## `extractManufacturedItemPreview.py`

Builds a review-only, field-labelled preview from one explicitly selected,
authoritative scanner sheet. It records the source unit and conversion to mm;
it never performs a database write. API-ready records include an exact
`apiPayload` for the ManufacturedItem POST contract and the required
`ManufacturedItemEvidence`. `--work-kind` is mandatory so the script never
guesses whether a row is standard work, rework, remanufacture or replacement.
Sending the payload still requires a reviewed DRAFT revision and a separate,
human-gated uploader.

```powershell
python .\scripts\extractManufacturedItemPreview.py `
  --input-json ".\IMPORT_PREVIEW_DSMR_24170_EVIDENCE.json" `
  --output-json ".\IMPORT_PREVIEW_DSMR_24170.json" `
  --source-sheet "Készméret - Bútorfront" `
  --source-root-label "2026/07_Július/24170 - Koza Petra" `
  --work-kind STANDARD
```

## `previewSharePointDocumentMetadata.py`

Reads the cached data from a SharePoint `.iqy` query export and creates a
review-only JSON document-metadata preview. `Módosítva` is stored as the
SharePoint server-side last-modified time, never as a local Windows timestamp.
The current export has no `Létrehozva` field, so the output explicitly flags
that missing evidence. It records filename and path work-number candidates
separately; disagreement is `CONFLICT`, multiple distinct candidates are
`MULTIPLE`, and a path-only candidate is `PATH`. Only explicit DSMR filenames
or canonical project-folder names form strong package candidates. An explicit
DSMR filename remains strong Sales-package evidence even if its enclosing path
contains a different work number, but the project link stays in mandatory
`CONFLICT` review; path-only package evidence is suppressed on conflict. The
tool reads the full query by default, verifies the workbook hash before/after
parsing, writes atomically and refuses every output inside the source export
directory tree.

`sharePointMetadataRules.py` is the shared pure mapping library used by both
the preview and simulator. The simulator recomputes relevance, work-number
resolution and package evidence from the raw filename and parent path and
rejects altered upstream labels.

## `simulateSharePointMetadataCatalog.py`

Builds a virtual, read-only SharePoint folder/catalog snapshot from the metadata
preview. Exported folder rows are preserved, including empty folders; only
missing ancestors are derived from document paths. Stable SharePoint
item/version identities remain intentionally unavailable. A deterministic input
fingerprint and catalog-run key make repeated runs comparable. It is safe to use
for a source-catalog browser, not for automatic linking or live change
synchronisation.

```powershell
python .\scripts\simulateSharePointMetadataCatalog.py `
  --input-json ..\..\docs\projects\doorstar-order-data-chain\IMPORT_PREVIEW_SHAREPOINT_DOCUMENT_METADATA.json `
  --output-json ..\..\docs\projects\doorstar-order-data-chain\IMPORT_PREVIEW_SHAREPOINT_CATALOG_SIMULATION.json
```

## `validateSharePointMetadataCatalog.py`

Recomputes the complete snapshot contract: source-row accounting, preview-only
safety flags, source/transformation fingerprints, stable IDs, unique relative
paths, complete folder parents, package references and every summary count.
It has no Excel, SharePoint, macro or database client. `--fail-on-error` makes
the command suitable for a repeatable QA gate.

```powershell
python .\scripts\validateSharePointMetadataCatalog.py `
  --metadata-json ..\..\docs\projects\doorstar-order-data-chain\IMPORT_PREVIEW_SHAREPOINT_DOCUMENT_METADATA.json `
  --catalog-json ..\..\docs\projects\doorstar-order-data-chain\IMPORT_PREVIEW_SHAREPOINT_CATALOG_SIMULATION.json `
  --output-json ..\..\docs\projects\doorstar-order-data-chain\IMPORT_REVIEW_SHAREPOINT_CATALOG_VALIDATION.json `
  --fail-on-error
```

## `extractSalesOrderPdfPreview.py`

The Sales-issued `GYÁRTÁSMEGRENDELÉS` PDF is the authoritative Sales-to-workshop
handoff. This read-only tool extracts its Sales order header and door-position
evidence first, before reconciling it with the survey, CAD, XLSM and deadline
sources. It separately retains non-door supplementary products (for example
skirting/trim) instead of silently discarding them. Those records are explicitly
flagged until the application has a dedicated supplementary-product model. It
does not infer door-leaf dimensions from the opening dimensions:
the third source measure is retained as opening depth/wall thickness.

Use the bundled workspace Python because it supplies `pdfplumber` for safe PDF
table reading. The generated preview has no API call and no database-write mode.

```powershell
& 'C:\Users\szant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  .\scripts\extractSalesOrderPdfPreview.py `
  --input-pdf 'C:\source\2026\07_Július\26135 - Tormay\DSMR 26135 GYÁRTÁSMEGRENDELÉS.pdf' `
  --source-root 'C:\source' `
  --source-root-label LEGACY_2026 `
  --output-json .\IMPORT_PREVIEW_DSMR_26135_SALES_PDF.json
```

## `previewSalesOrderPdfBatch.py`

Runs the Sales-PDF preview over every matching `GYÁRTÁSMEGRENDELÉS` PDF in the
given source roots. It creates a deterministic review index with work-number
groups, same-content duplicate groups, door-position totals, supplementary
product totals and a separate error row for non-machine-readable PDFs.

```powershell
& 'C:\Users\szant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  .\scripts\previewSalesOrderPdfBatch.py `
  --source 'SALES_FOLDER=C:\source\01 - Megrendelés' `
  --source 'LEGACY_2026=C:\source\2026' `
  --output-json .\IMPORT_PREVIEW_SALES_PDF_BATCH.json
```

## `validateSalesOrderPdfBatch.py`

Tests the generated batch preview: preview-only safety flags, relative document
paths, hashes, minimum door-position fields and supplementary-product quantity.
It writes a deterministic validation JSON and can return a non-zero exit code
only when `--fail-on-error` is explicitly requested. Missing Sales quantities
are review warnings, not an invented one-piece value; unsafe paths, hashes and
missing required names remain errors. It also flags position opening dimensions
outside the conservative review range (width 300–5000 mm, height 1200–5000 mm,
wall depth 30–2000 mm); this is a review gate, not a manufacturing tolerance.

```powershell
python .\scripts\validateSalesOrderPdfBatch.py `
  --input-json .\IMPORT_PREVIEW_SALES_PDF_BATCH.json `
  --output-json .\IMPORT_REVIEW_SALES_PDF_BATCH_VALIDATION.json `
  --fail-on-error
```

```powershell
python .\scripts\previewSharePointDocumentMetadata.py `
  --input-xlsx "C:\path\Fájlok_Módositás_dátuma.xlsx" `
  --output-json ".\IMPORT_PREVIEW_SHAREPOINT_DOCUMENT_METADATA.json"
```

## Verification

```powershell
npm run test -- legacyImportPreview.unit.test.ts legacyManufacturedItemScan.unit.test.ts manufacturedItemPreview.unit.test.ts sharePointDocumentMetadata.unit.test.ts
```

## `seedUxReferenceProject.ts`

Creates the stable, fictitious `UX-REFERENCE-RETROFIT-001` project through the
normal order, evidence, approval, component and operation HTTP commands. The
command is idempotent at project-key scope: it replaces only that reserved
fixture and never clears another project or a whole table. It requires a
loopback PostgreSQL URL, the allowlisted `doorstar_production` database name,
an explicit schema and `--confirm-ux-reference-seed`. Local `public`
additionally requires `--confirm-local-development-database`. Neither
confirmation can override the database-name allowlist.

```powershell
$env:DATABASE_URL='postgresql://doorstar:doorstar@localhost:5462/doorstar_production?schema=public'
npm run seed:ux-reference -- --confirm-ux-reference-seed --confirm-local-development-database
```

Targeted verification:

```powershell
npm run test:unit -- --run tests/uxReferenceProject.unit.test.ts
npm test -- --run tests/uxReferenceProject.test.ts
```

## `inspectCadReferences.py`

Indexes DWG/DXF files as source-backed drawing references. DWG header/version,
hash and work-number candidate are safe metadata; the script deliberately does
not infer geometry or dimensions from binary DWG. A controlled temporary
DWG-to-DXF export plus visual/technical review is required before a drawing can
resolve a technical field.

```powershell
python .\scripts\inspectCadReferences.py `
  --source 'SALES_FOLDER=C:\source\01 - Megrendelés' `
  --source 'LEGACY_2026=C:\source\2026' `
  --output-json .\IMPORT_PREVIEW_CAD_METADATA.json
```

## `mergeCadReferencePreviews.py`

Combines separately generated CAD metadata previews without reading or changing
the source folders again. It rejects non-preview payloads, duplicate locators
and invalid content hashes, then recomputes cross-root duplicate groups.

```powershell
python .\scripts\mergeCadReferencePreviews.py `
  --input-json .\IMPORT_PREVIEW_CAD_SALES_FOLDER.json `
  --input-json .\IMPORT_PREVIEW_CAD_LEGACY_2026.json `
  --output-json .\IMPORT_PREVIEW_CAD_METADATA.json
```

## `previewDxfTextEvidence.py`

Reads ASCII DXF text and DIMENSION entity evidence without changing the source.
The entity index is review evidence only: drawing units and the entity's product
scope must be verified by a technical reviewer before any technical field is
selected.

```powershell
python .\scripts\previewDxfTextEvidence.py `
  --source 'LEGACY_2026=C:\source\2026' `
  --output-json .\IMPORT_PREVIEW_DXF_TEXT_EVIDENCE.json
```

## `preflightSalesPdfDraft.ts`

Transforms one uniquely selected Sales-PDF preview into the exact
`apply-draft` API shape and validates it with the live Zod contract. It is
strictly preview-only: it does not create an `ImportRun`, make an HTTP call or
connect to a database. A valid payload is still review-gated until the survey
and technical preparation confirm its fields.

```powershell
npx tsx .\scripts\preflightSalesPdfDraft.ts `
  --input-json ..\..\docs\projects\doorstar-order-data-chain\IMPORT_PREVIEW_SALES_PDF_BATCH.json `
  --work-number 26135 `
  --document-sha256 20ff428ea3322305fd8002b765ed2f439f8908094c256c6c7e0fdb778ef179ad `
  --output-json ..\..\docs\projects\doorstar-order-data-chain\IMPORT_PREVIEW_DSMR_26135_DRAFT_PREFLIGHT.json
```

If a work number has multiple different Sales-PDF content hashes, the explicit
`--document-sha256` selection is mandatory. Same-content copies are grouped;
the Sales-folder reference is preferred as the canonical reference while the
copy count remains review evidence.

## `rankSalesPdfImportReadiness.py`

Ranks all canonical work-number groups from the Sales-PDF batch according to
revision ambiguity, basic position completeness, opening-dimension completeness
and delivery-date quality. Complete dimensions must additionally fit the
conservative review range used by the validator. The result is a review queue,
never an auto-import list.

```powershell
python .\scripts\rankSalesPdfImportReadiness.py `
  --input-json ..\..\docs\projects\doorstar-order-data-chain\IMPORT_PREVIEW_SALES_PDF_BATCH.json `
  --output-json ..\..\docs\projects\doorstar-order-data-chain\IMPORT_REVIEW_SALES_PDF_READINESS.json
```

## `inspectSalesPdfTableRows.py`

Exports the raw `pdfplumber` cell order for candidate Sales position rows. Use
it only to diagnose a layout-specific parser discrepancy found by preflight or
visual review; it produces review JSON and has no write path to source systems.

```powershell
& 'C:\Users\szant\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  .\scripts\inspectSalesPdfTableRows.py `
  --input-pdf 'C:\source\DSMR 26109.pdf' `
  --output-json .\IMPORT_REVIEW_DSMR_26109_PDF_TABLE_ROWS.json
```

## `inspectDeadlineWorkNumber.py`

Reads every cached-value row containing one exact work number from an XLSX or
XLSM deadline workbook. It retains sheet/row/header context so contractual,
planned and note values can be compared without treating any of them as an
actual completion event.
Rows found through the optional customer/name query are explicitly marked
`TEXT_FALLBACK`; only `WORK_NUMBER_EXACT` is eligible for a project link.

```powershell
python .\scripts\inspectDeadlineWorkNumber.py `
  --input-xlsx 'C:\source\03 - Határidők\Ütemterv.xlsx' `
  --source-label DEADLINES `
  --source-relative-path 'Ütemterv.xlsx' `
  --work-number 25164 `
  --text-query 'Arador' `
  --output-json .\IMPORT_REVIEW_DSMR_25164_DEADLINE_ROWS.json
```
