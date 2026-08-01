# Doorstar legacy import discovery

Discovery date: 2026-07-29. Scope was read-only. No source file was changed,
copied into this repository, opened in Office, or executed as a macro.

## Inventory

| Source root | Files | Purpose | Import treatment |
| --- | ---: | --- | --- |
| `01 - Megrendelés` | 352 | Sales handover packages | `LEGACY_FOLDER` document references; only a reviewed order package may initiate a new project |
| `03 - Határidők` | 9 | Delivery and Sales communication | `Ütemterv.xlsx` is the primary deadline source |
| `2026` | 1,263 | Month-organised historical/production archive | Supporting references and workbook-profile discovery only |
| **Total** | **1,624** |  |  |

The relevant source extensions are 821 PDF, 71 DWG, 10 DXF, 250 XLSM, 20
XLSX and one DOCX. The preview recognises PDF/DWG/DXF/Office document
references, but it never copies their binary contents to the repository or
database. Images and videos remain evidence candidates outside this first
structured import.

The current preview found 58 distinct work-number candidates, 1,173 document
candidates, 270 Excel workbooks and 278 deadline rows in `Ütemterv.xlsx`.
These are candidates, not production records.

## Package patterns

`01 - Megrendelés` has current `DSMR <work number> <customer> ...` folders,
some early-measurement packages, and an `_Archiv` subtree. A typical package
contains a sales/order PDF plus nested `CAD`, `Dokumentumok`, `Táblázatok` and
`Jellegrajz` material. The historical `2026` root is organised by month
(`01_Január` … `12_December`) and then by `<work number> - <customer>` job
folders. Both locations contain repeat copies and revisions; a matching name
is not proof that it is the latest version.

The original order/calculation chain appears in recurring variants of:

```text
Gyártásmegrendelő.xlsm -> Kalkulátor.xlsm -> Folyamatok.xlsm -> Kiíró.xlsm
```

Only the Sales handover (`01 - Megrendelés`) is treated as a Sales document
reference. The downstream workbooks help discover fields and position
candidates; they must not silently turn Sales data into approved technical
data.

## Exclusions and safe reading

The preview excludes names starting with `~$` and extensions `.bak`, `.dwl`,
`.dwl2`, `.tmp`, `.temp`, `.lock`, `.lck` and `.cache`. This scan excluded 59
`.bak`, one `.dwl` and one `.dwl2` file. The policy also covers Office lock
and future cache files even when none is present in this snapshot.

XLSM is read as a ZIP/XML container only. The scanner ignores
`vbaProject.bin`, never evaluates formulas and never invokes Excel. It found
250 macro containers and reported each as `macro_container_read_as_data_only`.

## Workbook profiles and fields

The 250 XLSM and 20 XLSX files are not one uniform import format. Recurring
Kalkulátor profile sheets include:

| Sheet/profile | Repeated headers or meaning | Use |
| --- | --- | --- |
| `AlapAdat` | `DSMR`, `Sorszám`, `Ajtó Menyisége`, ajtó megnevezése, falnyílás/ajtó szélesség, magasság/hosszúság, vastagság, típus, nyitás | Position-candidate backbone |
| `FixOldal`, `MozgoOldal` | fixed/moving surface, colour, pattern, blende and wall-panel fields | Technical fragments; review and survey required before joining |
| `Üveg` | glass finish, colour, type, pattern and notes | Glass fragment; review and survey required |
| `Vasalatok`, `Megmunkálás`, `Szabászat` | hardware, machining and cutting inputs | Later production preparation; outside this first intake import |
| `Folyamatok`, planning and Gantt sheets | task, department, start/end, load fields | Downstream planning evidence, not order-header authority |

Header spelling is inconsistent: the observed `Ajtó Menyisége` spelling has
one `n`, while other files use different accents and labels. The preview
normalises case and accents but preserves source values for review.

### `03 - Határidők/Ütemterv.xlsx`

This is the primary deadline and Sales-communication source. It has:

| Sheet | Header row | Important fields |
| --- | ---: | --- |
| `ADAT` | 4 | `MEGR. SZÁMA`, `MEGRENDELŐ NEVE`, `Vállalt szállítási határidő`, `Gyártásra Kiadva`, `Gyártás Tervezett Vége`, `Gyártás elkészült`, contact/notes and product counters |
| `Tervezett_beépítések` | 1 | work number, customer, priority, planned delivery/install, production state and product counters |
| `Ütemterv` | 1 | work number, customer, contractual delivery, `Tervezett beépítés`, production state, contact/notes and product counters |
| `Munka1` | — | empty/no header detected |

The 278 extracted deadline rows span these three non-empty sheets and can be
duplicates or different lifecycle views of the same work number. They are
therefore matched and reviewed, never independently inserted as production
tasks.

## Data-quality findings

- 49 of 58 project candidates had a usable folder-derived name and matching
  deadline candidate; nine need customer/name review.
- 275 of 278 deadline rows carried a recognisable work number; three need
  manual identification.
- The known `AlapAdat` profile yielded 730 position candidates. Three lack a
  recognisable work number, four lack a position name, and all 730 lack a
  cached door-thickness value in this read-only extraction.
- Surface, wall treatment and glazing occur in separate profile sheets. They
  cannot be safely joined as final technical values until the survey confirms
  them.
- Fourteen project candidates have no `AlapAdat` position candidate, so they
  cannot use the atomic Sales-intake endpoint without manual positions.
- Folder/archive duplication and revised filenames make recency ambiguous.
  SHA-256 is emitted for every document candidate, but duplicate content is
  only a review aid, not an automatic version decision.

## Source authority

Every new customer order remains a new `Project`, even for a repeat customer.
Sales supplies document references and preliminary metadata. Only the survey
may finalise product type, dimensions in **width × height × thickness (mm)**,
surface, wall panel/blende/none, glazing specification and opening direction.

## SharePoint metadata discovery (2026-07-29)

The `.iqy` export `Fájlok_Módositás_dátuma.xlsx` contains one `query` sheet
with `Név`, `Módosítva`, `Módosította`, `Elemtípus` and `Elérési út` columns.
It contains 9,297 source rows: 2,974 folder rows and 468 excluded technical
rows are not document candidates, leaving 5,855 document metadata rows. Of
those, 3,977 are potential PDF/DWG/XLSX/XLSM import-document references.
After quarantining ambiguous and weak five-digit matches, 271 strong
DSMR/project-folder package candidates remain. The folder simulation
preserves the 2,974 exported nodes and derives 14 missing ancestors, for 2,988
searchable folder nodes.

The detector finds 105 single filename/path conflicts plus 4 records with
multiple distinct number candidates. Together 109 rows need identity review,
76 among potential import-document types. It finds 1,512 single path-only links
in all metadata, 515 among potential import-document types. Neither class is an
automatic project association.

This establishes a reliable **last modified** time from SharePoint, independent
of the local resynchronisation. It does not establish creation time, actual
delivery or installation time; those require an enriched query/export and/or
confirmed milestone records.

`DSMR-24170` confirms the distinction. Its deadline row records a legacy
2024-12-01 commitment, a 2026-07-06 production-release date and 2026-08-27
scheduled date. The note describes customer-caused deferral, so no
order-to-delivery duration may be inferred from the 2024 date. The planned
release-to-scheduled interval is 52 days and remains a planning measure only.

## DSMR-25219 — Swiss Luxury Kft. panel and timeline sample

The `25219 - Swiss Luxury Kft` package has one primary, structured source:
the `Készméret - Falpanel` sheet in the Sales manufacturing-order XLSM. It
contains 56 unique `WALL_PANEL` rows, each with code (`FP_1`–`FP_56`), cm
width/height/thickness, quantity, EOL Mély MDF, fóliás surface, Renolit
Magnolia Supermatt Classic colour and drawing-based pattern flag. The
Kalkulátor and Kiíró sheets repeat those source rows and are not extra items.

The review-only `IMPORT_PREVIEW_DSMR_25219_WALL_PANELS.json` converts the
explicit source unit to mm. Example: `FP_1` is 235 × 2055 × 18 mm, quantity
1, with the original source sheet, logical row and content hash preserved.

The deadline source has a `Gyártásra Kiadva` value of 2026-03-30, but no
scheduled or actual delivery date. SharePoint metadata has 41 potential
documents for 25219 (last modification 2026-03-31 10:14:44). The enclosing
folder also contains 25159-named documents: those are a separate work-number
candidate, not automatic 25219 records.

## DSMR-25159 — Swiss Luxury Kft. separate second phase

The explicit 25159 documents embedded near the 25219 archive form a separate
order/project candidate. Its primary `Készméret - Falpanel` list has 11
structured wall-panel rows with cm dimensions, quantity, 18 mm source
thickness, fóliás surface, Renolit Magnolia Supermatt Classic colour and
manufacturing notes (for example shadow joint or mitring). The corresponding
`IMPORT_PREVIEW_DSMR_25159_WALL_PANELS.json` is review-only.

The deadline row calls this a second phase. It records production release on
2026-05-15, an explicit furniture-front delivery note for 2026-05-20, and a
2026-06-09 scheduled date for the phase. The front delivery is a partial
delivery, not completion of the two doors and wall panels, so it must not
close the Project or become a total order delivery duration.
## DSMR-25118 — Propellant Kft. incomplete finished-size data

The primary Propellant manufacturing-order XLSM is a macro container and was
read from cached OOXML values only. It has an `Alap adatok` door table with
door-position evidence (for example positions 06–08, opening dimensions,
type, opening direction and panel/blende notes), but the primary `Készméret -
Falpanel` and `Készméret - Bútorfront` lists have blank width, height and
quantity cells.

The scanner reports 168 source occurrences from 11 workbooks, mainly repeated
Kiíró/archive views. Because the primary finished-size rows do not carry the
required measurements and quantity, no panel/front `apiReady` preview is
created. These remain `REVIEW` evidence until a drawing, corrected finished-
size list or human confirmation supplies the missing values. This avoids
mistaking duplicated cutting-sheet views for production quantities.
## DSMR-25163 — Megépít Plusz Kft. API-ready wall-panel sample

The primary `Készméret - Falpanel` sheet has 24 populated, deduplicated wall-
panel rows. The preview has 24 API-ready `REVIEW` records with evidence, cm to
mm conversion and source hash. Each carries EOL Mély MDF, 18 mm thickness,
fóliás finish, Stone Grey Suedette Matt colour and F6 pattern where present.
Example: code 01 is 1200 × 2230 × 18 mm, 1 piece.

The deadline row must be interpreted carefully: it has legacy expected date
2026-02-28, manufacturing order posted 2026-04-17, production release
2026-04-20 and scheduled date 2026-07-21. Its note says that only the curved
wall panel remains outstanding and everything else has been installed. This
is a documented partial-completion state, not a project-delivered event.

## DSMR-26137 — In_Tuition Kft. two finished-size production groups

The primary `26137 - In_Tuition Kft - Gyartasmegrendelő.xlsm` was read only
from cached OOXML values; macros were not run. Its primary finished-size sheets
provide 18 deduplicated wall-panel rows and one furniture-front row. Separate
review-only API previews retain source evidence, a relative source path, source
hash, quantity and cm-to-mm conversion: 18 wall panels and one furniture front.
For example, panel 01 is 105 × 2500 × 18 mm, while the furniture front is
409 × 2318 × 18 mm. Both have EOL Mély MDF / fóliás / Supermatt Kashmir source
attributes; drawing and installation notes remain review evidence rather than
automatically normalised technical data.

No matching work-number or customer-name row exists in `Ütemterv.xlsx`.
Therefore the project has no imported deadline, release, delivery or installation
event from that source; a blank value is intentional and requires human review.
The SharePoint query export has 16 potential import documents for 26137
(`.pdf`, `.dwg`, `.xlsm`), modified from 2026-06-01 through 2026-07-27. The
latest is the manufacturing-order DWG; this is document-version evidence only,
not a manufacturing-completion or delivery timestamp. One CAD `.bak` is excluded.

## DSMR-26145 — Koroknai Richárd: template-shaped panel/front lists

The primary macro container was read from cached values only. It exposes 40
numbered `Egyedi Falpanel` and 40 numbered `Egyedi Bútorfront` template rows,
each with nominal EOL Mély MDF / 18 mm metadata but no cached width, length,
quantity, colour or surface values. The 40 scanner occurrences in its Kiíró
view are repetitions of these empty primary rows, not proof of 80 manufactured
items. Consequently no item preview is API-ready; the group is quarantined
until a measured finished-size list or authoritative drawing is reviewed.

`Ütemterv.xlsx` has a dedicated 26145 row: production release 2026-06-29,
scheduled date 2026-07-20 and expected delivery 2026-07-31. Its note says
personal collection and customer self-installation for furniture cladding.
These are planned/logistics facts, not a confirmed total delivery or installation
event. SharePoint metadata identifies 14 potential `.pdf`/`.xlsm` documents
(2026-06-22 to 2026-06-29 modification range).

## DSMR-26135 — Tormay Zsolt és Tormay Tímea: blank technical templates and schedule conflict

Cached XLSM inspection found 40 wall-panel template rows and 39 furniture-front
template rows, with zero rows containing the required width, length and quantity
together. The 80 scanner occurrences come from two duplicated Kiíró sheets;
neither source establishes manufactured-item quantity. The file does establish
the template material (EOL Mély MDF) and nominal 18 mm thickness, but these
must not create real panel/front records without measured data.

The 26135 deadline row is internally important for review: order posted
2026-06-03, production release 2026-07-03, planned/expected date 2026-07-15,
but scheduled date 2026-08-04. The scheduled date is 20 days after the stated
expected date, so it is a deadline conflict/planning update, not an actual-delay
calculation or completion claim. The SharePoint export has 17 candidate
`.pdf`/`.dwg`/`.xlsm` documents, last modified between 2026-05-18 and 2026-07-03;
the CAD `.bak` was excluded.

## Sales hand-off PDF priority and tested samples

The `GYÁRTÁSMEGRENDELÉS` PDF is a first-class Sales-to-workshop source, not only
a document reference. A reusable macro-free preview extractor retains page/row
evidence, relative paths and SHA-256 source hashes. It does not infer door-leaf
size from the three wall-opening dimensions; the third maps to wall thickness.

For DSMR-26135 the PDF recovers five real door positions although the XLSM
panel/front tabs are blank templates. All five have complete opening dimensions,
direction, type, quantity and explicit tok-side blende evidence. It also carries
two accessory products (five Smart2Lock handle sets and five AGB lock bodies).

For DSMR-26145 the PDF contains no door-position table. It has one supplementary
product: five 2.4 linear-metre skirting strips (calculated source total: 12 linear
metres), colour/material description and no delivery/install scope. It is not a
wall panel or furniture front; it remains review evidence pending a dedicated
supplementary-product record model.
