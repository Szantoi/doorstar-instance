# Doorstar rendeléstől az üzemi kiadásig

- Document ID: `doorstar.order-production-process`
- Version: `1.0.0`
- Valid from: `2026-07-31`
- Review status: `READY_FOR_HUMAN_REVIEW`
- Owner: `doorstar-root`
- Sensitivity: `INTERNAL`

## Hatókör

A dokumentum az általános üzleti adatút és a revíziós kapuk kereshető
összefoglalója. Nem tartalmaz konkrét ügyfelet, projektet vagy rendelést.

## Állítások

| Claim ID | Minősítés | Állítás | Forráshely és forráshash |
| --- | --- | --- | --- |
| FLOW-001 | VERIFIED | Minden új megrendelés új Project és új rendelés, akkor is, ha a megrendelő korábban már rendelt; korábbi projekt nem használható újra ügyfélazonosság alapján. | SRC-ORDER-SALES-SURVEY-WORKFLOW@sha256:f0a29a6d6dc310be25077586ba47b37d7a670a845e0a83d764d8aadb5e413414#uzleti-dontesek |
| FLOW-002 | VERIFIED | A normál authority-lánc: Sales dokumentumátadás, helyszíni felmérés, műszaki előkészítés, revízió-review, jóváhagyás, majd kalkuláció, tervezés és üzemi kiadás. | SRC-ORDER-SALES-SURVEY-WORKFLOW@sha256:f0a29a6d6dc310be25077586ba47b37d7a670a845e0a83d764d8aadb5e413414#allapotgep |
| FLOW-003 | VERIFIED | A Sales dokumentumcsomag átvétele előzetes feldolgozást enged, de önmagában nem teszi véglegessé a típust, méretet vagy kivitelt. | SRC-ORDER-SALES-SURVEY-WORKFLOW@sha256:f0a29a6d6dc310be25077586ba47b37d7a670a845e0a83d764d8aadb5e413414#allapotgep |
| FLOW-004 | VERIFIED | Pozíciónként a felmérés véglegesíti az ajtótípust, a szélesség × magasság × vastagság méretet, a felületet, a falpanel vagy blende vagy egyik sem döntést, az üvegezést és üvegspecifikációt, valamint a nyitásirányt. | SRC-ORDER-SALES-SURVEY-WORKFLOW@sha256:f0a29a6d6dc310be25077586ba47b37d7a670a845e0a83d764d8aadb5e413414#felmeresen-veglegesitendo-gyartasi-adatok |
| FLOW-005 | VERIFIED | Felmérés nélküli továbbhaladás csak névvel, indoklással és jóváhagyással rögzített kivételként történhet; közvetlen műszaki jóváhagyási ugrás nem megengedett. | SRC-ORDER-SALES-SURVEY-WORKFLOW@sha256:f0a29a6d6dc310be25077586ba47b37d7a670a845e0a83d764d8aadb5e413414#allapotgep |
| FLOW-006 | VERIFIED | A rendelésrevízió életciklusa `DRAFT → REVIEW → APPROVED → SUPERSEDED`; csak a DRAFT szerkeszthető, a jóváhagyás tartalmi hash-t és változhatatlan pillanatképet rögzít. | SRC-ORDER-PROJECT@sha256:27306ae26b493bc17d60f9a8f5bd68ab235f5697d114c86fe80e6209bced5c5e#allapotok-es-kapuk |
| FLOW-007 | VERIFIED | Rendelésmódosítás új revíziót hoz létre, nem írja felül a korábbi jóváhagyott vagy kiadott állapotot. | SRC-ORDER-PROJECT@sha256:27306ae26b493bc17d60f9a8f5bd68ab235f5697d114c86fe80e6209bced5c5e#allapotok-es-kapuk |
| FLOW-008 | VERIFIED | A legacy üzleti lánc `Gyártásmegrendelő → Kalkulátor → Folyamatok → Kiíró`; a modern rendszer ennek üzleti eredményét és lineage-ét őrzi meg, nem az Excel képleteit vagy cellahivatkozásait. | SRC-DOMAIN-PRODUCTION-DATA-CHAIN@sha256:80e2a40fc42574b05657a42f0ab7f7f4c9e79f5e59c7b560f1b95acd6a65c021#a-jelenlegi-lanc |
| FLOW-009 | VERIFIED | A Kalkulátor a termékkonfigurációból alkatrészigényt, mennyiséget, készméretet és szabászati méretet képez; nem ütemező és nem önálló forrás-authority. | SRC-DOMAIN-PRODUCTION-DATA-CHAIN@sha256:80e2a40fc42574b05657a42f0ab7f7f4c9e79f5e59c7b560f1b95acd6a65c021#kalkulator-a-termekbol-gyarthato-alkatreszek |
| FLOW-010 | VERIFIED | A Folyamatok réteg a jóváhagyott termék- és alkatrészadatból műveleti tervet, norma-, erőforrás- és függőségi bemenetet készít. | SRC-DOMAIN-PRODUCTION-DATA-CHAIN@sha256:80e2a40fc42574b05657a42f0ab7f7f4c9e79f5e59c7b560f1b95acd6a65c021#folyamatok-a-gyartasi-muveleti-terv |
| FLOW-011 | VERIFIED | A Kiíró nem újratervezi a gyártást, hanem ugyanahhoz a jóváhagyott projekt-, alkatrész- és tervverzióhoz kötve teszi végrehajthatóvá az üzemi információt. | SRC-DOMAIN-PRODUCTION-DATA-CHAIN@sha256:80e2a40fc42574b05657a42f0ab7f7f4c9e79f5e59c7b560f1b95acd6a65c021#kiiro-az-uzemnek-adott-vegrehajthato-informacio |
| FLOW-012 | VERIFIED | Üzemi kiadás csak jóváhagyott rendelési, kalkulációs és tervezési bemenet pontos verzióira hivatkozhat. | SRC-ORDER-PROJECT@sha256:27306ae26b493bc17d60f9a8f5bd68ab235f5697d114c86fe80e6209bced5c5e#allapotok-es-kapuk |
| FLOW-013 | VERIFIED | A beépítés lezárásához mennyiség, státusz, időpont, felelős, bizonyíték vagy indok, eltérés és átadás-átvételi állapot szükséges; a hiányos helyszíni dokumentáció nem zárhatja le a folyamatot. | SRC-ORDER-SALES-SURVEY-WORKFLOW@sha256:f0a29a6d6dc310be25077586ba47b37d7a670a845e0a83d764d8aadb5e413414#beepitoi-lezarasi-kapu |
| FLOW-014 | INFERENCE | A kanonikus RAG-réteg a folyamat szabályait és jelentését kereshetővé teheti, de rendelési állapotot nem képezhet és authority-forrást nem helyettesíthet. | SRC-ORDER-PROJECT@sha256:27306ae26b493bc17d60f9a8f5bd68ab235f5697d114c86fe80e6209bced5c5e#sharepoint-es-graphrag-alaparchitektura |

## Minősítési jelmagyarázat

- `VERIFIED`: közvetlenül dokumentált Doorstar üzleti szabály.
- `INFERENCE`: biztonságos architekturális következtetés, de nem üzleti esemény.
- `OPEN`: még jóváhagyandó kérdés; ebből a verzióból nem keletkezik tény.
