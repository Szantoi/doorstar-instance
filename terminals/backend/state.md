# Doorstar backend állapot

Utolsó frissítés: 2026-08-01

## Helyi UX-referencia projekt fixture — 2026-08-01

- Elkészült az idempotens `seed:ux-reference` parancs a stabil
  `UX-REFERENCE-RETROFIT-001` kulccsal. Kizárólag loopback adatbázist és
  explicit sémát fogad; a helyi `public` fejlesztői séma második megerősítő
  flaget kér. A parancs csak a saját projektkulcsát cseréli, globális törlést
  nem futtat.
- A fixture minden üzleti rekordot a meglévő HTTP-parancsokon keresztül hoz
  létre. Az 1-es revízió szabályos approval után `SUPERSEDED`; a 2-es a current
  `APPROVED` revízió három pozícióval, három exact dokumentumreferenciával,
  auditált position evidence-szel, külön reviewed falpanel-jelölttel, manuális
  tartozékkal, 7 soros `VERIFIED` ComponentSnapshottal és 4 soros `VERIFIED`
  OperationPlanSnapshottal.
- A demó alkatrészméretek, normaidők és műveletek explicitek; nem RAG-szabály,
  nem automatikus kalkuláció és nem production release. SIDE_A/SIDE_B vagy
  FIXED/ADJUSTABLE szerep nincs levezetve. `PRODUCTION_RELEASE` változatlanul
  `NOT_AVAILABLE`.
- A helyi `public` fejlesztői adatbázis 22/22 migráció mellett feltöltve; a
  parancs második futása ugyanazt az egy projektet építette újra. VPS/deploy és
  külső adatbázis nem változott.
- Bizonyíték: guard unit 5/5, idempotens valós PostgreSQL fixture integráció
  1/1, TypeScript build és OpenAPI 85/85 route coverage zöld.
- Reviewer-hardening: a loopback + schema/flag kapu mellett a PostgreSQL
  adatbázisnév is explicit allowlistelt (`doorstar_production`). Más DB-n a
  parancs Prisma betöltése előtt fail-closed; sem a `public` kettős confirmation,
  sem a Vitest-séma nem írhatja felül ezt a kaput. Friss guard unit: 5/5.

## DSORD-11 — faipari domainmegfelelési audit

- A read-only audit elkészült és completed taskként bekerült a
  `DO3-DOMAIN-CONFORMANCE` milestone-ba. Részletes bizonyíték és elfogadási
  baseline:
  `docs/projects/doorstar-order-data-chain/DSORD-11-WOODWORKING-DOMAIN-AUDIT.md`.
- Az audit read-only baseline-ja: Docker/Postgres, egyedi futási séma, 36 fájl /
  119 teszt zöld. A DSORD-06 authority saját bizonyítéka: build, 83/83 OpenAPI
  route és 3/3 célteszt zöld; a teljes-suite közös-fa eltérését a legutóbbi
  kész szelet dokumentálja.
- A revízió-, import-, source-derived evidence-, dokumentumverzió- és explicit
  component-snapshot alap erős. A backend jelenlegi céljára — kontrollált
  Excel/PDF átállás és műszaki előkészítés — alkalmas alap.
- Az audit öt eredeti P0-jából az OrderPosition evidence/readiness/hash rés
  2026-07-31-én lezárult; a DRAFT concurrency releváns hash-writer szelete is
  elkészült. Nyitott maradt: teljes lineage nélküli legacy
  schedule/issue bypass; nem állapotgép-jellegű 6-STAGE runtime és lineáris
  dependency; hiteles principal és separation of duties hiánya; valamint a
  teljes mezőtulajdon/concurrency-token authority.
- P1: survey falvastagság és strukturált ajtótengely/kétoldali szerkezet,
  dokumentumcsomag-kapu, katalógus/BOM kompatibilitás és teljesség,
  kindfüggő manufactured/supplementary specifikáció, OperationPlan/QC,
  valamint valós naptár- és erőforráskapacitás.
- Az audit nem gyártási felhatalmazás. A legacy `Project/EpicStep/Task` út
  továbbra sem tekinthető az új order→component→operation lineage
  autoritatív folytatásának.

## Kész

- DSMR-26148 fail-closed survey gate: `openingDepthMm` + konfigurációs
  típus/fal/üveg kulcsok, `SURVEY` dokumentum, pozíciónként exact SURVEY-link,
  valamint a meglévő evidence teljes auditált `RESOLVED` állapota kötelező.
  Nulla evidence a kézi flow-ban megengedett. A 409 válasz strukturált
  blocker-részleteket ad; Prisma/migráció nem változott. Build, OpenAPI 83/83,
  célzott 10/24 és teljes 41/131 teszt zöld.
- DSORD-10 UTF-8 kapu, tesztséma-izoláció és DSMR-26148 helyreállítás.
- DSORD-03 konfigurációs műszaki katalógus és felmérési API.
- DSORD-07 bulk preview regisztrációs részlet: idempotens és kontrollált
  tesztsémás ImportRun/jelölt létrehozás.
- DSORD-08 dokumentumverzió-lánc, pozíciókapcsolás és változatlan kiadási
  hivatkozás.
- Import inbox és munkaszám-szintű evidence packet API.

## Legutóbbi kész szelet

- **Exact-revision readiness + projekt-workflow:** elkészült a read-only
  `GET /production-orders/:projectKey/revisions/:revision/readiness` és a
  `GET /projects/:projectKey/workflow`. A stabil gate-sorrend a survey,
  position evidence, dokumentumverzió, manufactured/supplementary review,
  order review, current VERIFIED component, current VERIFIED operation és
  fail-closed production release teljes láncát adja. A blocker gépi kódot,
  canonical ownerRole-t, entity-linket és detailt hordoz; csak meglévő backend
  parancs jelenhet meg allowed actionként, szerepkörre szűrve.
- Mindkét projekció teljes multi-read számítása egyetlen PostgreSQL
  `REPEATABLE READ` tranzakcióban fut, minden authority helper ugyanazt a
  tranzakciós klienst kapja. Visszatérés előtt exact-revision/latest-revision
  snapshot-invariáns ellenőrzés fut; valódi párhuzamos új revision- és új
  component-snapshot regresszió igazolja, hogy nincs kevert válasz.
- Stale exact revision 200-as történeti read marad, de
  `latest_revision_required` mellett ORDER/COMPONENT/OPERATION BLOCKED és nincs
  action. A hiányzó release-authority miatt a PRODUCTION_RELEASE minden
  revízión explicit `NOT_AVAILABLE`, nem `BLOCKED`. Superseded
  dokumentumverzióhoz maradt pozíciólink
  `stale_document_version_linked`; ugyanez a közös order-review/approval
  predikátumban is tilt, tehát a read model és mutation gate nem tér el.
- A projekt-workflow ORDER/COMPONENTS/OPERATIONS kapuja ugyanebből a
  projekcióból származik. PLANNING/WORK_PACKAGE/PRODUCTION_6_STAGE/HANDOVER
  explicit `CONTRACT_REQUIRED`; legacy Taskból nincs authority-következtetés.
- Bizonyíték: célzott readiness 7/7, readiness+OpenAPI 8/8, teljes backend
  42 fájl / 138 teszt, TypeScript build és OpenAPI 3.1 85/85 route coverage
  zöld. Migráció, public/production adatírás és deploy nem történt.

- **DSORD-06 OperationPlanSnapshot authority:** exact-revision GET/readiness,
  idempotens POST és egyszer lezárható VERIFIED/REJECTED review elkészült.
  Latest APPROVED order, current VERIFIED component, canonical hash-ek, aktív
  generator/standard/resource fingerprintek, exact dokumentumverziók,
  evidence, work instruction, kötelező QC és ciklusmentes többes dependency
  minden create/verify előtt szerveroldali kapu. Creator/reviewer principal
  separation és serializable row-lock concurrency védi a döntést.
- A component calculator profiles API profilonként canonical fingerprintet,
  valamint current technical catalog version/fingerprint mezőket publikál.
- Bizonyíték: DSORD-06 céltesztek 3/3; OpenAPI 83/83; concurrent create
  201+200, concurrent review 200+409; 22 migráció kétfázisú izolált
  deployja és nulla maradt ideiglenes séma. Public/production adat és deploy
  nem változott.
- A korábbi teljes backend suite 39 fájl / 127 teszt zöld volt. Az aktuális
  közös dirty fában a külön `legacyProductionGuard` minden legacy Task/Issue
  írást szándékosan 409-re zár; emiatt 38/39 fájl és 122/127 teszt zöld, öt
  változatlan board-elvárás eltér. A guardot ez a DSORD-06 szelet nem írta át.

- **DSORD-13 / DSORD-11 P0-3:** az `OrderPositionEvidence` create csak
  `UNVERIFIED | REVIEW`; a final PATCH egyszer írható
  `RESOLVED | REJECTED` döntés kötelező indokkal, reviewer role-lal, deklarált
  principallal és `reviewedAt` idővel. A candidate érték soha nem íródik
  automatikusan a pozícióba.
- Evidence create/review, full DRAFT PUT, intake-stage, dokumentumverzió és
  dokumentum–pozíció link revision-first PostgreSQL zárat használ. Order review
  és approval revision→evidence sorrendben zárol; stale writer stabil
  `409 revision_version_conflict`. Evidence-es pozíció cascade-törlését a
  `position_evidence_must_be_retained` kapu tiltja.
- Minden nyitott, elutasított vagy hiányosan auditált position evidence
  blokkolja az order review/approval, component create/VERIFIED review és
  dokumentum-release ágat. A release az approval auditot és content hash-t is
  újraellenőrzi.
- Az új approval hash-v3 köti a position evidence-et, reviewer auditot,
  evidence→exact dokumentumverziót és dokumentumverzió→pozíció tagságot.
  A v1/v2 projekció explicit kizárja az új nested relációkat, ezért a történeti
  hash audit pontos marad.
- A `20260731120000_order_position_evidence_audit_hash_v3` migráció a régi,
  reviewer nélküli final sorokat REVIEW karanténba teszi. REVIEW revízió DRAFT-ra
  nyílik; APPROVED státusz változatlan, de downstream fail-closed. A source és
  legacy resolution megmarad, reviewer nem kerül kitalálásra.
- Bizonyíték: célzott 5 fájl / 14 teszt; teljes backend 38 fájl / 126 teszt;
  valódi PostgreSQL evidence-review↔order-review/approval verseny; régi sémás
  migration truth table; TypeScript build; OpenAPI 3.1 JSON és 80/80 route
  coverage zöld. Public/production migráció és deploy nem történt; ellenőrzéskor
  nulla ideiglenes Vitest/migration séma maradt.

- A supplementary `SOURCE_REVIEW` és a `ManufacturedItem` evidence külön,
  jogosultságvédett, egyirányú review-parancsot kapott. A szülő csak legalább
  egy és minden soron teljesen auditált `RESOLVED` döntés mellett lehet
  `VERIFIED`; nyitott vagy elutasított evidence fail-closed 409.
- Minden supplementary/manufactured módosító parancs és a rendelés review/
  approval azonos revízió-/tételzárral fut. Régi státuszolvasásból nem írhat
  végleges tétel vagy már befagyasztott revízió után.
- A komponens-snapshot forráskapuja a `VERIFIED` címkétől függetlenül, a
  revízió összes source-derived tételére újra ellenőrzi az evidence-auditot.
  A payloadból kihagyott karanténos tétel sem kerülheti meg a kaput. Az új
  rendelési audit hash-v2 a döntés indokát, szerepkörét és idejét is köti;
  régi v1 approval továbbra is ellenőrizhető.
- A legacy reviewer nélküli evidence-végállapotokat és szülő `VERIFIED`
  állapotokat a migráció `REVIEW` karanténba nyitja vissza; az érintett
  `REVIEW` revízió DRAFT-ra nyílik, hogy API-ból javítható maradjon.
- A reviewer audit explicit allowlistje a normatív
  `technical_preparation | order_approver` és az átmeneti
  `administrator | vezeto` identitást fogadja; más szerep fail-closed.
- A supplementary mutation/review és component snapshot create/review 409
  hibakódjai gépileg enumerált OpenAPI-szerződést kaptak. A component
  `details` öt, egymást kizáró `oneOf` alakja külön kezeli a row-level,
  aggregate, source-reference, profile-conflict és state részleteket.
- Integrációs regresszió ugyanazon karanténos APPROVED revízión bizonyítja,
  hogy a snapshot `VERIFIED` review 409, miközben a `REJECTED` menekülő ág
  sikeres és auditált marad.
- A DSORD-05 első, biztonságos backend-szelete elkészült: jóváhagyott és
  legfrissebb rendelésre verziózott, idempotens komponens-/szabászati snapshot
  készíthető explicit forrássorokból. A snapshot a rendelés, profil, katalógus,
  bemenet, kimenet és minden sor hashét megőrzi; `REVIEW` állapotból csak
  indokolt `VERIFIED` vagy `REJECTED` döntéssel zárható.
- Új rendelésrevízió az előző `APPROVED` revíziót atomikusan `SUPERSEDED`
  állapotba helyezi. Aktív `DRAFT`/`REVIEW` mellett új revízió nem nyitható,
  a korábbi snapshot pedig történeti, read-only.
- A valódi automatikus Doorstar-kalkulátor még nincs kész: a jelenlegi
  `doorstar-explicit-component-adapter/v1` nem futtat képletet és nem képez
  hallgatólagos alapértékeket. A következő részhez jóváhagyott, verziózható
  Doorstar-képletszabályok szükségesek.
- A `doorstar_test` séma adatvesztő reset nélkül megkapta a komponens-snapshot,
  revíziólezárási és source-evidence/hash-v2 migrációkat; a `public` séma nem
  kapott új source-gate oszlopot. OpenAPI: 80 művelet, teljes route coverage.
  Backend build zöld; Vitest: 36 fájl / 119 teszt zöld, egyedi futási sémában.
  A két data migrationt külön régi sémás truth-table teszt is deployolja.
  A futás után nulla ideiglenes Vitest- vagy migrációs tesztséma maradt.
  Egy korábbi, rövid timeouttal megszakított próba eldobható
  `doorstar_test_vitest_51156_5a27ac0dd83a4147bf821c3ef2b03d71` sémáját
  élő folyamat és zár hiányának ellenőrzése után töröltük; üzleti adatot nem
  tartalmazott.

## Backend–frontend egyeztetés

- A `_014` Operation Workspace szerződés backend authorityje elkészült.
  `GET/POST .../operation-plan-snapshots` és az egyszer lezárható
  `PATCH .../:snapshotId/review` exact rendelési és component hashhez,
  generator/standard/resource fingerprinthez, dokumentumhashhez, evidence-hez,
  QC-hoz és ciklusmentes többes dependencyhez kötött. A create idempotens és
  serializable; a review output-hash tokent és eltérő creator/reviewer
  principalt követel. A frontend handoff:
  `terminals/frontend/inbox/2026-07-31-operation-plan-snapshot-backend-handoff.md`.
- A kalkulátorprofil-lista profilonként `fingerprint`, top-level
  `technicalCatalogVersion` és `technicalCatalogFingerprint` mezőt ad, ezért
  az Operation Workspace előzetes exact-component kapuja feloldható.
- PlanningProposal, IssuedWorkPackage, runtime execution/inspection és legacy
  Task-képzés nincs a DSORD-06 snapshot authorityben; VERIFIED terv sem kiadás.

- A backend elolvasta a frontend/import-discovery `2026-07-30_002`–`_014`
  szerződés- és adoption-üzeneteit. A `_011` manufactured evidence P0 rését a
  közös source-evidence kapu lezárta; az exact-revision kalkulátor frontend
  fail-closed viselkedése így már szerveroldali authorityval is egyezik. A
  `_013` frontend follow-up már az aggregate source gate-et, négy reviewer
  identitást és mindkét error-details alakot is átvette. Frontend állapot:
  23 fájl / 69 teszt, lint, build és diff-check zöld. Külön
  `ComponentWorkspacePage` DOM/mutation regresszió bizonyítja, hogy egy
  `VERIFIED`, de nyitott evidence-sorú manufactured parent mellett az editor
  és create gomb nincs a DOM-ban, a snapshot mutation hívásszáma pedig nulla.
  Az App, OrderDetailPage, ProjectProcessOverview és a regresszió közös
  Kalkulátor-route mintát/path buildert használ; az exact egy-listitem
  assertion igazolja, hogy ebben a fixture-ben kizárólag az evidence-audit a
  blocker.
- A `_014` exact-revision Operation Workspace fail-closed; csak a jelenlegi
  component snapshot adatokat és a legacy epik/task összevetést mutatja.
  Operation mutation, standardválasztás, normaidő, planning vagy kiadás nincs.
  A kért `OperationPlanSnapshot` read/create/review authority a DSORD-06 nyitott
  backendfeladata. A Codex/Nexus identity handoff is elolvasva; token vagy
  credential nem került a repóba.
- Kimenő handoff:
  `terminals/frontend/inbox/2026-07-30-backend-catalog-handoff.md`
- Dokumentumlánc handoff:
  `terminals/frontend/inbox/2026-07-30-document-chain-api-handoff.md`
- Kiegészítőtétel-életciklus handoff:
  `terminals/frontend/inbox/2026-07-30-supplementary-item-lifecycle-handoff.md`
- Komponens-snapshot UI handoff:
  `terminals/frontend/inbox/2026-07-30-component-snapshot-ui-handoff.md`
- Source-evidence P0 kapu handoff:
  `terminals/frontend/inbox/2026-07-30-source-evidence-gate-backend-handoff.md`
- Összesített workflow-szerződés válasz:
  `terminals/frontend/inbox/2026-07-30-backend-response-to-frontend-workflow-contracts.md`
- Import-discovery P0 lezárás:
  `terminals/import-discovery/inbox/2026-07-30_008_backend-manufactured-evidence-gate-closed.md`
- Várt válasz és backend-igények:
  `terminals/backend/inbox/`

## Következő backend-authority

1. Valódi PlanningProposal és immutable `IssuedWorkPackage` aggregate,
   exact order/component/operation/document lineage-dzsel; a Task írás ugyanabban
   a tranzakcióban történjen, mint az authority ellenőrzése.
2. Hiteles principal/separation of duties, majd minden DRAFT writerre közös
   revision lock vagy optimista `revision_version_conflict` protokoll.
3. DSORD-05 lezárása után jóváhagyott automatikus Doorstar BOM-/műveletszabály
   és tényleges normakatalógus köthető a kész explicit OperationPlan authority elé.
4. Immutable `IssuedWorkPackage` után többes dependencyt kezelő 6-STAGE state
   machine és QC/végrehajtási audit.

## Korlátok

- Import csak `doorstar_test` vagy generált Vitest-sémába írhat.
- Macro nem futtatható.
- Jóváhagyott revízió és kiadási dokumentumverzió nem módosítható.
- `REVIEW` komponens-snapshot nem gyártási kiadás és nem hozhat létre
  műveletjelöltet vagy munkacsomagot.
- `VERIFIED` OperationPlanSnapshot csak műszaki terv; nem PlanningProposal,
  nem `IssuedWorkPackage`, és nem hozhat létre üzemi Taskot.
- A legacy `Project/EpicStep/Task` schedule út nem bizonyít approved order-,
  component-, operation-, planning- vagy dokumentum-lineage-et, ezért nem
  tekinthető autoritatív gyártási kiadásnak.
- Minden új legacy Task-materializáló út fail-closed 409-et ad; a guardnak
  PlanningProposal és valós IssuedWorkPackage hiányában nincs success path.
  A szabad string `issuedWorkPackageKey` dokumentum-release referencia nem
  önálló work-package authority, ezért maradék P0 kockázat.
- Kliensoldali readiness- vagy workflow-inferencia nem autoritatív; a frontend
  a kész közös backend-végpontok projekcióját fogyasztja.
- SharePointnál alapelv a metadata/reference, nem a bináris másolása.
