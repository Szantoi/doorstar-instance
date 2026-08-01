# DSORD-11 — Faipari domainmegfelelési audit és javítási baseline

**Dátum:** 2026-07-31  
**Terminál:** backend  
**Prioritás:** critical  
**Auditstátusz:** completed  
**Implementációs státusz:** P0-3 lezárva a DSORD-13 szeletben; a többi P0/P1
tétel nyitott

## Cél és határ

Az audit azt vizsgálta, hogy a jelenlegi Doorstar backend rendelési,
forrásbizonyíték-, alkatrész-, szabászati, művelettervi és hatlépcsős gyártási
logikája mennyire szolgálja ki a faipari/ajtógyártási domaint.

Ez egy read-only állapotfelmérés volt. Nem módosított üzleti adatot,
adatbázissémát, API-szerződést vagy gyártási workflow-t. A Doorstar MCP
faipari tudástár találatai szakmai evidence-ként szolgáltak; belőlük nem lett
automatikus képlet, norma, katalógusérték vagy final review-döntés.

## Ellenőrzési bizonyíték

- Statikus kód-, Prisma-, OpenAPI-, ADR- és tesztaudit.
- Három független részvizsgálat: rendelési/felmérési domain,
  alkatrész–művelet–6-STAGE, valamint provenance/dokumentumlánc.
- Docker/Postgres teljes backend teszt: **36 fájl / 119 teszt zöld**.
- A Vitest egyedi `doorstar_test_vitest_*` sémát használt; public vagy éles
  adat nem módosult.
- Fő tudástári viszonyítás:
  - *Épületasztalos szakrajz (szega.hu #134)*, 8., 9. és 32. oldal;
  - *Faipari műszaki dokumentáció (szega.hu #230)*, 7., 20., 22., 24.,
    30., 32. és 36. oldal;
  - *Faipari gyártásszervezés*, a gyártási folyamat, kapacitás,
    minőségirányítás és technológiai/nem technológiai folyamat fejezetei.

## Érettségi összkép

Az értékek mérnöki érettségi becslések, nem szabványtanúsítások.

| Terület | Értékelés | Rövid indok |
|---|---:|---|
| Import, revízió és forráskövetés | 8/10 | Erős karantén, hash, idempotencia és emberi kapuk |
| Rendelés és felmérés | 4–5/10 | Jó aggregátum, de hiányos ajtó-/falnyílás-szemantika |
| Komponens-snapshot integritása | 8–9/10 | Reprodukálható, hash-elt és külön review-zott |
| Alkatrész-/szabászati teljesség | 4/10 | Nincs még jóváhagyott Doorstar BOM-/képletszabály |
| Planning preflight | 6/10 | Jó adapterfogalmak, de nem futó authority |
| 6-STAGE runtime authority | 2/10 | A jelenlegi task flow nem szerveroldali állapotgép |

Összességében a backend jó és biztonságtudatos migrációs/műszaki-előkészítési
alap, de még nem autoritatív faipari gyártási rendszer.

## Domainhelyes alapok

1. A rendelés `Project → ProductionOrder → OrderRevision` aggregátuma és a
   DRAFT/REVIEW/APPROVED/SUPERSEDED életciklus jó alap.
2. Az import tesztséma-korlátos, determinisztikus, idempotens, folytatható és
   emberi ellenőrzéshez kötött.
3. A manufactured és SOURCE_REVIEW supplementary tételek csak legalább egy,
   minden soron teljesen auditált RESOLVED evidence mellett használhatók.
4. A komponensmodell külön tárolja a készméretet és szabászméretet, anyagot,
   felületet, mennyiséget és szálirányt. Ez megfelel annak a faipari
   dokumentációs láncnak, amelyben a készméret az alkatrészjegyzék, a
   szabásméret pedig a szabásjegyzék része.
5. A component snapshot legfrissebb APPROVED revízióhoz, approval hashhez,
   profil- és katalógusfingerprinthez, valamint soronkénti hashhez kötött.
6. Helyes a `CUT_PART` és `PURCHASED_PART` különválasztása, valamint az, hogy
   a jelenlegi explicit adapter nem talál ki formulát vagy implicit defaultot.
7. A dokumentumkiadás konkrét dokumentumverziót és SHA-256 értéket fagyaszt.
8. A hat makroszakasz és az állomás→stage konfiguráció jó szókészleti alap.

## P0 — autoritatív gyártási használat előtt kötelező

### P0-1 — A jelenlegi üzemi kiadás megkerüli a jóváhagyott lineage-et

A `POST /projects/:key/schedule` kézzel szerkesztett `EpicStep` rekordokból
közvetlenül hoz létre Taskokat. Nem követel APPROVED rendelést, VERIFIED
component snapshotot, VERIFIED OperationPlant, jóváhagyott planning proposalt,
immutábilis `IssuedWorkPackage` rekordot vagy teljes dokumentum-lineage-et.

Érintett kód:

- `src/production-service/src/routes/projects.ts:299`
- `src/production-service/src/services/scheduler.ts:76`
- `src/production-service/src/app.ts:53`

Elfogadási feltétel:

- a legacy schedule/issue út nem nyithat gyártási kaput;
- kiadás csak latest APPROVED order + current VERIFIED component snapshot +
  current VERIFIED OperationPlan + jóváhagyott terv + immutábilis
  `IssuedWorkPackage` és exact dokumentumverziók mellett történhet;
- minden blocker szerveroldali, enumerált és fail-closed legyen.

### P0-2 — A 6-STAGE jelenleg metaadat, nem állapotgép

A Task `stepIndex` közvetlenül terminális értékre írható. Nincs kötelező
elődfeladat-befejezés, stage-kezdés/befejezés esemény, végrehajtó, időbélyeg,
jó/selejt mennyiség, minőségkapu vagy szabályozott rework. A
`Task.dependsOnId @unique` csak egy-egy lineáris kapcsolatot enged, ezért a
tok, ajtólap, vasalat és üveg szerelési összevezetése nem modellezhető.

Érintett kód:

- `src/production-service/src/domain/schemas.ts:14`
- `src/production-service/src/routes/tasks.ts:65`
- `src/production-service/src/domain/taskStatus.ts:19`
- `src/production-service/prisma/schema.prisma:772`

Elfogadási feltétel:

- parancsalapú stage/operation transition, átugrás nélkül;
- többes elődöt és utódot támogató, ciklusmentes runtime DAG;
- előd- és QC-kapuk szerveroldali ellenőrzése;
- actor, startedAt/completedAt, output quantity, nonconformance és rework audit;
- `Project.status` autoritatív QUEUED → IN_PROGRESS → SHIPPING_READY projekció.

### P0-3 — Az OrderPosition evidence nincs lezárva az approval láncban — ✅ REMEDIATED

Az ajtópozíció evidence létrehozáskor rögtön RESOLVED/REJECTED lehet, nem
tárol `reviewedByRole`/`reviewedAt` adatot, REVIEW alatt újraírható, és nincs
benne sem a readinessben, sem a v2 approval hashben. Így egy elutasított vagy
ellentmondó nyílásméret-/nyitásirány-forrás mellett is jóváhagyható a pozíció.

Érintett kód:

- `src/production-service/src/domain/schemas.ts:389`
- `src/production-service/src/routes/orderPositionEvidence.ts:66`
- `src/production-service/src/routes/productionOrders.ts:74`
- `src/production-service/src/services/orderRevisionHash.ts:31`

Elfogadási feltétel:

- ugyanaz az egyirányú, actorral és idővel auditált review-életciklus, mint a
  source-derived evidence-nél;
- minden releváns evidence-sor fail-closed order readiness blocker;
- position evidence, dokumentum–pozíció kapcsolat és szükséges forrásmeta
  kerüljön egy új approval hash-sémaverzióba;
- REVIEW/APPROVED állapotban ne legyen módosítható.

**Remediation evidence — 2026-07-31 / DSORD-13:** a create csak
`UNVERIFIED | REVIEW`, a final review külön egyirányú parancs kötelező indokkal,
reviewer role/principal/idő audittal. Revision-first row lock, readiness és
downstream kapuk, cascade-retention guard, legacy REVIEW karantén és hash-v3
köti az evidence-et és exact dokumentum–pozíció kapcsolatot. A v1/v2 projekció
változatlan. Valódi PostgreSQL concurrency és régi sémás migration truth table
zöld; teljes backend 38 fájl / 126 teszt, build és OpenAPI 80/80 zöld. A
hitelesített principal továbbra is P0-4, ezért a tárolt deklarált principal nem
tekinthető autentikációnak.

### P0-4 — A jóváhagyási actor nem hiteles principal

Az ideiglenes `X-Role` fejléc kliens által választható, hiányzó fejlécnél a
backend `vezeto` szerepet ad. Az audit csak szerepet tárol, személyt/principalt
és sessiont nem; reviewer–approver separation of duties nem bizonyítható.

Érintett kód: `src/production-service/src/middleware/requester.ts:12`.

Elfogadási feltétel:

- hitelesített Doorstar principal és változtathatatlan actor-azonosító;
- külön capabilityk a review, approval, evidence-resolution és release
  műveletekre;
- kötelező separation of duties a releváns jóváhagyásoknál;
- hiányzó identity fail-closed, nem admin-kompatibilis default.

### P0-5 — A DRAFT writer-ek nem osztanak közös concurrency protokollt

A review/approval zárolja a revíziósort, de a teljes DRAFT update, dokumentum-
és position-evidence írás nem ugyanazzal a row-lock/CAS protokollal fut. Egy
DRAFT-ként engedélyezett, későn commitoló kérés versenyhelyzetben REVIEW vagy
APPROVED tartalmat módosíthat.

Érintett kód:

- `src/production-service/src/routes/productionOrders.ts:166`
- `src/production-service/src/routes/productionOrders.ts:272`
- `src/production-service/src/routes/productionOrders.ts:343`
- `src/production-service/src/routes/orderPositionEvidence.ts:23`

Elfogadási feltétel:

- minden revision writer azonos lock-sorrendet vagy `status/version` CAS-t
  használjon;
- stale írás stabil `409 revision_version_conflict` választ kapjon;
- release előtt approval audit és content hash újraellenőrzés történjen;
- valódi PostgreSQL versenytesztek fedjék a writer–review és writer–approval
  ágakat.

## P1 — szükséges faipari domainmélység

1. **Felmérési méretfogalmak:** a kapu jelenleg ajtólapvastagságot követel,
   de a tényleges falvastagságot (`openingDepthMm`) nem. A falnyílás,
   falvastagság, tok-, szabad átjáró- és ajtólapméret maradjon külön fogalom.
2. **Strukturált ajtótengely:** free-text nyitásirány helyett handing,
   handing-convention, nézeti oldal és nyitási tér; külön két fizikai oldal,
   ajtólap-, tok- és borításfelület.
3. **Dokumentumcsomag:** ne legyen elegendő tetszőleges `OTHER` dokumentum.
   Workflow-fázisonként kötelező dokumentumkind, aktuális verzió és hash vagy
   auditált kivétel szükséges.
4. **Katalógus-kompatibilitás:** a jelenlegi lista csak kulcslétezést vizsgál.
   Kell méret-, anyag-, vastagság-, üveg-, vasalat-, megmunkálás-, finish- és
   oldalasság-kompatibilitás, cikkszám és mennyiségi szabály.
5. **BOM-teljesség:** VERIFIED component snapshot csak akkor legyen lehetséges,
   ha minden releváns forrástétel minden kötelező alkatrésze, vásárolt tétele
   és darabszáma szerepel. A kész→szabász mérettranszformáció profilvezérelt és
   tesztelt legyen.
6. **Kindfüggő manufactured/supplementary specifikáció:** falpanel,
   bútorfront, vasalat, fizikai áru, szolgáltatás és megjegyzés ne ugyanazt a
   minimális teljességet használja.
7. **Snapshot staleness:** VERIFIED reviewkor az eltárolt profil- és
   katalógusfingerprintet az aktuális aktív konfigurációval is össze kell
   vetni.
8. **OperationPlan:** a 2026-07-31 `_014` frontend handoffban kért
   exact-revision snapshot, standard/resource fingerprint, technological /
   non-technological / natural folyamat, multiple dependency, work instruction
   és QC checkpoint szerveroldali authority legyen. Ez a DSORD-06 folytatása.
9. **Kapacitás:** a globális nyolcóra/nap és csendes egyóra/task fallback csak
   heatmap. Kell verziózott műszaknaptár, gép/ember kapacitás, setup,
   karbantartás, száradás/pihentetés, anyagmozgatás és foglalás.
10. **Dokumentumkiadás:** egy work package egy document family aktuális,
    jóváhagyott verzióját fagyassza; az `issuedWorkPackageKey` később valódi
    aggregate-kapcsolat legyen.

## Ajánlott végrehajtási sorrend

1. Ideiglenes fail-closed kiadási kapu a legacy schedule út elé.
2. Hiteles principal és separation of duties; a DRAFT concurrency és az
   OrderPosition evidence/hash-v3 a DSORD-13-ban lezárult.
3. Felmérési falvastagság, strukturált nyitásirány és kétoldali ajtószerkezet.
4. Dokumentumcsomag- és katalóguskompatibilitási readiness.
5. Teljes, profilvezérelt BOM-/szabászati adapter és completeness review.
6. DSORD-06 OperationPlan authority, majd planning proposal.
7. Immutable `IssuedWorkPackage` és runtime 6-STAGE/DAG state machine.
8. QC, nonconformance, kapacitás, naptár, anyaglot és készletmélység.

## Kapcsolódó backlog

- `docs/projects/doorstar-order-data-chain/TASKS.yaml`
- `terminals/backend/TODO.md`
- `terminals/backend/inbox/2026-07-31_014_frontend-operation-workspace-contract.md`
- `docs/decisions/ADR-2026-07-31-operation-workspace-handoff.md`
- `docs/decisions/ADR-2026-07-30-two-sided-door-structure-appearance.md`

Az audit lezárt. A remediation implementációja külön, kis szeletekben indul;
ez a dokumentum az elfogadási baseline, nem gyártási felhatalmazás.
