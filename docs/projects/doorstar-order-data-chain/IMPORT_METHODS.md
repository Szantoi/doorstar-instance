# Doorstar import discovery methods

## Purpose

Turn the existing Sales, survey, drawing, spreadsheet and deadline materials
into searchable, source-backed Doorstar records without inventing missing
historical events. Every result remains a preview or `REVIEW` candidate until a
person confirms the technical interpretation.

## Method sequence

1. **Sales-PDF-first batch index**

   Read every `GYÁRTÁSMEGRENDELÉS` PDF first. Extract header, customer, delivery
   text, door positions, opening dimensions, direction, type, blende and
   accessories. Preserve PDF page/table row provenance and a source hash.

2. **Machine-readability split and selective OCR**

   A PDF with no extractable text/table becomes a separate `OCR_REVIEW` record;
   it is never silently skipped. OCR is then applied only to that small set, with
   the rendered page retained for human verification. Native text PDF results and
   OCR results must stay distinguishable by confidence.

3. **Position-level Sales versus survey reconciliation**

   Match by work number and position code. Compare width, height, wall depth,
   type, opening direction, wall treatment, glazing and notes field by field.
   Sales is the request; the survey owns the technically final value. Any mismatch
   creates `OrderPositionEvidence` and a review task instead of overwriting data.

4. **Finished-size item extraction**

   Read the primary `Készméret - Falpanel` and `Készméret - Bútorfront` sheets
   only from cached OOXML values. Create a panel/front candidate only when code,
   width, height/length and quantity are present. Kiíró, calculator and repeated
   template rows are evidence, never quantity proof.

5. **Supplementary-product lane**

   Keep hardware, locks, skirting, trim and other Sales-ordered non-door items
   separately. They must become reviewed `OrderSupplementaryItem` records once
   that model is implemented; they must not be misclassified as doors, panels or
   furniture fronts.

6. **Version and duplicate clustering**

   Group exact same-content PDFs by SHA-256. Separately group source work-number
   variants by canonical numeric work number. A label such as `mód.` or
   `újragyártás` triggers review; it never causes automatic project merging.

7. **Deadline and actual-event separation**

   Map only explicit `Ütemterv.xlsx` milestones and documented installation or
   delivery statements. The SharePoint `Módosítva` value is document-version
   evidence only. Local Windows file dates are excluded after resynchronisation.
   Missing real events stay `UNKNOWN`/empty.

8. **Drawing and CAD cross-linking**

   Store PDF/DWG filenames and relative paths as document references. Use the
   drawing only to resolve a specific missing/contradictory technical field, and
   preserve the drawing reference beside the reviewed field. Do not bulk-derive
   dimensions from unverified drawing text.

   The first CAD pass is metadata-only (format, SHA-256, relative locator and
   work-number candidate). ASCII DXF can then expose TEXT/MTEXT and DIMENSION
   entities as review evidence. Each selected value must retain the DXF entity
   index, confirmed drawing unit and technical-review decision. DWG needs an
   approved temporary DWG-to-DXF conversion before the same review process.

9. **Parser exception and readiness feedback loop**

   Validate representative real Sales PDFs through the API-contract preflight.
   A field shift, concatenated header or missing work number is a parser/data
   quality issue, not a value to be guessed. Add a narrow, evidence-backed
   layout rule; rerun the sample and an unchanged regression sample; then
   rebuild the full read-only batch and its readiness queue. The readiness
   queue ranks only Sales-PDF quality, never replaces survey, deadline or CAD
   reconciliation.

10. **Component proposal and RAG lineage boundary**

   Treat `ORDER_POSITION`, verified `MANUFACTURED_ITEM` and verified
   `SUPPLEMENTARY_ITEM` links as lineage only. Never copy their quantity,
   dimensions, material, finish or a legacy Excel/PDF formula into a component
   row. Future literature/RAG and profile-drawing extraction must emit the
   exact document version and relative path, source locator, raw and normalized
   values, candidate component key, rule key/version, profile fingerprint and
   human review state/resolution. Keep physical `SIDE_A/SIDE_B` independent
   from profile-specific casing role `FIXED/ADJUSTABLE`. Import/RAG creates
   only open evidence; it never writes a final state, resolution,
   `reviewedByRole` or `reviewedAt`. Those values belong exclusively to the
   audited backend review action.

11. **Review prioritisation**

   Triage first: machine-readable Sales PDF + complete position dimensions +
   distinct work number + known source documents. Hold for review: conflicting
   variants, template-only finished-size lists, missing quantity/dimensions,
   OCR-only documents and incomplete deadline evidence.

12. **Controlled test import**

   Create a new Project and Sales DRAFT only after the preview and review are
   accepted. Attach relative document references and field evidence. Write only
   to `doorstar_test`, tagged with an ImportRun ID; production/public remains
   outside the workflow.

## Current reusable tools

- `extractSalesOrderPdfPreview.py`: one authoritative Sales PDF.
- `previewSalesOrderPdfBatch.py`: all Sales PDFs, duplicate and work-number
  clustering.
- `scanLegacyManufacturedItems.py`: panel/front source evidence.
- `extractManufacturedItemPreview.py`: API-shaped review candidates.
- `previewSharePointDocumentMetadata.py`: server-side document modification
  and exported folder metadata, not business-event timing.
- `sharePointMetadataRules.py`: shared pure relevance, work-number and strong
  package-evidence rules; no I/O, macro, network or database client.
- `simulateSharePointMetadataCatalog.py`: deterministic virtual folder,
  document and project-package catalog with source fingerprint; preview-only,
  no SharePoint or database connection. It recomputes the shared semantic
  mapping and fails closed on altered upstream labels.
