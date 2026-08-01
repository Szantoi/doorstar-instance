# ADR — Kontrollált Doorstar RAG-betöltés

- Dátum: 2026-07-31
- Státusz: alkalmazva; v1.0 integritás PASS, retrieval-v1.1 review szükséges
- Érintett rendszer: Doorstar kanonikus tudáscsomag, Nexus-dev 3466,
  `doorstar-knowledge` Chroma-kollekció

## Kontextus

A `docs/projects/doorstar-nexus-rag` alatt elkészült és ember által
jótváhagyott a `doorstar-controlled-knowledge-rag@1.0.0` csomag. A jóváhagyott
csomagazonosító:

```text
34110af5a9ea4c129467034fa3d181cbba6c5601b908abd87be89d078fbae116
```

A csomag hat PII-mentes kanonikus dokumentumból és 41 determinisztikus
chunkból áll. Az immutable dry-run manifest szándékosan továbbra is
`mode=dry-run`, `nexusWrite=false`, `chromaWrite=false`; az élő futási
felhatalmazás külön execution authorization és receipt, nem a jóváhagyott
csomag átírása.

Az aktuális fogyasztói útvonal a megosztott Nexus-dev `3466/mcp` szolgáltatása.
A Doorstar-principalokat a szerver a `doorstar` szigetre, azon keresztül a
`doorstar-knowledge` fizikai kollekcióra oldja fel. A régi 3460-as, befagyasztott
példány nem része ennek az útvonalnak.

## Élő baseline

A 2026-07-31-i csak olvasható ellenőrzéskor a `doorstar-knowledge` kollekció
1998 rekordot tartalmazott. Ebből 23 rekord négy korábbi Doorstar-forráshoz
tartozott:

| Korábbi forrás | Rekord |
| --- | ---: |
| `INDEX.md` | 5 |
| `context/DOORSTAR_PRODUCTION_CONTEXT.md` | 7 |
| `domain/DOOR_MANUFACTURING_DOMAIN.md` | 7 |
| `patterns/6-STAGE_WORKFLOW.md` | 4 |

A célhalmaz exact ID-mintái rendre
`^INDEX_md_chunk_[0-9]+$`,
`^context_DOORSTAR_PRODUCTION_CONTEXT_md_chunk_[0-9]+$`,
`^domain_DOOR_MANUFACTURING_DOMAIN_md_chunk_[0-9]+$` és
`^patterns_6_STAGE_WORKFLOW_md_chunk_[0-9]+$`. A source, az ID-minta és a
darabszám egyszerre kötelező; közeli név vagy tartalmi hasonlóság nem elég.

Az egyik korábbi `INDEX.md` rekord elavult, titokszerű értéket tartalmaz. Az
értéket sem a repository, sem a napló, sem a végrehajtási receipt nem idézheti.
A négy régi forrásban a most jóváhagyott terminológiával ellentétes állítások
is vannak, ezért a 41 új chunk egyszerű hozzáfűzése nem biztosítana megbízható
keresést.

## Döntés

Az ingest csak dedikált, fail-closed végrehajtóval történhet. A generikus
`POST /api/knowledge/index`, a teljes dokumentumfát bejáró indexer és a 3460-as
legacy service használata tilos.

A kontrollált futás invariánsai:

1. A cél pontosan `targetIsland=doorstar` és
   `targetCollection=doorstar-knowledge`; a collection csak exact lookupkal
   nyitható meg, létrehozása tilos.
2. A package, manifest, inventory, eval, dry-run report, hat kanonikus fájl és
   mind a 41 chunk hash-e végrehajtás előtt újra ellenőrzendő.
3. A jelenlegi kollekció countja és az érintett exact ID-k read-only baseline-ba
   kerülnek. Ismeretlen ütközés vagy részleges korábbi futás blokkol.
4. A 23 korábbi rekord törlése előtt azok ID-ja, dokumentuma, metaadata és
   embeddingje korlátozott jogosultságú, repositoryn kívüli mentésbe kerül.
   A mentés tartalmát stdout vagy alkalmazásnapló nem jelenítheti meg.
5. A legacy célhalmaz csak teljes metadata-scan után, memóriában választható
   ki az exact `source` és ID-minta, valamint az 5/7/7/4 darabszám együttes
   egyezésével. A Chroma `where`/`whereDocument` törlése tilos.
6. Az új Chroma record ID pontosan a csomag `chunkKey` értéke. Azonos
   dokumentum/verzió/hash ismételt futásban `SKIP_IDENTICAL`; ugyanazon
   dokumentum/verzió eltérő hash-sel teljes abort.
7. Az executor a `chromadb@3.5.0` és a jelenlegi 384 dimenziós Xenova
   embedding-szerződést exact ellenőrzi. A 41 embeddinget előre képzi, minden
   értéknél véges számot és egységes dimenziót követel, majd explicit küldi az
   upsertben; szerveroldali automatikus embeddingre nem támaszkodik.
8. Először a 41 új rekord kerül upsertre és exact visszaellenőrzésre. Csak a
   sikeres `1998 → 2039` köztes állapot után törölhető a 23 jóváhagyott legacy
   ID. Teljes collection-törlés és más faipari korpusz módosítása tilos.
9. Írás után 41/41 exact-ID visszaolvasás, content- és metadata-hash,
   count-delta, duplikáció-ellenőrzés, 35 kérdéses eval és Doorstar-principallal
   MCP-smoke kötelező.
10. Hiba esetén kizárólag az adott receiptben létrehozott 41 ID törölhető, majd
   a mentett 23 rekord exact ID-val és eredeti embeddinggel állítható vissza.

Az apply közvetlenül az első írás előtt megismétli a teljes count- és
metadata-baseline-t. Chroma nem ad compare-and-delete tranzakciót, ezért az
írás csak olyan rövid karbantartási ablakban futhat, amelyben nincs párhuzamos
indexelő vagy más Chroma-író folyamat; eltérő fingerprint esetén abort.

Ha a baseline a fent rögzített 1998 rekordos állapot, a sikeres csere elvárt
végeredménye:

```text
1998 - 23 + 41 = 2016 rekord
```

## Jóváhagyási határ

A „mehet RAG-ba” jóváhagyás a változatlan `34110af5…` csomag betöltésére
vonatkozik. A 23 korábbi rekord törlése külön, romboló művelet, ezért annak
exact célhalmaza és visszaállítása külön emberi felhatalmazást igényel.

A csomag elkészülte után az inventory egyik, kanonikus dokumentum által nem
használt tétele, a backend OpenAPI megváltozott. A jóváhagyott csomag és mind a
hat kanonikus fájl változatlan, de a strict current-source gate ezt driftként
jogosan jelzi. A végrehajtáshoz ezért vagy új csomaghashre épülő új review kell,
vagy tételes emberi engedély arra, hogy kizárólag ezt a nem-manifest-forrású,
jóváhagyás utáni inventory-driftet az execution authorization auditálja. A
manifest-, canonical-, eval- vagy report-drift semmilyen override-dal nem
engedhető át.

## Execution receipt

A repositoryba csak tartalom- és titokmentes receipt kerülhet. Legalább az
alábbi adatokat tartalmazza:

- package ID, version és package hash;
- manifest, inventory, eval és dry-run report SHA-256;
- target island és collection;
- jóváhagyó, jóváhagyás ideje és futásazonosító;
- pre/post count és collection ID;
- mentési hely azonosítója és backup SHA-256, tartalom nélkül;
- törölt és létrehozott exact ID-k, illetve ezek hash-e;
- idempotencia-, post-read-, eval- és MCP-smoke eredmény;
- rollback állapot.

## Végrehajtási eredmény — 2026-08-01

A projektgazda külön jóváhagyta a 23 exact legacy rekord cseréjét és a kizárólag
`DESCRIBE_ONLY`, manifestet nem módosító OpenAPI inventory-drift override-ot. A
hash-pinnelt executor a rövid writer-kapu alatt, repositoryn kívüli restricted
backup és automatikus rollback mellett hajtotta végre a cserét.

- sikeres run: `5fb8e2b9-9f58-47a8-9706-d5cf256097d3`;
- count: `1998 → 2039 → 2016`;
- létrehozott chunk: 41, exact ID-set SHA-256
  `153a7f9ac09419418d491e87f66d3e8dbb5239aed09d97d1abc4d67bcaf7cbb3`;
- törölt legacy chunk: 23, exact ID-set SHA-256
  `c2e39a94dca864cbc47e0f33f98b22db6c49c49ad8682089a43c78e04fa31162`;
- 1975 nem célzott rekord teljes fingerprintje változatlan:
  `ea61f546863b18b0813d18d4a17e7122a9e5be3f75a9d3368ce761bcba53ec00`;
- restricted backup SHA-256:
  `e684f22c31ed1225f62a93161d053b38aeb7730042352d3bc1be3e83e89e6897`;
- ismételt terv: `SKIP_IDENTICAL`, count 2016;
- Doorstar Knowledge Service health: `ok`, dokumentum: 2016;
- hat külön Doorstar Nexus-principal smoke: 6/6 PASS.

Két korábbi write-attempt az exact rollbacket sikeresen bizonyította; mindkettő
visszaállította az 1998-as baseline-t. Egy további hibás model-cache paraméteres
kísérlet még bármely Chroma-írás előtt blokkolt. Nyers legacy tartalom, backup-
tartalom, ügyféladat vagy titok nem került repositoryba vagy receiptbe.

A tartalommentes részletek:
`docs/projects/doorstar-nexus-rag-execution/LIVE_APPLY_2026-08-01.json`.

## Utólagos retrieval-eval és v1.1 kapu

Az alkalmazási integritás PASS, de a live, szűretlen 35 kérdéses top-10 eval
csak 13 dokumentum-, 13 forrás- és 1 teljes claim-egyezést adott. A hiba nem
adatvesztés vagy rossz célkollekció: a v1 policy 17/98 Markdown claim-sort
karakterhatáron kettévágott, és a csomag evalja mind a 2016 rekorddal szűrés
nélkül versenyeztette a 41 kanonikus chunkot. A hat principal reprezentatív
keresése ettől függetlenül mind sikeres volt.

A már alkalmazott, immutable v1.0 csomagot nem írjuk át és nem gördítjük vissza.
A javítás új `1.1.0` csomagverzió: claim-sor-határt őrző chunkok, exact
claim→chunk megfeleltetés, package-filterelt retrieval-mérés és külön szűretlen
island/MCP smoke. Az új package hash, report és migrációs exact ID-halmaz új
emberi review és jóváhagyás nélkül nem írható ChromaDB-be.

Eval-részletek:
`docs/projects/doorstar-nexus-rag-execution/LIVE_EVAL_2026-08-01.json`.

## V1.1 offline eredmény — 2026-08-01

A külön `doorstar-controlled-knowledge-rag@1.1.0` csomag
`markdown_claim_rows/v2` policyvel 98 teljes claim chunkot és 6 dokumentum-
overview chunkot képez. A 98 claim mindegyike pontosan egy chunkhoz és
forráscitationhöz kötött; a 35 eval-kérdés elvárt forrás-lineage-e teljes.

Az élő v1.0 receiptből képzett, nyers report-hashhez kötött baseline pontosan
6 dokumentum / 41 chunk. A v1.1 planner exact `41 → 104` cserét mutat,
payload, broad delete, DELETE action, hálózati vagy írási művelet nélkül.
Státusza `HUMAN_APPROVAL_REQUIRED`, egyetlen blokkolója a külön v1.1 execution
authorization hiánya.

Az auditált, package-only MiniLM mérés claim recallja @5/@10/@20 rendre
25/61, 30/61 és 34/61; az összes elvárt claimet visszaadó szigorú kérdésszintű
találat 14/35, 17/35 és 18/35. A strukturális lineage ezért elfogadható, de a
lapos retrieval minősége nem elég a live cseréhez. Döntés:
`HOLD_FOR_RETRIEVAL_TUNING`.

Következő jelölt a dokumentum-/témaszintű első retrieval és az azon belüli
claim-szintű második retrieval, előre rögzített acceptance-küszöbökkel. A
kanonikus tudás vagy az evalkészlet mérésre optimalizált átírása tilos. A v1.0
változatlanul él; a v1.1 nem került Nexusba vagy ChromaDB-be, és csak új,
explicit emberi jóváhagyással írható be.

Részletek:
`docs/projects/doorstar-nexus-rag/RAG_REVIEW_REPORT.v1.1.md` és
`docs/projects/doorstar-nexus-rag/CANDIDATE_EVAL_SUMMARY.v1.1.0.json`.

A 2026-08-01-i lezáró read-only health check továbbra is `ok` állapotot,
2016 dokumentumot és a korábbi smoke-kal azonos `492075` PID-et mutatott a
3460-as porton. A folyamat munkakönyvtára
`/opt/nexus-doorstar/knowledge-service`, de nincs hozzá systemd unit
(`LoadState=not-found`), és user-session scope-ban fut. Ennek tartós
felügyelete külön üzemeltetési döntés; a jelen munkában restart, unit-telepítés
vagy deploy nem történt.
