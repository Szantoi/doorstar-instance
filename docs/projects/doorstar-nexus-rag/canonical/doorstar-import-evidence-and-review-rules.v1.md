# Doorstar import-, evidence- és review-szabályok

- Document ID: `doorstar.import-evidence-review`
- Version: `1.0.0`
- Valid from: `2026-07-31`
- Review status: `READY_FOR_HUMAN_REVIEW`
- Owner: `doorstar-import-discovery`
- Sensitivity: `INTERNAL`

## Hatókör

Ez a dokumentum az örökölt források kontrollált, bizonyítékalapú
feldolgozásának általános szabályait tartalmazza. Nem import-preview és nem
adatbázis-módosító utasítás.

## Állítások

| Claim ID | Minősítés | Állítás | Forráshely és forráshash |
| --- | --- | --- | --- |
| IMPORT-001 | VERIFIED | A legacy forrásmappák read-only bemenetek; bennük fájlt létrehozni, átnevezni, másolni, módosítani vagy törölni tilos. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#non-negotiable-safeguards |
| IMPORT-002 | VERIFIED | A preview minden mezőhöz megőrzi a relatív forrást, forráshash-t, pontos page, sheet, row, cell vagy rajzi lokátort, a nyers értéket, a normalizált értéket és a review-állapotot. | SRC-ORDER-IMPORT-METHODS@sha256:bd1e467b990554ced2b2c7f5895473592e8ab39e0b728a4d45451e1dd751bac0#method-sequence |
| IMPORT-003 | VERIFIED | A Sales-érték kérésként, a felmérés értéke technikai döntési forrásként kezelendő; eltéréskor mindkét evidence megmarad és ember választ, automatikus felülírás nincs. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#reconcile-sales-and-survey-data |
| IMPORT-004 | VERIFIED | Hiányzó forrásérték `null` vagy ismeretlen marad; becslésből, névből vagy másik mezőből nem tölthető ki hallgatólagosan. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#reconcile-sales-and-survey-data |
| IMPORT-005 | VERIFIED | Azonos tartalmú fájlok SHA-256 alapján csoportosíthatók, de minden dokumentumhivatkozás megmarad; ugyanaz a hash nem dönti el az üzleti revíziót. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#reconcile-document-versions-and-work-numbers |
| IMPORT-006 | VERIFIED | Munkaszám-variáns, módosítás-, újragyártás- vagy fázisjelölés review-köteles; numerikus hasonlóság alapján Project nem vonható össze és pozíció nem írható felül. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#reconcile-document-versions-and-work-numbers |
| IMPORT-007 | VERIFIED | Önálló falpanel vagy bútorfront jelölthöz kód, értelmes név vagy típus, pozitív mennyiség és explicit méretek szükségesek; forrásegység és átváltás megőrzendő. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#extract-wall-panels-and-furniture-fronts |
| IMPORT-008 | VERIFIED | A Salesben szereplő vasalat, zár, szegőléc, takaró és más nem ajtótermék külön `OrderSupplementaryItem` lane-be kerül; nem osztályozható ajtópozícióvá, falpanellé vagy bútorfronttá. | SRC-ADR-ORDER-SUPPLEMENTARY-ITEMS@sha256:1aaa236f9ce51f29a477af6a2e9240e170c4fe0b09a0dcde05294b9cceea59b7#dontes |
| IMPORT-009 | VERIFIED | Forrásból származó evidence csak `UNVERIFIED` vagy `REVIEW` állapotban hozható létre; import vagy RAG nem írhat végleges resolution, reviewer-szerep vagy review-idő metaadatot. | SRC-ADR-SUPPLEMENTARY-EVIDENCE-REVIEW-GATE@sha256:397c9d8c66b81f7207e61255731d913ddfa99aa11990bca65d24ded9548ff042#dontes; SRC-ORDER-IMPORT-METHODS@sha256:bd1e467b990554ced2b2c7f5895473592e8ab39e0b728a4d45451e1dd751bac0#component-proposal-and-rag-lineage-boundary |
| IMPORT-010 | VERIFIED | Forrásból származó supplementary vagy manufactured szülőtétel csak legalább egy evidence és minden evidence auditált `RESOLVED` döntése mellett válhat `VERIFIED` állapotúvá. | SRC-ADR-SUPPLEMENTARY-EVIDENCE-REVIEW-GATE@sha256:397c9d8c66b81f7207e61255731d913ddfa99aa11990bca65d24ded9548ff042#dontes; SRC-ADR-SUPPLEMENTARY-EVIDENCE-REVIEW-GATE@sha256:397c9d8c66b81f7207e61255731d913ddfa99aa11990bca65d24ded9548ff042#kiterjesztes-gyartott-tetelekre |
| IMPORT-011 | VERIFIED | A forráshivatkozás kizárólag lineage: mennyiséget, ajtóméretet, anyagot, felületet vagy legacy képletet nem másol automatikusan komponenssorba. | SRC-ORDER-IMPORT-METHODS@sha256:bd1e467b990554ced2b2c7f5895473592e8ab39e0b728a4d45451e1dd751bac0#component-proposal-and-rag-lineage-boundary |
| IMPORT-012 | VERIFIED | A komponensjavaslatnak dokumentumverziót, relatív forrást, lokátort, nyers és normalizált értéket, jelölt kulcsot, szabályverziót, profillenyomatot és nyitott review-állapotot kell megőriznie. | SRC-ORDER-IMPORT-METHODS@sha256:bd1e467b990554ced2b2c7f5895473592e8ab39e0b728a4d45451e1dd751bac0#component-proposal-and-rag-lineage-boundary |
| IMPORT-013 | VERIFIED | A tesztadatbázis-import kizárólag `doorstar_test` célra, DRAFT revízióra, ImportRun-azonosítóval és jóváhagyott preview után engedhető; production vagy public séma kívül marad a folyamaton. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#review-and-test-import-procedure |
| IMPORT-014 | VERIFIED | A manufactured-item apply pontos source fingerprintet, explicit jelöltlistát és megerősítést követel; a szerver az eltárolt payloadot validálja, és egy korábban alkalmazott jelölt ismétlése nem hoz létre duplikátumot. | SRC-ADR-CONTROLLED-MANUFACTURED-IMPORT-APPLY@sha256:9a4946904e259ffc54b5a5b4ed751302c08e18a0b88573e2259c050a3fe1d3ba#dontes |
| IMPORT-015 | VERIFIED | A teljes batch meghiúsul, ha bármely új jelölt érvénytelen, nem READY, más ImportRunhoz tartozik vagy a forrásfingerprint megváltozott. | SRC-ADR-CONTROLLED-MANUFACTURED-IMPORT-APPLY@sha256:9a4946904e259ffc54b5a5b4ed751302c08e18a0b88573e2259c050a3fe1d3ba#dontes |
| IMPORT-016 | VERIFIED | A Source Catalog szinkron vagy snapshot nem hozhat létre Projectet, rendelési DRAFT-ot vagy gyártási rekordot; rendelési átvezetéshez külön emberi review szükséges. | SRC-ADR-SHAREPOINT-READONLY-SOURCE-CATALOG@sha256:46bf388043b5699cd2e7f032a8e6f9de197f81eb55adede5f14fb8c4590d807e#dontes |
| IMPORT-017 | VERIFIED | OCR csak a géppel nem olvasható dokumentumok célzott második lépése; az OCR-eredménynek elkülönített bizonytalansági és emberi ellenőrzési állapotban kell maradnia. | SRC-ORDER-IMPORT-METHODS@sha256:bd1e467b990554ced2b2c7f5895473592e8ab39e0b728a4d45451e1dd751bac0#machine-readability-split-and-selective-ocr |
| IMPORT-018 | OPEN | Élő SharePoint connector csak kijelölt site vagy library, read-only Entra-grant, stabil item- és verzióazonosság, hitelesítés, RBAC, megnevezett owner és reviewer, valamint jóváhagyott reconciliation- és rollback-terv után engedhető. | SRC-ADR-SHAREPOINT-READONLY-SOURCE-CATALOG@sha256:46bf388043b5699cd2e7f032a8e6f9de197f81eb55adede5f14fb8c4590d807e#dontes |
| IMPORT-019 | VERIFIED | A RAG- vagy LLM-javaslat legfeljebb review-jelöltet hozhat létre; rendelési adat, kalkuláció, terv vagy kiadás módosításához emberi jóváhagyás és a rendes domain-validáció szükséges. | SRC-ORDER-PROJECT@sha256:27306ae26b493bc17d60f9a8f5bd68ab235f5697d114c86fe80e6209bced5c5e#sharepoint-es-graphrag-alaparchitektura |

## Minősítési jelmagyarázat

- `VERIFIED`: implementált vagy elfogadott fail-closed importszabály.
- `INFERENCE`: forrásolt módszertani következtetés, amely nem hozhat létre végleges adatot.
- `OPEN`: emberi authority vagy külön jóváhagyás hiánya miatt blokkolt.
