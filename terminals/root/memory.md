# Doorstar Root memória

## Tartós döntések

- A Doorstar ügyfél-sziget: nem építi és nem birtokolja a platformmagot.
- A Scheduling platformmodul neve `spaceos.scheduling`; az API útvonala
  `/api/scheduling/v1`.
- Doorstar felelőssége: saját frontend, OpenAPI-ból generált TypeScript-kliens,
  `doorstar.scheduling-import` adapter, fixture-ök és kontraktus-review.
- Platform felelőssége: C# mag, tenant-feloldás, RLS-bizonyíték, entitlement,
  OpenAPI-kontraktus, publikáció és sandbox.
- 2026-07-28 döntés: a PLAN-03 M1 részlegesen elindítható; a `partialRelease`
  precedence és a naptár-tudatos küszöbidő számítása külön policy, Doorstar
  pontosításig nem véglegesíthető.

## Operatív tudnivalók

- A root mailbox: `terminals/root/inbox/`; itt érkeznek a Doorstar-rootnak
  címzett üzenetek.
- A federation mailbox szigetközi továbbításra való; üzenet-formátuma
  frontmatterrel és SHA-256 tartalomhassel védett.
- Az Üzemi Tábla éles címei: `https://doorstar.asztalostech.hu` és
  `https://doorstar.joinerytech.hu`.
- Frontend újraépítés után a VPS-en ellenőrizni kell a `dist/` nginx-olvasási
  jogosultságait.
- A Doorstar production-service formális API-szerződése a
  `src/production-service/openapi/production-service.openapi.json`; a futó
  szolgáltatás `GET /openapi.json` alatt ezt a build-assetet adja vissza.
- A `2026/07_Július` valós munkafüzeteiből a fóliázó 68,91 órás napi
  terhelési jelöltje kinyerhető. A fájlok ugyanakkor csak `00.0.01`
  beállítás-verziót és kizárólag 100%-os partial-release értékeket mutatnak.
- A munkafüzet üzleti referencia, nem implementációs másolási cél. A
  `folyamatOperationPreflight` a Power Query `Folyamat` eredményét ellenőrzött
  műveletdrafttá teszi; csak jóváhagyott, minősített standardot enged át.
- A teljes üzleti adatfolyam megerősítve: Gyártásmegrendelő rögzíti a
  projektet, a Kalkulátor alkatrészt/kész- és szabászati méretet képez, a
  Folyamatok műveletet és munkaidőt tervez, a Kiíró üzemnek adja ki az adatot.
- A Doorstar gyártási láncának kötelező kernelkapcsolata van: Project,
  FlowEpic és Task csak publikált platform-contracton, revíziózott
  kézfogással használható. Doorstar nem birtokolhat vagy másolhat kernel
  életciklust.
- A `spaceos-modules-scheduling` C# modulban a Task és a teljes Kernel scope
  értékobjektumai elkészültek. Ezek nem helyettesítik a kézfogást: csak a
  tárolható, ellenőrizhető hivatkozási alapot adják a későbbi contracthoz.
- A Doorstar root platformállapot-jelentést tett a root outboxba a
  `99adad0` (kernel scope), `5f403d0` (kapacitásfoglalás) és `2da68b1`
  (verziózott standard/import-karantén) C# előrehaladásról. A fogyasztói
  adapter M3 OpenAPI + sandbox nélkül továbbra sem indíthat importot vagy
  ütemezést.
- A Doorstar `folyamatOperationPreflight` teljes adatvonalat kér:
  megrendelés-kulcs+revízió, Kalkulátor alkatrész-kulcs+revízió, Folyamat
  kulcs+revízió és jóváhagyott standard. Így a későbbi platformimport
  visszavezethető marad a négy munkafüzetes láncon át.
- Az atomikus `planningImportBatchPreflight` a standard- és Folyamat-ellenőrzés
  közös Doorstar adapterhatára. Csak a standard-preflightből ready állapotú
  norma kapcsolható művelethez; a batch kulcsa+revíziója és a batchen belüli
  függőség-előd kötelező. Ez staging-formátum, nem platform-import vagy
  ütemező.
- A partial-release üzleti policy az ADR-069 §4-ben jóváhagyott; a
  `releaseThresholdPercent` naptár-tudatos értelmezését továbbra is a platform
  C# resolver valósítja meg, Doorstar nem másolja.
- Az ADR-069 §4 üzleti döntés megszületett: partial release mindig felülírja
  az FS alsó korlátot, későbbi eredmény esetén pedig
  `partial_release_delays_fs_start` warning kötelező. A százalékot munkaidő
  arányában, az előd erőforrás-naptárán a C# platform számolja; Doorstar ezt
  nem másolja. A korábbi `9DC80...` hash hibásan módosított v1 fájlra utalt;
  azt a v1/v2 korrekció érvénytelenítette.
- Input-pack immutabilitás: `v1` nem írható át. Pin:
  `D7D84A3E54016108CDDB9E1686DF108D0A1C1DBA39855ADA0628ABF3C87BC837`.
  A partial-release bővítés önálló `v2` (`schemaVersion: 2.0.0`) fájlban él,
  pinje `7BB8A9243D19E1A5E28979CBBE795E8A99AC259B4F24A63A65C8BF572F822A55`.
- A fixture pineket a `doorstar-planning-input-pack.manifest.json` és a
  `npm run verify:planning-input-pack` ténylegesen ellenőrzi. A tesztsuite is
  azonos tartalomhassel ellenőrzi a v1/v2 fájlokat; módosítás csak tudatos
  verzió- és hash-frissítéssel engedhető át.
- Doorstar saját operációs API-ja: `/healthz` kizárólag liveness, `/readyz`
  pedig adatbázis-készültséget is ellenőrző readiness. A readiness nem
  Planning- vagy kernelkapcsolat, ezért nem sérti a JoineryTech platformmag
  ownershipét.
- A `/readyz` HTTP-teszt seam-je explicit `runDatabaseProbe` app-dependency;
  csak tesztelhetőségi határ. Productionben a Prisma `SELECT 1` fut. Hiba
  esetén a kliens mindig csak `{ status: "not_ready" }` választ kap.
- A legacy import karaktermegőrzése adatminőségi kapu. A `DSMR-26148`
  forrás-preview helyes UTF-8 (`Séfer`, `Offenbächer`), miközben a korábbi
  egyszeri feltöltés literal `?` karaktereket írt a `doorstar_test`
  adatbázisba. Ez nem frontend-renderelési hiba; a helyreállítás forrásból
  újratöltést, az import kliens pedig explicit UTF-8 JSON-tesztet igényel.
- A böngészhető fejlesztői adat és az automatikus tesztadat nem keverhető.
  A Vitest suite jelenleg ugyanabban a tartós `doorstar_test` sémában hagyja
  meg a `DSMR-*-TEST` fixture-öket, ezért a rendelésregiszter több külön
  projektet is `Minta Kft.` főcímmel mutat. Rövid távon kötelező afterAll
  takarítás, hosszú távon külön, futásonként izolált tesztséma szükséges.
- A Scheduling M3 read-only kontraktus 2026-07-28-án publikálva érkezett a
  federation inboxba. Forrás: `Szantoi/spaceos-modules-scheduling` `main`,
  `docs/openapi.yaml`; OpenAPI 3.1, `/api/scheduling/v1`, SHA-256:
  `3fc6c57d4ec6d768c432bb023e5ca98f4a960c70f7331f482e276729adfc0756`.
  A 8 read-endpoint, az opak `scope { projectId, epicId, taskId }`,
  `standardRevision`, `sourceRevisions` és a
  `partial_release_delays_fs_start` warning publikus szerződésrészek.
- Doorstar ebből kizárólag generált TypeScript klienst és shadow fogyasztást
  készíthet. A Tailnet-only sandbox base URL, demo tenant és Keycloak-token
  igénylése még nincs meg; ezekig nincs élő hívás. Auth: kernel-api audience
  Bearer JWT, szerveroldali `enabled_modules` gate; idegen tenant 404.

## 2026-07-31 — Codex-agentek és külön Nexus-identitások

- Hat projekt-szintű custom agent él `.codex/agents/*.toml` alatt: root,
  conductor, monitor, backend, frontend és import-discovery.
- A közvetlen Codex-szabály terminálonként `AGENTS.md`; a `CLAUDE.md`
  kompatibilitási háttér marad. A rootból spawnolt agentnek a TOML explicit
  előírja a saját state/memory/TODO/inbox olvasását.
- Hat külön Nexus principal és HKCU credential készült. Mind a hat a `doorstar`
  szigetre kötött és szerveroldalon kizárólag `search_knowledge` jogosultságú.
- A bridge fix principal→env allowlistet használ; ismeretlen principal vagy
  hiányzó saját token nem esik vissza másik identitásra.
- Codex CLI 0.144.5 nem tölti be a child-only MCP additiont, ezért mind a hat
  `doorstar_knowledge_<role>` bridge a projekt configban is szerepel. A szerep
  csak a sajátját használhatja. Azonos OS usernél ez audit-routing, nem kemény
  impersonation-védelem; privilege/adatscope-emelkedés nincs, mert minden
  token ugyanarra az egy Doorstar keresőtoolra korlátozott.
- A régi közös `doorstar-codex` credential auditkimenetben láthatóvá vált,
  ezért a sikeres cutover után azonnal vissza lett vonva a Nexusban és törölve
  a Windows user environmentből. A régi token 403-at ad.
- Élő bizonyíték: minden role `tools=1`, három tiltott ág 403/-32003,
  `island=doorstar`, forrás jelen; a Nexus logban mind a hat caller külön név.
- Reprezentatív agent-E2E: a `doorstar_frontend` custom agent saját role-toolja
  sikeres keresést adott, a Nexus `doorstar-frontend-codex` logszámláló +1.
- Kanonikus döntés:
  `docs/decisions/ADR-2026-07-31-codex-agent-identities.md`.
- A hot-reload közbeni „tartsd meg az utolsó jó policyt” önmagában nem védi a
  hidegindítást. Customer token regisztrációját csak akkor tekintjük lezártnak,
  ha a forrás első-load fallbackje `none`, és a deployolt service manager is
  fail-closed preflighttal ellenőrzi a policy jelenlétét, szerkezetét és
  customer allowlist-határát. Így egy sérült konfiguráció nem válhat restart
  után széles eszközfelületté.

## 2026-07-31 — Tartós terminológiai döntések

- A Doorstar szókészlet négy rétegű: faipari `CANONICAL`, definiált
  `DOORSTAR_LOCAL`, kódoldali `SYSTEM_TERM`, illetve `REVIEW`/`DEPRECATED`.
  Az örökölt kifejezés keresési alias maradhat, de nem válhat csendben új
  kanonikus adattá.
- A stabil fizikai oldal `SIDE_A/SIDE_B`; a `FIXED/ADJUSTABLE` csak jelen
  lévő tokborítás profilfüggő szerepe. Egyik sem adja meg a pánt-/zároldalt,
  a jobbos/balos oldalasságot vagy a nyitás térbeli irányát.
- FNY = forrás szerint falnyílás, LAP = forrás szerint ajtólap. BKM_FIX,
  BKM_MOVING és TOK exact BOM-/profilhatára nem ismert; ezekből automatikus
  célmező-képzés tilos.
- A falpanel és bútorfront önálló gyártandó tétel lehet. A blende ezzel
  szemben a Doorstar elsődleges felhasználói definíciója szerint az ajtó felső
  vízszintes takarásának meghosszabbítása fix mérettel vagy a plafonig. Az
  ajtó opcionális szerkezeti részleteként kezelendő, saját kiterjesztési móddal,
  mérettel és felület/szín adattal; ezekből automatikus gyártási méret nem
  következik. A célzott frontend Nexus-keresés nem adott releváns
  blende-találatot, ezért ez `DOORSTAR_LOCAL`, nem RAG-authority.
- A hat Doorstar stage makrofolyamat. Munkaállomás, gép, művelet, stage és
  készültségi állapot külön fogalom. `KISZALLITASRA_MEGJELOLES` parancs/átmenet,
  emberi állapotneve „Kiszállításra kész”.
- A vállalt szállítási határidő, várható kiszállítás, tervezett beépítés és
  tényleges események külön típusos időadatok. Egyikből sem következik a másik.
- Kanonikus forrás:
  `docs/knowledge/domain/DOORSTAR_FAIPARI_TERMINOLOGIAI_SZOTAR_2026-07-31.md`;
  gépi baseline: `doorstar-faipari-terminology.v1.json`.

## Munkaritmus

- Az automatikus root mailbox-heartbeat 2026-07-28-án a kevés feladat miatt
  törölve lett; ellenőrzés csak szükség esetén történik.
- Éles, törlő vagy kifelé ható lépés előtt emberi jóváhagyás kell.

## 2026-07-31 — Kezdőoldali figyelmi munkasor

- Az irodai HomePage következő teendői nem önálló workflow-ból jönnek, hanem
  ugyanabból a projekt+rendelés projekcióból, mint a projektmunkatér.
- Bármely projekt- vagy rendelésquery loading/refetch/error állapota lezárja
  az akciósort; hiányos kapcsolatból nem jelenhet meg célművelet.
- A szelet backend/import bővítés nélkül készült, független monitor review-ja
  PASS; a teljes frontend 114/114 teszt, lint és build zöld.

## 2026-07-31 — Kontrollált Doorstar Nexus RAG baseline

- A nyers adatleltár nem kereshető tudás: a `SOURCE_INVENTORY.json`
  korlátozott auditmelléklet, `ragIndexable:false`, teljes forráshash-sel,
  érzékenységi és PROCESS/HUMAN_REVIEW/EXCLUDE döntéssel.
- A Nexus-jelölt réteg kizárólag 6 PII- és rendelésadat-mentes kanonikus
  dokumentumot tartalmaz. Minden claim státusza `VERIFIED`, `INFERENCE` vagy
  `OPEN`, és teljes inventory hash-citációval rendelkezik.
- A manifest célja kizárólag `doorstar`; dry-runban minden write flag hamis.
  Az idempotens dokumentumkulcs id + verzió + kanonikus hash + chunk-policy
  verzió. Nexus-baseline nélkül a `CREATE` csak offline terv.
- Golden dry-run: 6 dokumentum, 98 claim, 41 chunk, 35 eval kérdés, 0 hiba,
  0 warning. A backend build, OpenAPI 3.1 / 83 művelet / teljes route-coverage,
  valamint 39 tesztfájl / 127 teszt zöld.
- Jóváhagyási package hash:
  `34110af5a9ea4c129467034fa3d181cbba6c5601b908abd87be89d078fbae116`;
  report SHA-256:
  `c4e74c696495c96b3ee649d26003ef54fedbbacf28a8b7a2f5c1e320729e5cc2`.
  A validátor 12/12 unit és hardlink/symlink, output-overwrite,
  érzékeny-forrás, delimiter, eval-paritás adverszáriális kapu mellett zöld;
  független QA: PASS, P0/P1 nincs.
- A csomag állapota `HUMAN_APPROVAL_REQUIRED — STOP`. Nexus- vagy ChromaDB-
  betöltés külön emberi jóváhagyás és külön végrehajtási terv nélkül tilos.

## 2026-07-31 — Faipari projekt-UX north star

- Tartós `DOORSTAR_LOCAL` üzleti fókusz: utólag beépíthető beltéri ajtó,
  önálló falpanel-zóna és ajtóhoz kötött blende. A blende a felső vízszintes
  takarás meghosszabbítása fix magasságig vagy plafonig; saját felület/szín
  lehet, de ebből gyártási méret vagy BOM automatikusan nem következik.
- A frontend role saját Nexus-keresése ajtóméret- és dokumentációs fogalmakhoz
  közepes, falpanel-csomópontokhoz alacsony–közepes advisory evidence-et adott.
  Releváns blende-találat nem volt; a negatív találat megőrzendő, de nem
  állapot-authority és nem vétózhat emberi/backend domain review-t.
- Kanonikus új igényhivatkozások: backend inbox
  `2026-07-31_015_frontend-door-blende-wall-panel-contract.md`, import inbox
  `2026-07-31_010_import-discovery-blende-wall-panel-mapping-request.md`.
  A casing role csak profilfüggő, jelen levő casing tulajdonsága; a fizikai
  oldal továbbra is kizárólag `SIDE_A/SIDE_B`.
- A header-alapú identity csak olvasási védőháló. Az új product-spec minden
  mutationje validált OIDC Bearer identityig fail-closed; addig a frontend
  read-only. Végső független review: PASS, P0–P3 finding nincs.

## 2026-07-31 — Felmérési forrás nem egyenlő felmért ténnyel

- Tartós invariant: fájl jelenléte, strukturált pozícióadat és lezárt felmérés
  három külön tény. Fájlnév, mappaút vagy Sales-érték önmagában nem workflow-
  authority.
- A minimális, végrehajtható kézi felmérési lineage: teljes kötelező mezők,
  `SURVEY` dokumentum, minden pozícióhoz exact dokumentumverzió-link és jogosult
  stage-döntés. Mező-evidence nem kötelező, de ha létezik, teljes attribútált
  `RESOLVED` audit nélkül blokkol.
- DSMR-26148 képi felmérési lapjának DSMR-mezője üres; a 26148-as kapcsolat csak
  mappa-, név- és cím-inferencia, ezért review-köteles jelölt marad. A kézírás
  automatikus strukturálása tilos.

## 2026-07-31 — RAG-ingest biztonsági invariant

- A Doorstar aktuális keresési célja a shared Nexus-dev 3466 mögötti
  `doorstar` sziget / `doorstar-knowledge` collection; a frozen 3460-as példány
  és a generikus `/api/knowledge/index` nem használható csomagbetöltésre.
- Immutable dry-run csomagot nem írunk át emberi approval után. Az élő
  authorization külön hash-pinnelt overlay és tartalommentes receipt.
- Chroma apply nem használhat `getOrCreateCollection`, memória-fallbacket,
  `delete({})`-t vagy metadata/content alapú törlést. Csak exact collection és
  exact ID megengedett, restricted backup + automatikus rollback mellett.
- A biztonságos sorrend: teljes baseline-fingerprint; 23 legacy exact backup;
  41 explicit 384 dimenziós embeddinges upsert; 41/41 exact verify; csak ezután
  23 exact delete; végső count 2016 és untouched-fingerprint ellenőrzés.
- Titokszerű legacy tartalmat sem konzol, sem receipt, sem repository nem
  idézhet. A backup repositoryn kívüli és korlátozott jogosultságú.

## 2026-07-31 — Exact projektlánc authority és klienskonzisztencia

- A projektcockpit állapot-authorityja az exact rendelési revízióhoz kötött
  backend readiness + workflow projekció. A kliens nem számolhat saját
  workflow-állapotot és API command hrefet nem tehet kattinthatóvá.
- Az endpointon belüli multi-read projekció egyetlen `REPEATABLE READ`
  snapshot. Mivel a readiness és workflow két külön HTTP-kérés, a frontendnek
  az ORDER↔ORDER_REVIEW, COMPONENTS↔COMPONENT_SNAPSHOT és
  OPERATIONS↔OPERATION_PLAN párokat state/role/href/blocker/action szinten is
  exact össze kell vetnie. Bármely eltérés teljes fail-closed panelt jelent.
- `CONTRACT_REQUIRED` és `NOT_AVAILABLE` nem jelenhet meg „Itt tart” üzleti
  kapuként. PlanningProposal, immutable IssuedWorkPackage, 6-stage runtime és
  handover authority nélkül nincs kiadás vagy gyártási művelet.
- A következő vertikális szelet a read-only Product Position Register. Az
  utólag beépíthető beltéri ajtó és a falpanel külön pozíció; a blende az
  ajtóhoz tartozó felső takarás fix magasságig vagy plafonig, önálló felület-
  és színadattal, de gyártási méret/BOM inferencia nélkül.
- Freeze alatt minden agentnek nemcsak a RAG könyvtárat, hanem a
  `SOURCE_INVENTORY.json` konkrét forrásútvonalait is explicit át kell adni.
  A production OpenAPI pinelt forrás; a 2026-07-31-i describe-only drift
  jelenlegi stabil hash-e
  `555d90a095ee757e75d78f294e68584bfc878ac82218397ad437f9ea626c204d`.

## 2026-08-01 — UX referencia és read-only műveletterv authority

- A stabil helyi UX-fixture kulcsa `UX-REFERENCE-RETROFIT-001`. Kizárólag
  fejlesztési adat; a seed célguardja protokollt, loopback hostot, exact DB-
  nevet, sémát és megerősítéseket vizsgál. Idempotensen csak ezt az exact
  projektet építi újra a meglévő API-kapukon át.
- A rendelési revízió kiválasztása URL-címezhető. Történeti revízió mindig
  read-only; invalid query látható latest fallbackot ad, de explicit query-
  törlő helyreállításig nem ad írási authorityt.
- Az OperationWorkspace most a backend `OperationPlanSnapshot` exact GET-
  projekcióját fogyasztja. A kliens kizárólag explicit műveletsort és szerver-
  sequence-t mutat; loading/error/empty/lineage mismatch/non-ready esetben
  nulla sorral és nulla akcióval fail-closed.
- `VERIFIED` műveletterv nem gyártási kiadás. PlanningProposal, immutable
  IssuedWorkPackage, 6-stage runtime és handover nélkül a release
  `NOT_AVAILABLE`; a UI nem kínál helyettesítő műveletet.
- Az advisory Nexus-találatok csak a dokumentációs rétegek elkülönítését
  támogatták közepes/alacsony bizonyossággal. Fixture-méret, alkatrész,
  művelet, workflow-állapot vagy jóváhagyás nem származott RAG-ból.

## 2026-08-01 — Átadólap-hierarchia és live RAG minőségi korlát

- Az irodai rendelési oldal alapnézete ne legyen teljes auditdump. A tartós
  sorrend: rövid Sales-átadási fejléc → exact következő teendő/hiány →
  megnyitható pozíciók → alapból zárt műszaki, dokumentum-, evidence- és
  auditanyag. A Sales-forrás továbbra sem production release.
- A rövid státuszszöveg ugyanúgy authority-határ: refetch alatt pending,
  invalid querynél latest-but-locked, történeti revízión read-only. A
  szerepkör szerinti next action csak meglévő kaput nyithat meg.
- A DSMR 24181 teljes táblája nem képezhető veszteségmentesen a jelenlegi DTO-
  ból. Nyers határidőszöveg, kelte/készítő, oldalankénti megjelenés, részletes
  vasalat/furat, tokborítás és profil külön jövőbeli contract nélkül evidence.
- A RAG v1.0 live és idempotensen ellenőrzött, de a post-live retrieval eval
  gyenge (13/35 dokumentum, 1/35 teljes claim). A v1.0 immutable; v1.1 csak új
  dry-run + approval után jöhet. Addig a retrieval különösen nem alkalmas
  automatikus UI-default, gyártási adat vagy jóváhagyási döntés képzésére.

## 2026-08-01 — RAG v1.1 tartós tanulságok

- A claim-sor épsége és a teljes provenance szükséges, de nem elégséges
  retrieval-minőség. A v1.1 98/98 exact claim-lineage mellett is csak 18/35
  teljes claim-match értéket ért el @20-ban.
- A package-only minőségmérést és a teljes, vegyes Doorstar-szigeti MCP smoke-ot
  külön kell kezelni. Egyik sem helyettesíti a másikat.
- Több-claim kérdéshez a következő biztonságos irány kétlépcsős retrieval:
  előbb dokumentum/téma, majd az ottani claimhalmaz. A küszöböket a mérés előtt
  kell jóváhagyni; kanonikus állítás vagy eval-kérdés utólagos hangolása tilos.
- Az inventoryban nyilvántartott, de claim által nem hivatkozott append-only
  handoff drift diagnosztika lehet; hivatkozott source hash driftje mindig
  blokkoló. Az immutable reportot körkörös újrapinelés miatt nem írjuk át.
- A live-v1 baseline csak a receiptben rögzített nyers report-hash és exact
  dokumentum-/chunkkulcsok mellett használható. Duplikált JSON-kulcs és
  write-enabled input minden offline kapun fail-closed.
- RAG-találat továbbra sem képezhet automatikus ügyfél-, rendelés-, műszaki,
  review-, reviewer- vagy production-release adatot a webalkalmazásban.

## 2026-08-01 — Következő munkamenet indítási checkpoint

- A folytatás alapja az élő, immutable v1.0 és a repositoryban maradó,
  `HOLD_FOR_RETRIEVAL_TUNING` állapotú v1.1. A v1.1-et nem szabad egyszerűen
  applyolni a korábbi általános jóváhagyásra hivatkozva.
- Első folytatási feladat kizárólag offline, kétlépcsős retrieval-kísérlet,
  változatlan kanonikus dokumentumokkal és evalkészlettel. Az acceptance-
  küszöböket futtatás előtt kell rögzíteni.
- Második, külön engedélyt igénylő feladat a 3460-as Knowledge Service tartós
  process-felügyelete. A jelenlegi session-scope process egészséges, ezért
  diagnosztikai okból sem indítandó újra.
- A részletes bizonyíték a v1.1 review-ban, az élő v1 receiptekben és az import
  handoff naplóban van; nyers üzleti dokumentumot vagy retrieval-tartalmat nem
  kell a memory/state fájlokba másolni.

## 2026-08-01 — Eszközmódok és egykezes irodai használat

- Az office UI három stabil tartománya: telefon `<=620 px`, tablet
  `621–1023 px`, PC `>=1024 px`. Ez nem három adatmodell: a pozíciórészlet egy
  markupból és egy exact-revíziós authorityból készül.
- Telefonon az alsó, ötelemű navigáció és a fix Vissza gomb az egykezes
  használat alapja. A ritkább Import/üzemi/téma/szerep funkciók a Továbbiak
  panelbe kerülnek. Útvonalváltás, Escape és visszalépés után a fókusz
  determinisztikusan helyreáll, az aktív route jelölése egyértelmű.
- Mobilon egyszerre kevés adat látszik, de kritikus, pending, invalid és
  authority-hiányos tartalom soha nem rejthető el. Tableten kétpaneles
  áttekintés, PC-n dokumentumszerű átadás az alap; a fizikai `SIDE_A/B` és a
  profilszerep `FIXED/ADJUSTABLE` tengelyei minden méreten külön maradnak.
- A rendelési pozíció szerkesztőlinkje nem puszta szerepkör-affordance:
  latest + valid + nem-refetching + megfelelő szerep + `DRAFT` + pontos stage
  együttesen kell. Minden más állapot DOM-szinten zárt.
- A referencia-handoff feldolgozott: `UX-REFERENCE-RETROFIT-001` helyi fejlesztői
  fixture. Alkatrész- és műveletsorai explicit snapshotok, ezért nem szabad
  automatikus rendszerkalkulációként vagy RAG-authorityként kommunikálni.

- Telefonos kiválasztott-detail esetén nem elég a listát elrejteni: a desktop/
  tablet grid-template-et is egy oszlopra kell felülírni. Done-kapu, hogy a
  detail és a használható workspace bounding widthje 320–620 px között azonos;
  621 px-től a tablet kétpaneles mód marad.

- A React DevTools dev-konzolsora információ, nem alkalmazáshiba. Valódi
  konzolkapu a warning/error és a hibás hálózati erőforrás; a favicon explicit,
  verziózott public asset, friss böngészőlapon 200-as helyes MIME-mal.

## 2026-08-01 — 26133 lánc- és authority-döntések

- A Sales-lap a rendelési szándék forrása, és a gyártás is megkaphatja, de nem
  gyártási kiadás. Gyártólap/Szabászati/Mennyiségek/Munkamenet generált legacy
  artifact; package preview/review után is csak immutable IssuedWorkPackage
  adhat production authorityt.
- A 26133 stabil pozíciókulcsa `01–06`; lábazat és accessory külön entitáság,
  aggregatescope nem osztható szét ajtónként heuristikával.
- A production Sales PII írás nem nyitható meg a login nélküli `X-Role` modellre.
  DSORD-18 szükséges OIDC principal/RBAC, idempotency, serializable create,
  stable 409 és teljes rollback szerződéssel.
- Forráshű Sales v2-ben a hónap-pontosság, raw cm+unit+conversion lineage és a
  külön leaf face/frame/FIXED/ADJUSTABLE/blende surface targetek az approval
  hash részei. A backend normalizál; a kliens nem talál ki napot vagy oldalt.
- A DEV intake használható a jelenlegi szűk, nyíltan veszteséges v1 piszkozat
  kipróbálására. Production bundle-ben a submit handler csak `preventDefault`,
  az űrlap disabled és az auth blocker látható.
- A 26133 parsercandidate az exact dokumentumverziót, hasht, lokátort és rule-
  verziót is a kulcsába veszi. Text-layer nélküli vizuális adat csak auditált
  determinisztikus OCR/render vagy kétlépcsős emberi evidence lehet.
- A mostani slice közvetlen PDF evidence-re épült; Nexus/RAG nem volt szükséges,
  és nem adott gyártási vagy jóváhagyási authorityt.

## 2026-08-25 — Identity-authority M0 tartós döntés

- A tiszta `origin/main`-re épített M0 kizárólag source-only, default-off M2M
  resolver kliens. Nem route, nem BFF és nem próbaüzemi aktiválás.
- A config négy kulcsa együtt engedélyez, teljes hiánynál disabled, részleges
  állapotnál hiba. A production factory saját process-transportot használ;
  humán bearer sem API-ban, sem Kernel-kérésben nincs.
- A Kernel response v1 grant-grammatikája fogyasztói, véges allowlist; az
  ismeretlen grant, nem kanonikus tenant/cutoff, proxy/TLS-insecure környezet,
  túlméretes/hibás válasz és timeout mind fail-closed.
- M0 bizonyíték: 48/48 célzott unit, build és OpenAPI 85/85 zöld; két független
  security/quality review P0/P1 nélkül. A teljes suite két régi, scope-on kívüli
  artifact/RAG hibát tartalmaz, ezért nem szabad a címkéit vagy pinjeit M0-ban
  átírni.
- Próbaüzem előtt még külön M1 control-plane/BFF, Kernel snapshot reconciliation
  és release-attestation, majd emberileg engedélyezett eldobható local stack kell.

## 2026-08-25 — M1 control-plane tartós tervdöntés

- Az első Doorstar trial nem fogja a nem tenantolt üzleti táblákat „félig"
  multi-tenanttá tenni. Egy dedikált instance-ben pontosan egy aktív Kernel
  tenant binding, tokenmentes resolved evidence és rövid opaque session az új
  varrat; ez nem RLS-készültségi állítás.
- A persisted evidence/session nem tartalmaz humán bearer/access/refresh tokent,
  M2M tokent/assertiont, privát kulcsot, `jti`-t, `consumerId`-t, role-t vagy
  stationt. Csak exact identity/version/grant/cutoff snapshot és HMAC-olt
  cookie/CSRF lookup maradhat szerveroldalon.
- A Kernel authorityt a trialban minden védett üzleti kérés előtt újra kell
  feloldani. 404/lifecycle/version/cutoff/grant mismatch deny; timeout/429/5xx
  és szerződéshiba unavailable/fail-closed. Authority cache nincs.
- A tenant binding SQL-szinten immutable/disable-only; disable tranzakciósan
  revoke-olja az élő sessionöket. A `__Host` session/CSRF cookie és exact Origin
  későbbi M2 szerződés, jelenleg semmilyen cookie vagy BFF route nem fut.
- A végső security-, architektúra- és adatmodell-review után nincs P0/P1. A
  session revoke DB-szinten egyszeri, a session→evidence kapcsolat kompozit
  binding FK-val védett, az authority-mezőket pedig session-state MAC fedi.
  Két tenantos pozitív E2E csak két külön Doorstar instance-ben futhat; egy
  instance-ben legfeljebb egy aktív binding lehet.

## 2026-08-25 — M1A source-only control-plane alapréteg

- Elkészült a Doorstar instance teljes élettartamára szóló, egyetlen
  immutable/disable-only tenant-binding tiszta domainvalidációja. A binding
  csak `ACTIVE` v1-ként indulhat, `ACTIVE → DISABLED` tranzíciója pontosan egy
  verziólépés, rebind/delete pedig a későbbi DB-invariánsban is tiltott.
- A binding-, proof-, resolver-state- és időértékek descriptor-snapshotból
  validálódnak: getter, setter, sparse/extra array, örökölt vagy nem kanonikus
  mező fail-closed; nincs TOCTOU alapú capability-csere.
- Az opaque proof brand és az evidence-összeállítás privát maradt. Az
  `evidence.ts` futásidejű exportfelülete üres; a tesztelt `evidencePolicy`
  csak authority-artefaktum nélküli `accepted`/`denied` döntést ad, nem tud
  proofot, evidence-et, capabilityt vagy sessiont kiállítani.
- Bizonyíték: M0+M1 célzott Vitest 84/84 PASS, TypeScript build PASS,
  független security és domain review P0/P1 nélkül. A teljes unit suite
  158/160: a két változatlan baseline hiba a planning input-pack SHA pin és a
  RAG candidate dry-run validator driftje; M1A egyik artefacthoz sem nyúlt.
- Prisma schema/migration, adatbázis, Keycloak, cookie, route, OpenAPI,
  credential, VPS és deploy nem indult. Következő M1B: perzisztencia/migration
  source, majd külön jóváhagyott eldobható PostgreSQL `migrate deploy` proof.

## 2026-08-25 — M1B perzisztencia és próbaüzemi kapuk

- Az M1B source kizárólag három új control-plane táblát és egy forward-only
  migrationt ad: `DoorstarInstanceTenantBinding`,
  `IdentityAuthorityEvidence`, `DoorstarSession`. Nem tárolhat humán bearer,
  refresh/M2M token, assertion, privát kulcs, role, station vagy consumer-id.
- A binding az instance teljes élettartamára singleton; csak az inicializáló
  `ACTIVE` v1 és egy auditált `ACTIVE → DISABLED` átmenet legális. Rebind,
  delete, reactivation és `TRUNCATE` DB-szinten tiltott. Disable ugyanabban a
  tranzakcióban revoke-olja az aktív sessionöket.
- Evidence append-only, session state-machine-es. Exact wire/epoch/nanos
  időtriple-ek és state/HMAC kulcsverziók adatbázisban ellenőrzöttek. A session
  capabilityt a canonical immutable evidence grant-listájából a trigger vezeti
  le, ezért nem jön létre külön, MAC nélküli authority drift.
- Trigger-biztonság: `ENABLE ALWAYS` + `BEFORE TRUNCATE` guard, database-owned
  `createdAt`, valamint `pg_catalog, <migration-schema>, pg_temp` trusted
  search path; a migration proof hostile azonos nevű `clock_timestamp()` és
  temporary binding table mellett is ezt bizonyítja.
- A migration proof célguard csak a
  `DOORSTAR_M1B_MIGRATION_PROOF=approved-disposable-postgres` explicit opt-in
  és a `DOORSTAR_M1B_MIGRATION_TEST_URL` alapján működik. Nem olvas normál
  adatbázis env-et, csak loopback/exact `doorstar_m1b_migration_test` DB-t és
  generált sémát fogad el; a `5462` persistent port kizárt. A DB-proof még nem
  futott, mert nincs hozzá külön emberi jóváhagyás.
- Trial-gate: az admin/disposable migration executor nem bizonyítja a BFF
  runtime role biztonságát. M2 előtt auditált preflight kell: runtime nem
  owner/superuser, nincs `SET ROLE` ownerre, nincs `PUBLIC`/untrusted schema
  `CREATE`, nincs DELETE/TRUNCATE/DDL út. A binding lockhoz szükséges PostgreSQL
  `FOR SHARE` miatt legfeljebb immutable `binding.id` column-level UPDATE grant
  adható; lifecycle update külön provisioning principal.
- M1B statikus review P0/P1 tiszta. Ellenőrzés: Prisma validate/generate,
  identity 92/92, migration target guard 8/8, build és OpenAPI 85 operation
  zöld. Full unit: 166/168, azonos két régi baseline failure (planning SHA pin,
  RAG dry-run validator drift), M1B scope nem érintette őket.
