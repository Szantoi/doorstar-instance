# Legacy import scripts

These tools are source-read-only and deterministic. They do not run Excel,
VBA, formulas or Power Query, and none has a database-writing mode.

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
that missing evidence.

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

```powershell
python .\scripts\previewSharePointDocumentMetadata.py `
  --input-xlsx "C:\path\Fájlok_Módositás_dátuma.xlsx" `
  --output-json ".\IMPORT_PREVIEW_SHAREPOINT_DOCUMENT_METADATA.json"
```

## Verification

```powershell
npm run test -- legacyImportPreview.unit.test.ts legacyManufacturedItemScan.unit.test.ts manufacturedItemPreview.unit.test.ts sharePointDocumentMetadata.unit.test.ts
```
