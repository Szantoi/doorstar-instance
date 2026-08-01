# Doorstar dokumentumtípusok és forrásmezők

- Document ID: `doorstar.documents-source-fields`
- Version: `1.0.0`
- Valid from: `2026-07-31`
- Review status: `READY_FOR_HUMAN_REVIEW`
- Owner: `doorstar-import-discovery`
- Sensitivity: `INTERNAL`

## Hatókör

A dokumentum forrástípusok és mezők általános üzleti jelentését rögzíti.
Nyers dokumentumot, ügyfélértéket és rendelési sort nem tartalmaz.

## Állítások

| Claim ID | Minősítés | Állítás | Forráshely és forráshash |
| --- | --- | --- | --- |
| DOC-001 | VERIFIED | Az eredeti PDF, XLSX, XLSM, DWG és kép a read-only forrástárban vagy később SharePointban marad; a repository és a rendelési adatbázis csak metaadatot, relatív hivatkozást és szükséges kivonatot kezel. | SRC-ORDER-PROJECT@sha256:27306ae26b493bc17d60f9a8f5bd68ab235f5697d114c86fe80e6209bced5c5e#excel-migracio-es-dokumentumkezeles |
| DOC-002 | VERIFIED | A `GYÁRTÁSMEGRENDELÉS` PDF a Sales kérésének és pozícióinak elsődleges kiinduló forrása, de műszaki véglegességet nem bizonyít. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#source-authority-order |
| DOC-003 | VERIFIED | A felmérés review után a végleges műszaki döntés authority-forrása; nem igazol olyan eseményt, amelyet a forrás nem dokumentál. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#source-authority-order |
| DOC-004 | VERIFIED | CAD vagy rajz csak konkrét hiányzó vagy ellentmondó műszaki mező feloldására használható, forráslokátorral és emberi megerősítéssel; tömeges, automatikus műszaki authority nem képezhető belőle. | SRC-ORDER-IMPORT-METHODS@sha256:bd1e467b990554ced2b2c7f5895473592e8ab39e0b728a4d45451e1dd751bac0#drawing-and-cad-cross-linking |
| DOC-005 | VERIFIED | Önálló falpanel vagy bútorfront jelölt elsődleges készméret-munkalap címkézett és kitöltött sorából képezhető; üres sablon, Kiíró- vagy kalkulátorduplikátum nem bizonyít mennyiséget. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#extract-wall-panels-and-furniture-fronts |
| DOC-006 | VERIFIED | Az `Ütemterv.xlsx` tervezett vagy közölt mérföldkövek és Sales-kommunikáció forrása; dokumentálatlan tényleges kiszállítás vagy beépítés nem vezethető le belőle. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#source-authority-order |
| DOC-007 | VERIFIED | A SharePoint `Módosítva` érték dokumentumverzió-metaadat, nem rendelésfelvételi, gyártási, kiszállítási vagy beépítési időpont. | SRC-ADR-SHAREPOINT-READONLY-SOURCE-CATALOG@sha256:46bf388043b5699cd2e7f032a8e6f9de197f81eb55adede5f14fb8c4590d807e#kovetkezmenyek |
| DOC-008 | VERIFIED | A Sales-forrástérben a PDF, DWG, XLSX és XLSM releváns dokumentumjelölt lehet; a kiterjesztés önmagában nem bizonyít authorityt vagy műszaki helyességet. | SRC-ORDER-SALES-SURVEY-WORKFLOW@sha256:f0a29a6d6dc310be25077586ba47b37d7a670a845e0a83d764d8aadb5e413414#sales-dokumentumatadas |
| DOC-009 | VERIFIED | A `.bak`, `.dwl`, `.dwl2`, Office `~$` ideiglenes, lock- és cache-állomány kizárandó. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#non-negotiable-safeguards |
| DOC-010 | VERIFIED | XLSM feldolgozáskor csak a tárolt OOXML-adat és struktúra olvasható; VBA-makró, képlet, Power Query és külső hivatkozás nem futtatható. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#non-negotiable-safeguards |
| DOC-011 | VERIFIED | Dokumentumhivatkozásként forrásroot-címke, POSIX relatív út, fájltípus, pontos lokátor és SHA-256 tárolható; abszolút Windows-út nem alkalmazásadat. | SRC-ORDER-IMPORT-MAPPING@sha256:9b7d4fc739ed8c813e44726eaa3b910d5d88cc9a7550fa1bc576fdd989f9f237#document-reference-mapping |
| DOC-012 | VERIFIED | A dokumentum kiterjesztésből vagy útból képzett típusa csak jelölt; a Sales-megrendelés, felmérés, rajz és egyéb kategória review-val válik megbízható metaadattá. | SRC-ORDER-IMPORT-MAPPING@sha256:9b7d4fc739ed8c813e44726eaa3b910d5d88cc9a7550fa1bc576fdd989f9f237#document-reference-mapping |
| DOC-013 | VERIFIED | A munkaszám-jelölt `Project.key` és külön `Project.num` mezőre képezhető, de új rekord és duplikátumellenőrzés szükséges; ügyfélazonosság nem projekt-összekapcsolási kulcs. | SRC-ORDER-IMPORT-MAPPING@sha256:9b7d4fc739ed8c813e44726eaa3b910d5d88cc9a7550fa1bc576fdd989f9f237#project-and-order-mapping |
| DOC-014 | VERIFIED | Pozícióból a kód, név és pozitív egész mennyiség automatikus jelölt lehet; típus, nyitás, falnyílás- és ajtólapméretek csak mértékegység- és felmérési review mellett válnak műszaki adattá. | SRC-ORDER-IMPORT-MAPPING@sha256:9b7d4fc739ed8c813e44726eaa3b910d5d88cc9a7550fa1bc576fdd989f9f237#position-mapping |
| DOC-015 | VERIFIED | A két oldali felület, falpanel vagy blende és üvegezés mezőcsoportját nem szabad egyetlen általános értékké összecsukni; célfelület-, típus- és felmérési review kell. | SRC-ORDER-IMPORT-MAPPING@sha256:9b7d4fc739ed8c813e44726eaa3b910d5d88cc9a7550fa1bc576fdd989f9f237#position-mapping |
| DOC-016 | VERIFIED | Több ütemterv-munkalap ugyanazt a mérföldkövet is leírhatja; reviewed munkaszám és forrásverzió alapján kell egyeztetni, nem szabad minden sort külön tényleges eseményként létrehozni. | SRC-ORDER-IMPORT-MAPPING@sha256:9b7d4fc739ed8c813e44726eaa3b910d5d88cc9a7550fa1bc576fdd989f9f237#deadline-workbook-mapping |
| DOC-017 | VERIFIED | Üres vagy előre kitöltött átadás-átvételi sablon nem bizonyít tényleges kiszállítást vagy beépítést; explicit teljesítési adat és megerősítés szükséges. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#process-deadlines-and-operational-events |
| DOC-018 | VERIFIED | A teljes Source Catalog külön bounded context az `OrderDocument`-től; csak ember által feloldott, pontos verziójú katalóguslinkből lehet metadata-only rendelési dokumentumhivatkozás. | SRC-ADR-SHAREPOINT-READONLY-SOURCE-CATALOG@sha256:46bf388043b5699cd2e7f032a8e6f9de197f81eb55adede5f14fb8c4590d807e#dontes |
| DOC-019 | OPEN | A DWG tartalomértékek feldolgozásához jóváhagyott, eredetit érintetlenül hagyó ideiglenes DWG–DXF konverziós lánc és rajzi mértékegység-review szükséges. | SRC-ORDER-IMPORT-METHODS@sha256:bd1e467b990554ced2b2c7f5895473592e8ab39e0b728a4d45451e1dd751bac0#drawing-and-cad-cross-linking |

## Minősítési jelmagyarázat

- `VERIFIED`: általános forrás- vagy mezőszabály közvetlen dokumentációval.
- `INFERENCE`: forrásolt, de nem normatív mezőértelmezés.
- `OPEN`: külön emberi vagy technikai jóváhagyásig nem automatizálható.
