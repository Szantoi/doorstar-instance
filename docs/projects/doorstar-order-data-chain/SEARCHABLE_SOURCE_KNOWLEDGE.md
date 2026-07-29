# Searchable legacy-source knowledge layer

## Purpose

Doorstar's existing knowledge is in PDFs, Excel/XLSM workbooks, drawings and
measurement material. The digital system must make that information
searchable for office users and safely retrievable for development work,
without copying business binaries into the repository or treating an
unverified extraction as approved production data.

This is a second, complementary layer to structured order import:

```text
Original document -> searchable evidence -> review candidate -> approved order data
```

Searching a document answers “where is the source?”; the survey and order
workflow answer “is this the final manufacturing value?”.

## Storage boundary

| Layer | Stores | Does not store |
| --- | --- | --- |
| File source | Original PDF, XLSX/XLSM, DWG, image; initially read-only folder, later SharePoint | Repository copy or database BLOB |
| Source catalogue | Relative locator, file type, SHA-256, modified/version metadata, source root, ACL labels | Absolute Windows path as application data |
| Extraction | PDF page text, worksheet headers/cached values, detected table rows, OCR status and extraction errors | Macro execution or formula evaluation |
| Search index | Small text chunks, keywords, entity links, optionally embeddings | Uncited “facts” detached from their source |
| Order domain | Reviewed Project/OrderRevision/Position values | Raw legacy document as authoritative production value |

The catalogue starts with a root label such as `sales`, `deadlines` or
`archive` plus a POSIX relative path. After SharePoint onboarding, that same
record receives a stable `driveId`, `itemId` and `versionId`; callers never
need a local Windows path.

## Indexable content by source type

| Type | First indexable data | Safe treatment |
| --- | --- | --- |
| PDF | Page text, title/order number, position rows, dimensions, delivery clauses | Extract text page by page; scanned pages get `OCR_REQUIRED`, not invented text |
| XLSX/XLSM | Workbook/sheet names, headers, cached cell values, detected tables and source row numbers | Read OOXML only; do not execute VBA, formulas or Power Query |
| DWG/DXF | Filename, title-block/metadata when safely available, related work number and drawing reference | Keep geometry outside v1 text search; link a PDF/Jellegrajz proxy for visual review |
| Images/scans | Filename, work number, capture type and optional reviewed OCR | Do not auto-promote handwritten/low-confidence OCR to technical fields |

The first practical index scope is the Sales order PDF, `Ütemterv.xlsx` and
the known Kalkulátor sheets (`AlapAdat`, `FixOldal`, `MozgoOldal`, `Üveg`).
This covers work numbers, customers, positions, dimensions, surface, wall
treatment, glazing and deadline evidence without attempting full CAD search.

## Proposed data model

The project architecture already describes the future graph as
`SharePointDocumentVersion -> Chunk -> domain entities`. Implement the local
legacy equivalent with these relations, keeping names aligned for a later
SharePoint migration:

```text
SourceDocumentVersion
  -> DocumentExtraction (page / sheet / row / OCR state)
  -> SearchChunk (text + keyword/full-text index + optional embedding)
  -> KnowledgeEntityLink (Project, OrderRevision, Position, ImportCandidate)
```

Suggested fields:

- `SourceDocumentVersion`: source root, relative path, media type, SHA-256,
  source-version timestamp, lifecycle (`ACTIVE`, `SUPERSEDED`, `WITHDRAWN`),
  ACL label, later Graph identity.
- `DocumentExtraction`: document version, locator (`page`, `sheet`, `row`),
  extractor version, raw extracted text/structured JSON, confidence and
  error/OCR state.
- `SearchChunk`: extraction, compact searchable text, deterministic chunk
  hash, PostgreSQL full-text column, optional embedding, inherited ACL.
- `KnowledgeEntityLink`: chunk or extraction to work number/project/revision/
  position with a relation (`MENTIONS`, `DIMENSION_SOURCE`,
  `DEADLINE_SOURCE`, `DRAWING_FOR`) and confidence.

These records are separate from `OrderDocument`: the latter is the order's
approved metadata reference, while the source catalogue may contain an
unmatched or blocked candidate too.

## Search and developer access

Start with PostgreSQL full-text/keyword search and deterministic filters;
add vector similarity only after the keyword results and source citations are
proven reliable.

Every search result must return:

```json
{
  "document": "sales/DSMR 26148/.../Gyártásmegrendelés.pdf",
  "versionHash": "sha256:...",
  "locator": { "page": 1 },
  "excerpt": "...",
  "links": [{ "workNumber": "26148", "relation": "MENTIONS" }],
  "confidence": "EXTRACTED",
  "reviewState": "UNVERIFIED"
}
```

The webapp should expose:

1. a global source search filtered by work number, customer, document type,
   sheet/page and review state;
2. a project-level **Források** panel that shows the exact PDF page or Excel
   row behind a position/delivery candidate; and
3. a visible distinction between `Extracted`, `Survey verified` and
   `Approved` information.

For system development, expose the same read-only retrieval through a narrow
`knowledge/search` API or MCP tool. It must require a query plus optional
project/document filters, enforce ACL filtering before retrieval, return only
small cited excerpts, and audit query, source-version IDs and caller. Agents
and developers should use this retrieval surface rather than direct file
system reads or unbounded database queries.

## Ingestion workflow

1. Discover allowed files and calculate a hash without changing the source.
2. Create/update the source-version catalogue row.
3. Extract only the permitted content for the file type; record errors rather
   than falling back to guessed values.
4. Link recognised work numbers, positions and deadline values as
   `ImportCandidate`/`KnowledgeEntityLink` candidates.
5. Build/rebuild keyword chunks deterministically; preserve extraction and
   parser version.
6. Serve search results with source citation and review state.
7. When the source is renamed, changed or removed, withdraw outdated chunks
   and retain only the audit/provenance permitted by the retention policy.

## First implementation slice

Implement a read-only index for the existing `01 - Megrendelés` and
`03 - Határidők/Ütemterv.xlsx` sources before expanding to the full `2026`
archive. Deliver a source-search endpoint and a project-detail source panel.
It should answer concrete questions such as:

- “Which Sales PDF mentions work number 26148 and what page contains its two
  door positions?”
- “What deadline observations exist for 26147 and which source conflicts?”
- “Which source row supplied the preliminary 840 × 2150 opening dimension?”

No search result may change a Project, OrderRevision, Position, plan or work
package. The only bridge into the order domain remains explicit human review.
