# Doorstar legacy order-data processing procedure

## Objective

Convert legacy Doorstar materials into searchable, source-backed Project,
Sales-order, position, manufactured-item, document-reference and deadline data.
The procedure protects the original documents and makes no undocumented
historical claim.

## Non-negotiable safeguards

- Source folders are read-only. Do not create, rename, copy, alter or delete a
  source file.
- Never run XLSM macros, formulas, Excel, Power Query or external links. Read
  cached OOXML values only.
- Ignore `.bak`, `.dwl`, `.dwl2`, `~$*`, lock and cache files.
- Store document references as a source-root label plus relative path and hash;
  never store an absolute Windows path in the application.
- Every new work number creates a new Project, even when the customer matches.
- Production/public database writes are prohibited. A reviewed test import may
  write only to the local `doorstar_test` schema and must carry an ImportRun ID.

## Source authority order

| Order | Source | Authoritative use | Never infer |
| --- | --- | --- | --- |
| 1 | Sales `GYÁRTÁSMEGRENDELÉS` PDF | Sales request, customer, Sales positions, opening dimensions, initial type/direction, accessories | technical finality, door-leaf dimensions, glazing when absent |
| 2 | Felmérés | final technical decision after review | events not documented in the source |
| 3 | CAD/drawing | resolve a specific missing or conflicting technical field | bulk technical data without human confirmation |
| 4 | Primary finished-size XLSM/XLSX sheet | independent wall-panel/furniture-front manufacturing item | quantity from template, calculator or Kiíró duplicate |
| 5 | `Ütemterv.xlsx` | planned/reported milestones and communication notes | undocumented actual delivery or installation |
| 6 | SharePoint query metadata | document last-modified evidence | order date, production time or delivery time |

## Per-project workflow

### 1. Discover the package

1. Identify candidate work numbers from the folder and filenames.
2. Create a document inventory of PDFs, DWGs, XLSX and XLSM files.
3. Exclude temporary and backup files.
4. If a filename work number conflicts with the enclosing folder, retain the
   filename candidate and create a review issue; do not force the folder ID.

### 2. Process the Sales PDF first

1. Find each file named `GYÁRTÁSMEGRENDELÉS`.
2. Run `extractSalesOrderPdfPreview.py` for one document or
   `previewSalesOrderPdfBatch.py` for a source root.
3. Capture Sales header, customer, contact, delivery address and delivery text.
4. Capture each door position: code, name, quantity, opening width, opening
   height, wall thickness, type, opening direction, explicit blende, locks,
   hardware, colour/pattern and notes.
5. Treat opening measurements as **width × height × wall thickness**, in mm.
   The third source measurement maps to `openingDepthMm`; it is never an
   inferred door-leaf thickness.
6. Save each field as page/row evidence. Sales values remain `REVIEW` until the
   survey/technical review confirms them.

### 3. Preserve supplementary products

1. Extract hardware, lock bodies, skirting, trim and similar non-door products
   from the Sales PDF.
2. Store them as `SalesOrderSupplementaryProductCandidate`, with quantity,
   description, notes and source evidence.
3. Where explicit, preserve linear metres per piece and an auditable calculated
   total.
4. Do not classify these as `OrderPosition`, wall panel or furniture front.
   They await the reviewed `OrderSupplementaryItem` application model.

### 4. Reconcile Sales and survey data

1. Match by work number and position code; use name only as supporting evidence.
2. Compare field by field: opening dimensions, type, direction, wall treatment,
   glazing, surface and notes.
3. If equal, retain both evidence records.
4. If different, preserve both values, create a review task and let the surveyor
   or technical preparer select the final value. Do not overwrite automatically.
5. Missing Sales data stays `null`; never fill it from a guess.

### 5. Extract wall panels and furniture fronts

1. Scan only cached values from the primary `Készméret - Falpanel` and
   `Készméret - Bútorfront` sheets.
2. Require code, meaningful name/type, width, height/length and positive
   quantity before creating a candidate.
3. Convert explicit cm source dimensions to mm and retain original unit/value.
4. Save material, finish, colour, pattern and notes as field evidence.
5. Treat repeated Kiíró, calculator and blank template rows as schema evidence
   only. They must never create a production quantity.

### 6. Reconcile document versions and work numbers

1. Group identical content by SHA-256. Keep all document references but flag the
   group as a same-content copy.
2. Group source labels by canonical numeric work number without changing the
   original source identifier.
3. Labels such as `mód.`, `újragyártás` or phase markers require an explicit
   decision: same revision, rework/replacement, phase, or distinct Project.
4. Numeric similarity alone must never merge Projects or overwrite positions.

### 7. Process deadlines and operational events

1. Read `Ütemterv.xlsx` only from cached values.
2. Map explicit fields separately: expected date, Sales order posted, production
   release, planned production end, scheduled delivery and reported installation.
3. Record conflicting dates as a review issue, not as a calculated delay.
4. Treat partial delivery or partial installation as `PARTIAL`; never close the
   entire Project from a partial statement.
5. Use SharePoint `Módosítva` only as document-version evidence. Do not use local
   filesystem dates after synchronisation.
6. Missing actual events remain `UNKNOWN`/empty.
7. An installation or hand-over template proves an actual event only when its
   relevant item quantities/status are completed and it has a recipient/date
   confirmation or an equivalent explicit completion statement. Pre-filled
   checklist labels such as `Kész` in an otherwise blank template are not an
   actual delivery or installation event.

## Data-quality gates

| Record | Minimum data for a preview candidate | Automatic action |
| --- | --- | --- |
| Sales Project/DRAFT | work number, customer, at least one Sales position, Sales PDF reference | preview only |
| Door position | code, name, positive quantity; dimensions/type/direction when present | `REVIEW` evidence |
| Manufactured wall panel/front | code, type/name, positive quantity, width, height and thickness | API-shaped `REVIEW` candidate |
| Supplementary product | code/name, positive quantity and Sales-PDF evidence | `REVIEW`, no current DB model |
| Deadline | explicit source row and labelled field | reviewable planned/reported event |

## Review and test-import procedure

1. Review the source preview in the Import Inbox or its JSON artifact.
2. Resolve conflicts and confirm the selected technical values.
3. Create a new Project and a Sales DRAFT only for the chosen work number.
4. Attach metadata-only document references and field-level evidence.
5. Create independent ManufacturedItems only for reviewed primary finished-size
   candidates; review them before moving the order revision forward.
6. Apply only to `doorstar_test`, tagged with the ImportRun ID.
7. Verify created Project, revision, positions, document references, evidence and
   review state. Production/public stays untouched.

## Completion record

For each processed package, append to `IMPORT_WORKER_HANDOFF.md`:

- work number and customer;
- authoritative Sales PDF and source hash/reference;
- position, panel/front and supplementary-product counts;
- missing data and contradictions;
- deadline/partial-completion interpretation;
- preview artifact locations;
- whether any `doorstar_test` write occurred.

Update `terminals/import-discovery/memory.md` and `state.md` after every major
batch or new extraction rule.

## CAD examination procedure

1. Run `inspectCadReferences.py` to record each DWG/DXF's relative path, hash,
   file format/version and work-number candidate.
2. Link the drawing to the relevant Sales-PDF position only as source evidence.
3. For a needed geometric value, export a **temporary copy** to DXF using an
   approved DWG converter; never modify or overwrite the source DWG.
4. Parse the temporary DXF with a trusted CAD parser and visually review the
   matching dimension/entity with a technical reviewer.
5. Save the selected value with drawing path/hash/entity or page evidence, and
   preserve the conflicting Sales/survey value if one exists.
6. Without an approved converter and review, DWG remains a document reference;
   no geometry or manufacturing dimension is inferred from binary bytes.

### CAD conversion preservation rule

1. A source DWG/DXF is always read-only input. It must never be opened for
   save, overwritten, renamed, moved or replaced by the conversion workflow.
2. Run an approved converter only against an explicitly created temporary
   working directory outside every legacy source root and outside the
   repository. The converter output is a new temporary DXF copy.
3. Record the source relative path, source SHA-256, converter name/version,
   temporary-output hash and conversion run ID in the review evidence.
4. Recalculate the original source SHA-256 after conversion. A mismatch stops
   the run and is investigated before any CAD evidence is used.
5. Do not copy original DWG/DXF business binaries into the repository. Retain
   only JSON evidence, relative document references and approved field values.
6. Delete the temporary conversion output only after the review record is
   complete; it is never a replacement for the source document.

## Tested process corrections

1. Validate every full Sales-PDF batch with
   `validateSalesOrderPdfBatch.py --fail-on-error` before any review queue is
   published.
2. An absent or unreadable source quantity is `null` plus a review warning. It
   must never become an assumed quantity of one. Missing identity, unsafe
   document reference, missing hash or non-preview safety flags are blocking
   errors.
3. Build the CAD metadata index before CAD reconciliation. The index proves
   document identity and potential work-number linkage only; it cannot prove
   a width, height, thickness, opening direction or material.
4. Treat DXF entity extraction and DWG-to-DXF conversion as a separately
   approved, repeatable review stage. Store the converter/parser version and
   the reviewed entity reference alongside any value selected from a drawing.
5. Before a preview becomes an API-shaped DRAFT payload, run
   `preflightSalesPdfDraft.ts`. It uses the current API Zod contract but has no
   database connection or HTTP call.
6. A work number with multiple different Sales-PDF content hashes requires a
   reviewer to select the precise SHA-256. The preflight rejects it without
   `--document-sha256`. Same-content copies may use the Sales-folder copy as
   the canonical reference, while retaining the copy count as evidence.
7. `contractValid` means only that the payload can be stored as a mutable
   `SALES_DRAFT`. It never means that survey verification, technical review,
   approval, planning or a database apply is allowed.
8. Validate every position's field evidence with the
   `createOrderPositionEvidenceSchema` before applying a DRAFT. After a
   controlled DRAFT write, create evidence only through the position-evidence
   route, linked to the returned position ID and Sales document ID. It remains
   `REVIEW` until the survey/technical reviewer resolves it.
9. The Sales-PDF batch must resolve a work number in this order: readable
   Sales header; otherwise a filename/path fallback marked `REVIEW`; otherwise
   `UNRESOLVED`. If a readable header and filename disagree, retain both and
   block automatic project linkage.
10. Table-parser layout exceptions may be recognised only by an explicit,
    testable pattern. For the observed `SHIFTED_AFTER_NAME` layout, an empty
    cell after the position name plus three following numeric opening values
    shifts all technical columns by one. Record the parser layout and keep the
    normal technical-review gate.
11. A non-plausible header extraction is `null`, never a substitute value. In
    particular, a document date must not become expected delivery, and a
    concatenated address/note must not become a delivery address.
12. A numeric cell split into individual glyphs by PDF table extraction may be
    rejoined only when the entire cell consists of digits separated by
    whitespace (for example `7 1` means `71`). Preserve the raw evidence.
    Before a Sales position reaches the technical-review queue, require a
    conservative plausibility check: opening width 300–5000 mm, height
    1200–5000 mm and wall thickness 30–2000 mm. A value outside that range is
    a review warning, not a corrected or automatically approved measurement.
13. In cached Excel values, a five-digit numeric work number can numerically
    overlap Excel's date serial range. When a column is labelled as an order or
    work number, retain the raw integral number as the identifier; do not
    format it as a date. Date conversion remains valid only for labelled date
    fields.
