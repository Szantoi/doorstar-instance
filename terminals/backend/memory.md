# Doorstar backend memória

Utolsó frissítés: 2026-08-01

## Aktív cél

A Doorstar megrendelés → gyártás adatút biztonságos backend-oldali
stabilizálása. A fókusz az importbiztonság, a konfiguráció-vezérelt műszaki
adatok, a dokumentumlánc és csak ezután a gyártási adatgenerálás.

## UX-referencia fixture checkpoint — 2026-08-01

- Stabil projektkulcs: `UX-REFERENCE-RETROFIT-001`; aktuális revízió: 2.
- Újrafuttatás: `npm run seed:ux-reference -- --confirm-ux-reference-seed
  --confirm-local-development-database` csak loopback `public` fejlesztői
  sémán. Az izolált `doorstar_ux_reference` séma nem kér public megerősítést.
- Az idempotencia projektkulcs-szintű újraépítés, nem azonos CUID/timestamp.
  Más projektet vagy táblát nem töröl.
- A fixture az API authority útját futtatja végig, ezért a review/approval,
  evidence, hash, component és operation invariánsok nem kézzel koholt DB-
  állapotok. Revision 1 historical `SUPERSEDED`; revision 2 current
  `APPROVED` + VERIFIED component/operation.
- A fixture explicit demóadat. Nem automatikus Doorstar BOM-kalkulátor,
  RAG-döntés, product-spec authority, PlanningProposal, IssuedWorkPackage vagy
  production release.
- Tartós target policy: csak `postgres:`/`postgresql:`, loopback host,
  `doorstar_production` adatbázisnév és explicit séma. A `public` séma továbbra
  is két confirmationt kér; generated Vitest séma csak `NODE_ENV=test` mellett
  fogadható el. Más adatbázisnév minden flaggel is tiltott.

## Exact-revision readiness checkpoint — 2026-07-31

- `GET /api/production/production-orders/{projectKey}/revisions/{revision}/readiness`
  a `doorstar.order-revision-readiness/v1` stabil, read-only szerződés. A gate
  lista sorrendje: SURVEY, POSITION_EVIDENCE, DOCUMENTS, MANUFACTURED_ITEMS,
  SUPPLEMENTARY_ITEMS, ORDER_REVIEW, COMPONENT_SNAPSHOT, OPERATION_PLAN,
  PRODUCTION_RELEASE.
- A survey/order-review mutation ugyanazt a kiemelt service-predikátumot
  használja. A dokumentumverzió-lánc is közös: superseded verzióhoz maradt
  exact pozíciólink `stale_document_version_linked` és review-blocker.
- Component és operation current/stale döntés a meglévő authority service-ek
  profil-, katalógus-, séma-, hash- és exact-revision evaluatorát használja;
  nincs új jóváhagyási algoritmus. Historical exact revision olvasható, de
  `latest_revision_required` miatt minden downstream gate és action tiltott.
- `allowedActions` csak valós, már létező POST/PATCH parancs és a requester
  canonical szerepkörére szűrt. A `nextAction` egyetlen ACTION/BLOCKED/COMPLETE
  diszkriminált eredmény; a kliensnek nem kell workflow-t inferálnia.
- A production release szándékosan mindig fail-closed: PlanningProposal,
  immutable IssuedWorkPackage és hiteles dokumentum-release aggregate nincs;
  ezért a gate állapota explicit `NOT_AVAILABLE`, nem `BLOCKED`.
  A páros `GET /api/production/projects/{projectKey}/workflow` ORDER/
  COMPONENTS/OPERATIONS kapuja autoritatív; minden későbbi kapu
  `CONTRACT_REQUIRED`, legacy Task nem authority.
- Az exact readiness és a project workflow teljes multi-read projekciója egy
  `REPEATABLE READ` tranzakció pillanatképén fut. A project/order/latest,
  component- és operation-authority segédek ugyanazt a transaction clientet
  kapják; a végső exact/latest snapshot-invariáns és valódi revision/component
  write-race teszt kizárja a kevert read választ.
- Ellenőrzés: 7/7 célteszt, 42/138 teljes backend, build, OpenAPI 85/85 és
  diff-check zöld. Nincs migráció, deploy vagy public/production adatírás.

## Backend–frontend kommunikáció

- Minden backend API-, workflow-, szerepkör- vagy hibakód-változás előtt át
  kell olvasni a `terminals/backend/inbox/` új frontend-üzeneteit.
- Minden ilyen változás után szerződés- és UI-handoff készül a
  `terminals/frontend/inbox/` könyvtárba, pontos végpontokkal, állapotokkal,
  korlátokkal és tesztstátusszal.
- A frontend által kért, de még hiányzó backend-authorityt explicit nyitott
  pontként kell visszajelezni; a kliens nem kényszeríthető szerveroldali
  workflow vagy üzleti döntés levezetésére.
- Legutóbb elolvasva:
  `2026-07-30_010_frontend-component-workspace-adoption.md` és
  `2026-07-30_011_import-discovery-manufactured-evidence-gate.md`, valamint
  `2026-07-30_012_frontend-source-evidence-gate-adoption.md` és
  `2026-07-30_013_frontend-aggregate-component-source-gate-adoption.md`, továbbá
  `2026-07-31_014_frontend-operation-workspace-contract.md` és
  `2026-07-31-codex-nexus-identity-handoff.md`.
- Legutóbbi válasz:
  `terminals/frontend/inbox/2026-07-31-order-position-evidence-hash-v3-backend-handoff.md`.
- A futó frontend feladat közvetlenül is megkapta és visszaigazolta a választ;
  a komponens-snapshot drill-down integrációját már ehhez igazítja.
- A supplementary/manufactured „minden evidence auditált RESOLVED” P0 authority
  2026-07-30-án elkészült és a frontend az aggregate gate-tel együtt átvette
  (23 fájl / 69 teszt, lint/build/diff-check zöld). A
  `ComponentWorkspacePage` DOM/mutation regresszió szerint nyitott evidence
  mellett az editor és create gomb sincs renderelve, és snapshot mutation sem
  indul. A kapcsolódó navigációk közös Kalkulátor path buildert használnak,
  az exact blocker-lista assertion pedig kizárja a járulékos blocker okokat.
  Frontend
  által jelzett további P0 authority-hiányok:
  közös rendelési readiness read model, szerepkör- és kapu-alapú DRAFT
  mezőtulajdon, optimista
  konkurenciavédelem, autoritatív projekt-workflow projekció és teljes
  lineage nélküli kiadás szerveroldali tiltása.

## DSORD-11 faipari domainmegfelelési audit — 2026-07-31

- Részletes baseline:
  `docs/projects/doorstar-order-data-chain/DSORD-11-WOODWORKING-DOMAIN-AUDIT.md`.
  A task a `DO3-DOMAIN-CONFORMANCE` milestone alatt completed; a remediation
  implementációja külön nyitott backlog.
- A read-only audit a rendelési/felmérési, provenance/dokumentum-, komponens/
  szabászati, planning és runtime 6-STAGE szeletet vizsgálta. Három független
  részvizsgálat és a Doorstar MCP faipari tudástár forrásai támogatták.
- Friss Docker/Postgres bizonyíték: production-service Vitest **36 fájl /
  119 teszt zöld**, egyedi `doorstar_test_vitest_*` sémában. Ez a jelenlegi
  szerződés stabilitását bizonyítja, nem a hiányzó domain-invariánsokat.
- Érettségi kép: import/revízió/traceability 8/10; rendelés/felmérés 4–5/10;
  component snapshot integritás 8–9/10, BOM-/szabászati teljesség 4/10;
  planning preflight 6/10; runtime 6-STAGE authority 2/10. Összesítve a
  backend jó migrációs és műszaki-előkészítési alap, de még nem autoritatív
  faipari gyártási rendszer.
- P0 baseline:
  1. a legacy `POST /projects/:key/schedule` megkerüli az APPROVED order →
     VERIFIED component/operation plan → immutable work package lineage-et;
  2. a Task/stepIndex flow nem szerveroldali 6-STAGE állapotgép, és az
     egy-előd/egy-utód runtime modell nem tud szerelési összevezetést;
  3. az `OrderPositionEvidence` nincs teljesen auditálva, readiness-gate-ben
     és approval hashben;
  4. az ideiglenes `X-Role` actor nem hiteles principal, hiányzó headernél
     `vezeto` kompatibilitással;
  5. a DRAFT writer-ek nem osztják a review/approval row-lock vagy CAS
     protokollját, ezért `revision_version_conflict` védelem szükséges.
- Fontos P1 domainmélység: falvastagság (`openingDepthMm`) a survey gate-ben;
  strukturált handing/nézeti tengely és kétoldali ajtószerkezet; kötelező,
  hash-elt dokumentumcsomag; katalógus-kompatibilitás; kindfüggő manufactured/
  supplementary teljesség; BOM-completeness és profilvezérelt kész→szabász
  transzformáció; OperationPlan/QC; valós műszaknaptár és erőforráskapacitás.
- A `2026-07-31_014` frontend handoff fail-closed Operation Workspace-et és
  exact-revision `OperationPlanSnapshot` szerződést kér. Ez a DSORD-06
  backend-authority folytatása; a frontend nem vezethet le standardot,
  normaidőt, resource mappinget, QC-t vagy kiadási döntést.
- Tudástári viszonyítás: *Épületasztalos szakrajz* 8., 9., 32. oldal;
  *Faipari műszaki dokumentáció* 7., 20., 22., 24., 30., 32., 36. oldal;
  valamint a *Faipari gyártásszervezés* folyamat-, kapacitás- és
  minőségirányítási fejezetei. RAG-adat továbbra is csak candidate evidence.

## DSORD-13 — OrderPosition evidence és approval hash-v3 — 2026-07-31

- A DSORD-11 P0-3 rés lezárult. Evidence create csak `UNVERIFIED | REVIEW`;
  a külön final PATCH csak `RESOLVED | REJECTED`, kötelező 3–2000 karakteres
  indokkal. Tárolt audit: `reviewedByPrincipal`, `reviewedByRole`, `reviewedAt`.
  Final sor nem nyitható újra és nem írható felül.
- A jelenlegi header-boundary az opcionális `X-Principal` értéket tárolja;
  hiány esetén explicit `legacy-role:<role>` kompatibilitási azonosító kerül az
  auditba. Ez nem hiteles identity: a valódi principal és separation of duties
  továbbra is külön P0.
- Közös fail-closed predicate: minden meglévő position evidence csak teljes,
  auditált `RESOLVED` állapotban elfogadható. OPEN/REVIEW/REJECTED/hiányos
  történeti RESOLVED blokkolja az order review/approval, component
  materialization és dokumentum-release ágat.
- A hash-v3 köti az evidence source metaadatát, normalizált candidate értékét,
  final döntést/reviewer auditot, evidence→exact dokumentumverziót és
  dokumentumverzió→pozíció tagságot. A v1/v2 projekció az új nested relációkat
  explicit kihagyja; történeti hash-ek változatlanul verifikálhatók.
- Zársorrend: minden érintett DRAFT writer először `OrderRevision`, majd child
  row. Position evidence create/review, full DRAFT PUT, intake-stage,
  dokumentumverzió és dokumentum–pozíció link ezt követi; order review/approval
  revision→összes evidence sort zárol. Stale writer:
  `409 revision_version_conflict`. Evidence-es pozíció nem törölhető cascade-del.
- Migráció: `20260731120000_order_position_evidence_audit_hash_v3`. Legacy final
  row → REVIEW karantén, forrás és régi resolution megmarad. Érintett REVIEW
  revision DRAFT-ra nyílik; APPROVED státusz változatlan, downstream blokkol.
- Ellenőrzés: targeted 5/14, full 38/126, valódi PostgreSQL concurrency 2 ág,
  pre-migration truth table, build és OpenAPI 80/80 zöld. Public/production
  migráció/deploy nem történt; ideiglenes tesztséma nem maradt.

## Elkészült alapok

### DSMR-26148 — fail-closed felméréslezárás

- `SURVEY_COMPLETED` csak teljes strukturált pozíciómezőkkel érhető el. A
  legacy kompatibilitási mezők mellett kötelező az `openingDepthMm`, továbbá a
  konfigurációs `doorTypeKey`, `wallSolutionKey` és `glassKey`; `finishKey`
  ebben az átmeneti szeletben szándékosan nem kötelező.
- Legalább egy `SURVEY` dokumentum és minden pozícióhoz legalább egy exact
  SURVEY dokumentumverzió-link szükséges. A kézi survey-flow nulla field
  evidence mellett lezárható; ha evidence létezik, minden sor teljesen
  auditált `RESOLVED` döntést igényel.
- A `409 survey_data_incomplete` gépi `details` blokkban közli a hiányzó
  mezőket, a SURVEY dokumentumhiányt, a link nélküli pozíciókat és az evidence
  összesítést. Ugyanez az invariáns a rendelési review readinessben is újra
  ellenőrződik.
- Prisma/migráció nem változott. Build és OpenAPI 3.1 / 83 művelet / teljes
  route coverage zöld; célzott 10 fájl / 24 teszt, teljes backend 41 fájl /
  131 teszt zöld, izolált PostgreSQL sémában.

- **DSORD-06 explicit authority:** elkészült az exact-revision,
  `OperationPlanSnapshot` read/readiness/create/review API. A snapshot a latest
  APPROVED order és aktuális VERIFIED component hash-láncát, generator profile,
  standard catalog és resource mapping verzióját/fingerprintjét, továbbá az
  exact dokumentum-, work-instruction-, QC-, evidence- és dependency-adatot
  fagyasztja. A create confirmation-gated, idempotens és serializable; a review
  egyszer zárható, kötelező indokkal, output-hash tokennel és creator/reviewer
  principal separationnel. A három process kind és a többes, ciklusmentes DAG
  ellenőrzött; a PURCHASED_PART technológiai ága explicit policy nélkül tiltott.
  Az aktív v1 adapter sem standardot, sem resource-ot, sem időt nem talál ki.
  PlanningProposal/IssuedWorkPackage és végrehajtási rekord nincs benne.
- **Operation Workspace feloldó metadata:** a component calculator profile API
  profilonként canonical fingerprintet és a technical catalog aktuális
  verzióját/fingerprintjét publikálja.

- **DSORD-10:** Vitest minden futáskor külön
  `doorstar_test_vitest_*` PostgreSQL-sémát használ, a teardown azt törli.
  A böngészhető `doorstar_test` így nem kap automatikus fixture-öket.
- **DSMR-26148:** helyes UTF-8 forrásértékekkel helyreállítva a
  `doorstar_test` sémában. A négy régi `DSMR-*-TEST` fixture eltávolítva.
- **DSORD-07 részlet:** a bulk preview regisztráció idempotens,
  megszakítás után folytatható, kizárólag tesztsémás, admin-review note-hoz és
  explicit CLI megerősítéshez kötött. A preview csak jelölteket hoz létre.
- **DSORD-03:** verziózott műszaki katalógus, API és pozíciószintű kulcsok
  elkészültek. A backend validálja a kulcsokat valamennyi írási útvonalon,
  és csak tényleges katalógusválasztáskor vezeti le a régi kompatibilitási
  mezőket. A régi/importált szabad szöveg megmarad.
- **DSORD-08:** az `OrderDocument` immutábilis verzióláncot kapott; konkrét
  dokumentumverzió közvetlenül pozícióhoz kapcsolható, és jóváhagyott
  revízióból SHA-256-alapú kiadási snapshot rögzíthető.
- **Kiegészítő tételek:** az `OrderSupplementaryItem` külön rendelési lane,
  `MANUAL` és bizonyítékkal kötelező `SOURCE_REVIEW` móddal. A nyitott tétel
  szerkeszthető, műszaki szerepkörrel `VERIFIED` vagy `REJECTED` állapotba
  zárható; a forrásos tétel nem törölhető. Nyitott tétel blokkolja a revízió
  review-kapuját, a lezárt tétel pedig része a jóváhagyási hashnek. Jelenleg
  a SOURCE_REVIEW `VERIFIED` döntéshez legalább egy evidence kell; az összes
  evidence külön egyirányú review-döntést, indokot, review-szerepkört és
  időpontot kap. `SOURCE_REVIEW → VERIFIED` csak legalább egy és minden soron
  teljesen auditált `RESOLVED` evidence mellett lehetséges.
- **Gyártott tétel evidence-kapu:** a falpanel/bútorfront evidence ugyanilyen
  review-életciklust kapott. A szülő `VERIFIED`, a rendelés review/approval és
  a komponens-snapshot source validation egymástól függetlenül is fail-closed.
  A komponens-snapshot aggregate szinten minden source-derived tételt vizsgál,
  így a payloadból kihagyás sem megkerülés. A régi, reviewer nélküli
  végállapotokat a migráció `REVIEW` karanténba nyitja, az érintett REVIEW
  revíziót pedig DRAFT-ra nyitja a jogszerű remediation érdekében.
- **Reviewer szerepek:** teljes evidence-auditot
  `technical_preparation | order_approver | administrator | vezeto` hozhat
  létre. Az utóbbi kettő a login nélküli átmeneti jogosultsági kompatibilitás;
  például a `sales` nem érvényes reviewer.
- **Component 409 szerződés:** a gépi hibakód-enum mellett a `details`
  `oneOf` sémája row-level evidence, aggregate revision, source-reference,
  profile-conflict és state alakot különböztet meg. Integrációs teszt védi,
  hogy karanténos revízión `VERIFIED` snapshot review 409, de `REJECTED`
  döntés továbbra is sikeres.
- **Approval hash v2:** az `OrderRevisionAudit.contentHashSchemaVersion = 2`
  új approvaloknál az evidence resolution, actor és timestamp mezőit is köti.
  A v1 projekció megmaradt a történeti approvalok ellenőrzésére.
- **DSORD-05 biztonságos határ:** elkészült a verziózott, idempotens
  `ComponentSnapshot`/`ComponentRequirement` materializálás. Csak jóváhagyott
  és legfrissebb rendelésre, változatlan jóváhagyási hash mellett fut; explicit
  forrássorokat fogad, minden sort és a teljes kimenetet hash-sel védi, majd
  `REVIEW` állapotban emberi ellenőrzésre adja. Valódi Doorstar-képletet nem
  feltételez: az aktív `doorstar-explicit-component-adapter/v1` profil
  képletfuttatása tiltott, amíg nincs jóváhagyott szabálykészlet.
- **Revíziólezárás:** új rendelésrevízió előtt nem maradhat aktív
  `DRAFT`/`REVIEW`; az előző `APPROVED` revízió atomikusan `SUPERSEDED`
  állapotot és auditbejegyzést kap. A régi snapshot történeti, read-only.
- **Import ellenőrző felület backendje:** az import inbox összesített státuszt
  ad, a munkaszám-evidence végpont pedig visszaadja a forráslokátorokat és az
  emberi döntéshez szükséges tényeket automatikus üzleti következtetés nélkül.

## Műszaki katalógus

- Konfiguráció: `src/production-service/src/config/technicalCatalog.json`
- API: `GET /api/production/technical-catalog`
- Kulcsmezők: `doorTypeKey`, `finishKey`, `glassKey`, `hardwareKeys`,
  `wallSolutionKey`, `materialKey`, `machiningKeys`, `technicalNotes`.
- Érvénytelen vagy duplikált kulcs: `400 technical_catalog_value_invalid`.
- Forrásadatból igazolt fóliás választék:
  - Renolit Magnolia Supermatt Classic (DSMR-25219, DSMR-25159)
  - Stone Grey Suedette Matt (DSMR-25163)
  - Supermatt Kashmir (DSMR-26137)

## Ellenőrzési állapot

- Docker konténer: `doorstar-production-db` (Postgres, localhost:5462).
- A `doorstar_test` séma megkapta a katalógus-, dokumentumlánc-,
  kiegészítőtétel-, komponens-snapshot-, revíziólezárási és source-evidence/
  hash-v2 migrációkat. A `public` sémát ez a szelet nem módosította.
- Utolsó bizonyított DSORD-06 ellenőrzés: production-service build, OpenAPI
  teljes route-lefedettség 83 művelettel, céltesztek 3/3 zöld. Az
  OperationPlan suite valódi PostgreSQL concurrent create és review ágat
  is futtat. Külön `doorstar_test_migration_dsord06_*` sémában mind a 22
  migráció kétszer deployolva; a második no-pending, teardown után nulla
  ideiglenes séma maradt.
- A legacy production guard minden új `Task` create/attach/schedule/step-issue
  útvonalat fail-closed módon zár. A validation/role/not-found, missing-plan,
  predecessor és már-kiadott no-op precedencia megmaradt; vegyes bulk kérés
  nem ír részlegesen. A stabil top-level kód
  `legacy_production_issue_blocked`, a blocker enum a concurrency konfliktust
  is tartalmazza. PlanningProposal és valós IssuedWorkPackage hiányában nincs
  success path; a jelenlegi szabad string `issuedWorkPackageKey` nem authority.
- Aktuális ellenőrzés: 40 tesztfájl / 129 teszt zöld, TypeScript build zöld,
  OpenAPI 3.1 verifier 83/83 route coverage zöld. A célzott guard/board/OpenAPI
  futás 16/16 zöld, benne valódi PostgreSQL supersession lock-race, commitált
  DRAFT latest revision, exact concurrency blocker és nulla Task írás.
  Read-only audit után nulla `doorstar_test_*` ideiglenes séma maradt. A
  `public` séma változatlanul 3/22 migráción áll, 12 történeti Taskkal; ezt a
  szelet nem migrálta és nem módosította.
  A Vitest futásonként egyedi `doorstar_test_vitest_*` sémát épít és töröl.
  Külön regresszió kétfázisú `prisma migrate deploy` futással, régi sémás
  fixture truth table-lel ellenőrzi a két source-evidence data migrationt.
  Az ellenőrzés után nulla ideiglenes Vitest- vagy migrációs tesztséma maradt.
- A lokális forrás- és üzleti adat nem kerülhet `public` vagy éles sémába.

## Fontos dokumentumok

- Projekt terv: `docs/projects/doorstar-order-data-chain/PROJECT.md`
- Feladatállapot: `docs/projects/doorstar-order-data-chain/TASKS.yaml`
- Importforrás-felmérés: `docs/projects/doorstar-order-data-chain/IMPORT_DISCOVERY.md`
- Részletes korábbi napló: `terminals/import-discovery/{memory,state}.md`
