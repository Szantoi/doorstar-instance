# Doorstar Nexus RAG v1.1 dry-run és retrieval-review

**Állapot:** `HUMAN_APPROVAL_REQUIRED — LIVE APPLY TILOS`  
**Csomag:** `doorstar-controlled-knowledge-rag@1.1.0`  
**Cél:** kizárólag `doorstar / doorstar-knowledge`  
**Package hash:** `237dcdf5be94131ae9d5be0dc9062d757896b7b11693c37198323db43db68e16`

## Döntési összefoglaló

A már jóváhagyott v1.0 csomag élő és változatlanul a Doorstar-szigeten marad.
A v1.1 külön, új csomagverzió: a Markdown claim-táblák sorait nem darabolja,
minden claimhez pontos chunk-lineage-et ad, és a teljes migrációt tartalommentes
előnézetben az élő v1.0 exact kulcskészletéhez köti.

A v1.1 **nem került Nexusba vagy ChromaDB-be**. Az offline retrieval-mérésben a
forrás-lineage teljes, és a szigorú top-10 teljes-claim találat javult, de a
flat top-20 keresés csak 18/35 kérdésnél hozta vissza az összes elvárt claimet.
Ezért a javaslat `HOLD_FOR_RETRIEVAL_TUNING`, nem élő betöltés.

## Csomag és változatlanság

| Ellenőrzés | Eredmény |
| --- | --- |
| Kanonikus dokumentum | 6 |
| Forrásolt claim | 98 |
| Claim chunk | 98, claimenként pontosan 1 |
| Dokumentum-overview chunk | 6 |
| Összes chunk | 104 |
| Eval kérdés | 35, explicit `expectedDocumentMode` |
| Dry-run hiba / figyelmeztetés | 0 / 0 |
| V1.1 report SHA-256 | `04cd41e2ad6d9889ce9cec3799f8bafce4bf5a3ab4bd4ff424a363682049ad99` |
| V1.1 manifest SHA-256 | `91969afbc5db633ec726c2558d94340f8053c32527d475a682cb837accde8444` |
| V1.1 inventory SHA-256 | `ded623dce943bec9ebff3dbeb2fb96c1ea9d3a166e89ff87f343b267f2dd9c57` |
| V1.1 eval SHA-256 | `8e8366112dc67b36fd5c90b2105e83ee3ffa8937a03f065bee93507fc4ff6f91` |

A befagyasztott v1.0 manifest, inventory, eval és dry-run report hash-e rendre
`4c3f3cf6…`, `bd7844df…`, `b3d42264…`, `c4e74c69…`; egyik fájl sem lett
felülírva. A v1.1 inventory új snapshotként frissíti a kanonikus dokumentumok
által nem hivatkozott handoff- és OpenAPI-forráspin aktuális hashét. Későbbi,
nem hivatkozott inventory-snapshot drift csak tartalommentes diagnosztika;
kanonikus claim által hivatkozott forrás driftje továbbra is blokkol.

## Chunkolási szerződés

Mind a hat dokumentum policy-je:

- `strategy: markdown_claim_rows`;
- `policyVersion: v2`;
- `maxChars: 1600`, `overlapChars: 0`, `headingDepth: 3`;
- `claimRowsPerChunk: 1`;
- `includeDocumentOverview: true`.

Egy claim chunk tartalmazza a dokumentum címét, a H2/H3 szakaszt, a claim-tábla
fejlécét és egy teljes sort. Claim-sor nem darabolható; 1600 karakter felett a
validátor fail-closed. Az overview nem tartalmaz claim-táblasort. A dry-run
report csak `chunkKind`, `claimIds`, kulcsok és hash-ek metaadatait tartalmazza,
kanonikus szöveget nem.

## Exact v1.0 → v1.1 migrációs előnézet

Az élő apply-receipttel ellenőrzött baseline:
`docs/projects/doorstar-nexus-rag-execution/PACKAGE_BASELINE.live-v1.0.json`,
SHA-256 `80b0f472158796e56845a6133288fda4bd2386b774fae9a8749819a5e8b33edc`.

| Műveleti készlet | Darab | Set SHA-256 |
| --- | ---: | --- |
| Superseded v1.0 dokumentum | 6 | `d55c88b9141d9b1d59380a1119c09d9c850b5fe887e35b56de896858a6cff462` |
| Superseded v1.0 chunk | 41 | `153a7f9ac09419418d491e87f66d3e8dbb5239aed09d97d1abc4d67bcaf7cbb3` |
| Létrehozandó v1.1 dokumentum | 6 | `8fc05b11b0942900bb3eaf85faef0bb20bcd5a5bd15349f57762bd245bfc1cdd` |
| Létrehozandó v1.1 chunk | 104 | `46d147070dc324c6567da244d49d990632016539909bd6f7c57e8af7a18f8309` |

A valós, tartalommentes plan kanonikus LF-renderének kétszer azonos SHA-256 értéke
`16284f00fb42e5a4ea938ea47752027627c30e49d5b393bee81493e30a6b190a`.
Státusza `HUMAN_APPROVAL_REQUIRED`; `broadDeleteAllowed:false`,
`deleteActionsEmitted:false`, payload nincs, és minden write-proof hamis.

A report elkészülte után a közös handoff naplóba bekerült a v1.1 eredménye.
Ez az inventoryban nyilvántartott, de kanonikus claim által nem hivatkozott
forrás aktuális hashét megváltoztatta, ezért a jelenlegi újraellenőrzés egyetlen
`INVENTORY_UNREFERENCED_SOURCE_DRIFT` diagnosztikát ad. A befagyasztott report
0/0 generálási eredménye, a package hash és minden claim-forrás pin változatlan;
hivatkozott forrás driftje továbbra is fail-closed blokkoló lenne.

## Offline retrieval-mérés

A mérés az auditált `Xenova/all-MiniLM-L6-v2`, 384 dimenziós modellel,
`PACKAGE_ONLY / COSINE_DOT` módban futott. Sem a transient candidate-input, sem
a részletes receipt nem lett fájlba mentve; csak a tartalommentes összegzés és
a reprodukciós hash marad a repositoryban.

| Cutoff | Teljes dokumentum-match | Dokumentum recall | Teljes claim-match | Claim recall | Teljes retrieval-match |
| --- | ---: | ---: | ---: | ---: | ---: |
| @5 | 28/35 | 29/36 = 80,56% | 14/35 | 25/61 = 40,98% | 14/35 |
| @10 | 31/35 | 32/36 = 88,89% | 17/35 | 30/61 = 49,18% | 17/35 |
| @20 | 33/35 | 34/36 = 94,44% | 18/35 | 34/61 = 55,74% | 18/35 |

- Claim→chunk mapping: 98/98 egyedi.
- Claim-forrás citation mapping: 98/98.
- Elvárt forrás-lineage: 35/35 kérdésnél teljes.
- Transient input SHA-256: `34e0458fdce460bb6bf6ef76a746ef44dec798e547f932514121de60d7d73483`.
- Determinisztikusan ismételt receipt SHA-256:
  `2480d024a9dc1d6ed0d44ca95d4d0799b556499b5d7acdb2c9b54e0aab35fa56`.
- Gépileg olvasható összegzés:
  `docs/projects/doorstar-nexus-rag/CANDIDATE_EVAL_SUMMARY.v1.1.0.json`.

Az all-or-nothing claim-match szándékosan szigorú: több elvárt claim esetén
mindegyiknek szerepelnie kell az adott top-k készletben. A recall külön jelzi a
részleges, de exact ID-alapú találatot. Substring-alapú claim scoring nincs.

## Nyitott retrieval-döntés

A v1.1 strukturális javítása megfelelő, de a lapos vektoros rangsor nem hozza
vissza megbízhatóan az összes, egy kérdéshez tartozó claimet. Következő, külön
verziózott kísérletként javasolt:

1. dokumentum- vagy témaszintű első retrieval;
2. a kiválasztott dokumentum claimjein belüli második retrieval;
3. exact claim/source lineage megtartása;
4. külön @5/@10/@20 acceptance-küszöb előzetes üzleti jóváhagyása;
5. az unfiltered, teljes Doorstar-szigeti MCP smoke külön kezelése a
   package-minőség mérésétől.

Kanonikus tudás, eval-válasz vagy kérdésszöveg módosítása kizárólag a mérés
feljavításáért tilos; az overfitting nem elfogadható.

## Végső minőségi kapu — 2026-08-01

- Doorstar RAG Python unit: 68/68 zöld
  (`20 + 24 + 11 + 8 + 5`).
- Nexus offline candidate evaluator: 9/9 zöld; TypeScript typecheck és Biome
  ellenőrzés zöld.
- Független adverszáriális re-audit: PASS; P0–P2 eltérés nem maradt.
- Backend build: zöld.
- OpenAPI: 3.1.0, 85 művelet, teljes route coverage.
- Teljes backend suite: 44/44 tesztfájl, 144/144 teszt, kizárólag
  `doorstar_test_vitest_*` izolált sémában.
- Read-only live-v1.0 health: `ok`, 2016 rekord, `doorstar-knowledge`, port
  3460, a korábbi smoke-kal azonos PID `492075`. A folyamathoz nincs systemd
  unit (`LoadState=not-found`), user-session scope-ban fut; ez külön
  üzemeltetési follow-up, nem v1.1 alkalmazási felhatalmazás.
- Ismételt transient candidate-input: 87 747 byte, CRLF nélkül, kétszer azonos
  `34e0458fdce460bb6bf6ef76a746ef44dec798e547f932514121de60d7d73483`
  SHA-256.
- Alkalmazásadatbázis-, Nexus-, ChromaDB- és deploy-írás: 0.

## Leállási kapu

**A folyamat itt megáll.** A v1.1 csomag dry-runja és review-ja elkészült, de
élő írásra nincs felhatalmazás. Nexus-, ChromaDB-, alkalmazásadatbázis- vagy
deploy-művelet csak új, explicit emberi döntés után történhet. A jelenlegi
javaslat: a v1.0 maradjon élő, a v1.1 pedig maradjon review-candidate a
retrieval-stratégia következő iterációjáig.
