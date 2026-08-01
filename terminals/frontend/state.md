# Doorstar frontend state

Frissítve: 2026-08-01

- A projekt UI/UX munkája aktív; az aktuális funkcionális részletek a `memory.md`-ben vannak.
- Codex custom agent: `doorstar_frontend`.
- Nexus audit principal: `doorstar-frontend-codex`; az identity/scope smoke és a
  live regisztrációs handoff igazolt, a kliensoldali határ továbbra is kizárólag
  olvasási és advisory.
- Legutóbbi frontend szelet: mind a 17 leaf oldal route-szinten, named-exportot
  megőrző dinamikus importtal töltődik. Az `AppShell` és `ProductShell` eager
  maradt; az oldaltartalom `Suspense` fallbackje magyar, `role="status"` és
  `aria-live="polite"`, ezért a navigáció betöltés közben sem tűnik el.
- A production build fő JS chunkja 691,16 kB-ról 370,06 kB-ra (gzip 114,04 kB)
  csökkent, a korábbi 500 kB-os Vite warning megszűnt. A legnagyobb további JS
  chunk 39,99 kB. Független route-/authority-review: PASS, P0–P3 finding nincs.
- QA: 36/36 tesztfájl, 143/143 teszt, TypeScript lint, production build,
  diff-check és a hat Codex-agent szerződésvalidációja zöld. A `/`, `/board`
  és a mély munkamenet-route desktopon betölti a megfelelő eager shellt és
  lazy leaf oldalt; a `/` 390×844 mobilnézetben dokumentum-overflow nélkül
  jelenik meg. A helyi API a route-QA egy részében 500-at adott, ezért a
  felület forráshű fail-closed üzenetet mutatott; ez nem route-chunk regresszió.
- Ez tisztán technikai betöltési/performance változás, API-, authority- és
  faipari állítást nem módosított. Nexus-lekérdezés nem kellett, deploy nem
  történt.
- Az exact projektlánc root browser-QA-ja is lezárult a szerveroldali
  `QA-READINESS-20260731` projekción: 1440 és 390 px, dark és light témában
  egyetlen projektnevű `h1`, nulla dokumentum-overflow és tiszta végső konzol.
  Az Alkatrészképzés kapu Enterrel kiválasztható, az `aria-pressed` állapot és
  a lokalizált blocker-/felelős-részlet együtt frissül. Mutation nem történt.
- Legutóbbi frontend szelet: a projektcockpit és az örökölt munkamenet
  resilience-hardeningje. A projektnek szerkesztőként is pontosan egy,
  projektnevű `h1` címe van; a törzsadat-műveletek query-refetch, hiba és
  mutation pending alatt DOM- és handler-szinten fail-closed maradnak.
- Az örökölt munkamenet teljes-fa `PUT` szerződéséhez nincs munkalap-revízió,
  ETag vagy atomi compare-and-swap. A független concurrency review igazolta,
  hogy egy párhuzamos epik/lépés/Task változást stale mentés törölhet vagy
  elárvíthat; ezért `worksheetWriteAuthorityAvailable = false`, és minden
  szerkesztő, sablon-, mentés-, törlés-, kiadás-, task-modal- és segédlap-írás
  managerként is DOM- és handler-szinten zárt. Read-only megtekintés, nyomtatás
  és projekt-navigáció maradt.
- A backend minimum szerződés a
  `terminals/backend/inbox/2026-07-31_016_frontend-work-session-concurrency-contract.md`
  handoffban van: revízió/ETag, kötelező `If-Match`, tranzakciós 409 és
  PostgreSQL versenytesztek. Ez külön a DSORD-06/DSORD-09 kiadási authoritytől.
- QA: 33/33 tesztfájl, 130/130 teszt, TypeScript lint és production build
  zöld. A build egyetlen ismert jelzése a 691,16 kB-os Vite chunk-warning.
- Root böngészős QA kész 1280 px desktop és 390×844 mobil nézeten a valós
  DSMR-24181 projekten: mindkét oldalon egy projektnevű főcím és nulla
  dokumentumszintű overflow; a címmező fókuszkerete látható. A munkamenet
  zárolási indoka látható, mobilon a `main` alatt nulla engedélyezett formmező,
  a kiadás tiltott, a konzol warning/error listája üres. Független végső review:
  PASS, elérhető író mutation vagy bypass nincs.
- DSORD-12 kész: a rendelési adatlapon a két helyiség felőli A/B nézet külön
  kártya, az örökölt FIX/ÁLLÍTHATÓ értékek látható, de kiosztatlan
  forrásjelöltek, a műszaki és nyers részletek alapból zártak. A mobil
  táblázat natív fejléc-szemantikával, fókuszolható belső scroll-régióban marad.
- A faipari háttérhez kizárólag a `doorstar_knowledge_frontend` Nexus keresés
  készült. A korpusz a tokborítás/tokmag/falvastagság elkülönítését támogatja,
  de a FIX/ÁLLÍTHATÓ és A/B tengely pontos Doorstar-viszonyát nem igazolta
  önállóan; a UI ezért a kijelentést az örökölt Doorstar forrásra szűkíti.
- DSORD-12 QA: célzott 9/9 DOM-teszt, teljes suite, TypeScript lint és build
  zöld; 1440 light és 390 dark nézetben nincs dokumentum-overflow vagy
  warning/error konzolbejegyzés. Deploy nem történt.
- A legutóbbi resilience szelet technikai UI/query hardening volt, ezért nem
  igényelt faipari háttérállítást és `doorstar_knowledge_frontend` lekérdezést.
  Deploy nem történt.
- DSMR-26148 fail-closed forrásszemantika kész: a Pozíció 360° a Sales/import
  mezőket `Rögzített forrásadatok` néven mutatja. Hiányzó SURVEY-kapcsolat,
  kapcsolt SURVEY + nulla evidence és hiányos evidence-audit három külön,
  forráshű állapot; a dokumentumverzió-panel a fájlhivatkozást nem állítja
  tartalmilag ellenőrzöttnek.
- A felmérés véglegesítési előkapuja teljes kötelező mezőket, legalább egy
  felmérési forrásfájlt, minden pozíció közvetlen SURVEY-kapcsolatát és minden
  meglévő evidence teljes `RESOLVED` reviewer-auditját igényli. A backend marad
  az authority; új séma vagy kliensoldali végállapot nem készült.
- QA: célzott 5 fájl / 18 teszt, teljes frontend 33/33 fájl és 130/130 teszt,
  TypeScript lint és production build zöld. Ismert build-jelzés: 691,16 kB-os
  Vite chunk. A worker browser-runtime nem adott elérhető backendet; az élő
  desktop/mobil route-QA a root feladatnak átadva. Nexus-lekérdezés nem kellett,
  mert a változás kizárólag workflow- és forrásszemantika. Deploy nem történt.
- Exact-revision projektlánc frontend kész a `/projects/:key` irodai cockpitben.
  A `GET .../revisions/:revision/readiness` és `GET /projects/:key/workflow`
  válaszát runtime validálja és project/revision/isLatest szerint
  keresztellenőrzi; completed/current/blocked/not-available szakaszt, hiányt,
  felelőst és szerver-next-actiont mutat, de API-mutation href-ből nem készít
  gombot vagy linket. Loading/refetch/error/hiányos DTO/mixed revision/stale
  állapotban nulla akcióval fail-closed.
- A korábbi kliensoldali `nextWorkspace` és `ProjectProcessOverview` kikerült a
  projektcockpit autoritatív döntési helyéről. Az örökölt munkalap továbbra is
  külön, explicit segédfelület; a 6 szakaszos üzemi tábla vizuális és
  authority-határa változatlan.
- A readiness/workflow cross-endpoint snapshot is fail-closed: az ORDER,
  COMPONENTS és OPERATIONS workflow-kapuk exact szerkezete egyezik a párjukul
  szolgáló ORDER_REVIEW, COMPONENT_SNAPSHOT és OPERATION_PLAN kapuval. Mindkét
  DTO top-level blockerlistája a backend `uniqueBlockers` szerinti gate-flatten.
- Readiness QA: célzott 3 fájl / 27 teszt, teljes frontend 36/36 fájl és
  154/154 teszt, TypeScript lint és production build zöld. A root tulajdonú
  browser-QA a `QA-READINESS-20260731` projekción 1440/390 px, dark/light
  nézetben, billentyűzetes kapuválasztással, overflow nélkül és tiszta végső
  konzollal lezárult; deploy nem történt.

## 2026-07-31 — Faipari projektmunkatér termékirány

- Elsődleges `DOORSTAR_LOCAL` fókusz az utólag beépíthető beltéri ajtó,
  mellette az önálló falpanel-zóna. A blende az ajtó felső vízszintes
  takarásának opcionális meghosszabbítása fix magasságig vagy a plafonig,
  külön felület-/színadattal; nem automatikus gyártási méret.
- A saját `doorstar_knowledge_frontend` keresés közepes tanácsadó evidence-et
  adott az ajtóméret-fogalmakhoz és dokumentációs rétegekhez, alacsony–közepes
  evidence-et a falpanel lezárásaihoz/csomópontjaihoz. Blendére nem volt
  releváns találat, ezért a helyi definíció forrása a felhasználó, nem a RAG.
- A P0/P1/P2 UX-backlog a `TODO.md` fájlban él. A szerver-authoritatív
  product-spec/readiness igény a backend `015`, az explicit, lineage-es és
  `UNRESOLVED` import mapping az import-discovery `010` inbox-handoffban van.
- A handoffok többszöri független review után PASS állapotúak, P0–P3 finding
  nélkül. Validált OIDC identity elkészültéig az új product-spec mutationök
  tiltottak és a frontend read-only marad. Alkalmazáskód, deploy és adatbázis
  nem változott.

## 2026-08-01 — Adatgazdag rendelési revízió UX

- A `/orders/:projectKey` adatlap egyszerre egy kiválasztott revíziót mutat.
  Alapértelmezés a legfrissebb; a `?revision=N` deep link exact történeti
  pillanatképet nyit meg. Ismeretlen vagy hibás revízióparaméter látható
  figyelmeztetéssel a legfrissebbre esik vissza, de minden írási lehetőség
  fail-closed marad.
- A natív, billentyűzettel kezelhető revízióválasztó mellett pozíció-,
  dokumentum-, gyártott-tétel- és tartozékdarabszám látszik. A történeti
  revízió read-only; Felmérés és Műszaki előkészítés csak a legfrissebb
  revízión nyitható, az exact-revíziós alkatrész- és műveletterv-link megmarad.
- Az új `OfficeProjectNavigator` az irodai projektmunkatereket köti össze, de
  külön kimondja, hogy nem readiness-authority. A projektcockpit marad a
  szerver által ellenőrzött státusz, hiány és következő teendő helye.
- Mobilon a saját navigátor 2×3-as rács, belső és dokumentumszintű vízszintes
  túlcsordulás nélkül. A globális fejléc zsugorodási hibája is javítva: a
  több sorba tört header lefoglalja a teljes magasságát, a nav görgethető,
  a témakapcsoló pedig 44 px-es és működő cél.
- A projektcockpit breadcrumbja most a route-stabil `project.key` értéket
  mutatja a félrevezető munkaszám helyett.
- Helyi, adatbázisos referencia: `UX-REFERENCE-RETROFIT-001`; R01 történeti,
  R02 jóváhagyott, 3 pozíció, 3 dokumentum, 7 explicit alkatrészsor és 4
  explicit művelet. A fixture és az adatbázis a backend tulajdona; frontend
  adatmutáció és deploy nem történt.
- Saját célkapuk: OrderDetail + OfficeProjectNavigator 10/10 teszt,
  ProjectDetail 7/7 teszt, TypeScript lint és production build zöld. A közös
  fa végső kapuja 38/38 tesztfájl és 168/168 teszt, lint és production build.
- Browser QA: 1440×1000 és 390×844, világos/sötét; legfrissebb és történeti
  revízió, natív fókusz és kiválasztás, 1 részletfa, tiszta konzol, az új
  navigátornál és dokumentumszinten nulla overflow. A böngésző átadási URL-je:
  `http://127.0.0.1:4611/orders/UX-REFERENCE-RETROFIT-001`.
- A független review frontend P2 észrevétele javítva: hibás revíziós deep
  linknél külön, 44 px-es és fókuszjelölt helyreállító link törli a queryt;
  böngészőben a warning eltűnik és a legfrissebb route nyílik meg. A saját
  végső célkapu 3 fájl / 17 teszt zöld.
- Új backend/import-contract nem kellett. A VERIFIED OperationPlan snapshot
  read-only frontend adoptionja elkészült; write/review és production release
  továbbra sem nyílik meg ebből a szeletből.

## 2026-08-01 — Mobil office shell fejléc

- A mobil header átfedésének oka a 100vh-s flex shellben zsugorodó fejléc volt:
  a header doboza 24,8 px-re csökkent, miközben a három sorba tört gyermekei
  128 px-ig kilógtak. A header most `flex: none`, így ténylegesen lefoglalja a
  tartalmának magasságát.
- A mobil témakapcsoló minimum 44 px magas. A nav továbbra is érintéssel és
  billentyűzettel vízszintesen görgethető, de a vizuális scrollbar rejtett.
- Élő 390×844 QA: header 141,9 px, nav alja 129,1 px, az oldal hero kezdete
  192,4 px; nincs átfedés. A 90,9×44 px témagomb dark→light váltott, a
  dokumentumszélesség 375/375 és a scrollbar nem látszik.
- Célteszt: ProductShell + App 2 fájl / 4 teszt zöld; TypeScript lint és
  production build zöld. Backend-, RAG-, OpenAPI- vagy deploy-változás nincs.

## 2026-08-01 — VERIFIED műveletterv read-only adoption

- Az exact `GET .../revisions/:revisionNumber/operation-plan-snapshots`
  szerződés bekerült a frontend típus-, API- és hookrétegébe. A műveletterv-
  oldal kizárólag a backend snapshot auditadatait és explicit sorait mutatja;
  komponensnévből, legacy munkalapból vagy RAG-találatból nem képez műveletet.
- A `UX-REFERENCE-RETROFIT-001` R02 revízióján 1 `VERIFIED` snapshot és 4
  `READY` művelet látszik, a szerver `sequence` értéke szerint
  `10 → 20 → 30 → 40` sorrendben. Loading, query-hiba, üres válasz,
  lineage-eltérés és nem READY snapshot látható okkal, nulla sorral és nulla
  mutation/release akcióval fail-closed.
- A `PRODUCTION_RELEASE · NOT_AVAILABLE` határ változatlan: a snapshot nem
  PlanningProposal, nem immutable IssuedWorkPackage és nem üzemi kiadás.
- Végső QA: OperationWorkspace 6/6 célteszt; teljes frontend 38/38 fájl és
  168/168 teszt; lint és build zöld. Böngészőben 1440×1000 és 390×844,
  világos/sötét téma, egy H1, négy explicit sor, dokumentum-overflow és
  warning/error konzolbejegyzés nélkül. Deploy nem történt.

## 2026-08-01 — Kompakt Sales–gyártás átadólap

- A `/orders/:projectKey` alapnézete a DSMR 24181 Sales-lap vizuális
  hierarchiáját követő, papírszerű összefoglaló: projekt/ügyfél, vállalt idő,
  exact revízió/állapot és konkrét következő teendő látszik először.
- A pozíciók rövid, külön megnyitható sorok. A munkafolyamat-, dokumentum-,
  alkatrész-, evidence- és auditblokkok egy alapból zárt natív `details`
  alatt maradnak; adat nem veszett el, de az első képernyő nem auditfal.
- A felület kétszer is kimondja, hogy Sales-forrásnézet, nem gyártási kiadás
  és nem jóváhagyási bizonylat. REVIEW + jóváhagyó esetben a felső CTA csak a
  meglévő jóváhagyási kaput nyitja és fókuszálja, új mutationt nem hoz létre.
- Background order-refetch alatt a kritikus összefoglaló fail-closed pending.
  Hibás revízióquerynél a latest fallback pontosan helyreállításig zárolt,
  nem történeti címkéjű, és nem kínál író vagy alkatrészképzési akciót.
- A tablet office header 940 px alatt két sorba törik. Root mérésen 735 px-nél
  a dokumentum/header `720/720`, a main `705/705`; nincs vízszintes overflow.
- QA: célzott OrderDetail + ProductShell 2 fájl / 10 teszt; teljes frontend
  38/38 fájl és 170/170 teszt; TypeScript lint és production build zöld.
  Browser: 1440×1000, 1280×720, 735 px és 390×844, light/dark, tiszta konzol,
  nyitható pozíció és disclosure. Független verdict PASS, P0–P3 nincs.
- Az alap UX-sűrítéshez nem kellett backend- vagy import-contract. A teljes
  DSMR-lap-hű strukturálás később külön szerződést kérhet a nyers határidő,
  kelte/készítő, oldalankénti felületek, vasalat/furat, tokborítás és profil
  veszteségmentes tárolására; addig ezek forrásevidence-ek. Deploy nem történt.

## 2026-08-01 — Külön telefon-, tablet- és PC-mód

- A rendelési átadólap három explicit office UX-módot kapott: telefon
  `<=620 px`, tablet `621–1023 px`, PC `>=1024 px`. Mindhárom ugyanazt az
  exact revíziós adat- és authority-modellt használja; nem készült párhuzamos
  mobil részletfa vagy kliensoldali workflow.
- Telefonon ötelemű, safe-area tudatos alsó navigáció működik. Az első négy
  cél az Áttekintés, Rendelések, Sales és Projektek; az Import Inbox, Üzemi
  tábla, téma és szerep a `Továbbiak` panelben marad. A route-váltás és Escape
  bezárja a panelt, a fókusz visszatér, és egyszerre pontosan egy
  `aria-current` marad.
- A telefonos pozíciólista kevés adatot mutat. Egy tétel megnyitásakor a lista
  helyett pontosan egy részlet jelenik meg; a fix, 48 px-es `Vissza a
  tételekhez` gomb az alsó menü felett egy kézzel elérhető, és kattintásra vagy
  Escape-re visszaadja a fókuszt a megnyitó sornak. A kritikus, pending és
  invalid állapotok tartalma kis képernyőn sem rejtőzik el.
- Tableten kétpaneles munkatér marad, 280 px-es pozíciólistával és olvasható
  részletoszloppal. A fizikai `SIDE_A` és `SIDE_B` külön kártya, de egymás
  alatt jelenik meg. PC-n a korábbi letisztult, papírszerű Sales-átadás és a
  tág kétpaneles részlet maradt.
- A reviewer által talált authority-rés lezárult: pozíciószintű szerkesztési
  link csak latest, valid, nem-refetching, megfelelő szerepű `DRAFT`
  revízión és a pontos intake stage-ben jelenhet meg. REVIEW, APPROVED,
  historical, invalid és reader állapotban nincs ilyen akció. A modern és a
  legacy `matchMedia` listener ág kölcsönösen kizáró és azonos callbackkel
  takarít.
- QA: célzott 3 fájl / 37 teszt, teljes frontend 38/38 fájl és 193/193 teszt,
  TypeScript lint és production build zöld (165 modul). Böngészős mátrix:
  390×844, 820×1180 és 1440×1000; világos/sötét téma, fókusz/Escape,
  `aria-current`, one-hand Back/More rétegezés és nulla dokumentum-overflow.
  Független `doorstar_monitor` closure review: PASS, P0–P3 finding nincs.
- A `2026-08-01-ux-reference-project-fixture.md` frontend handoff feldolgozva:
  a `UX-REFERENCE-RETROFIT-001` kizárólag helyi fejlesztési fixture, explicit
  7 soros alkatrész- és 4 soros műveletsnapshotokkal; nem automatikus Doorstar-
  kalkuláció. Új backend-, import- vagy RAG-contract, adatbázisírás és deploy
  nem keletkezett.

## 2026-08-01 — Mobil pozíciórészlet teljes szélessége

- A telefonos detail módban rejtett lista mellett bennmaradt a desktop/tablet
  kétoszlopos grid. Emiatt 390 px-es viewporton a 353,6 px használható
  munkatérből csak 320 px-et foglalt el a részlet, egy üres oszlop maradt.
- A `<=620 px` szabály most explicit `minmax(0, 1fr)` egyoszlopos griddé
  alakítja a `.order-position-360-workspace.has-detail` munkateret. Extra
  width-hack és új markup nem kellett; a részlet 353,6/353,6 px, az üres
  szélesség 0 px.
- Browser QA: 320, 390 és 620 px telefonon detail/workspace azonos szélesség,
  rejtett lista és nulla overflow; 621 és 820 px-en a tablet 280 px + detail
  kétpaneles mód változatlan. Világos és sötét téma vizuálisan ellenőrizve.
- QA: OrderPosition360 7/7; teljes frontend 38/38 fájl, 193/193 teszt; lint és
  build zöld (165 modul). Független monitor closure review: PASS, P0–P3
  finding nincs. Backend-, import-, authority-, adatbázis- és deploy-változás
  nem történt.

## 2026-08-01 — Favicon és fejlesztői konzol tisztázása

- A korábbi implicit `/favicon.ico` kérés 404-et adott. Új, statikus Doorstar
  ajtó+csillag `public/favicon.svg` készült, az `index.html` explicit
  `rel="icon"`, `image/svg+xml`, `/favicon.svg` hivatkozásával.
- A friss böngészőlap `/favicon.svg` kérése 200, content-type `image/svg+xml`;
  warning/error konzolbejegyzés nincs. A React DevTools letöltését ajánló sor
  fejlesztői `info`, nem alkalmazáshiba, ezért nem lett elnyomva; production
  buildben nem jelenik meg.
- Lint és production build zöld (165 modul); a `dist/favicon.svg` byte- és
  SHA-256-azonos a public forrással, a buildelt HTML tartalmazza a linket.
  Független monitor review: PASS, P0–P3 finding nincs. Backend-, adatbázis- és
  deploy-változás nem történt.

## 2026-08-01 — 26133-forrásvezérelt Sales intake

- A kilencoldalas 26133 dokumentumcsomag közvetlen evidence-auditja igazolta a
  hat `01–06` ajtópozíciót, a külön lábazatot és két accessory tételt, a
  pozíciónkénti Gyártólap/Szabászati lineage-et, valamint a projektaggregált
  Mennyiségek/Munkamenet kimeneteket. RAG-claim nem kellett.
- A `/orders/new` most valódi Sales-piszkozat parancsot készít az existing DEV
  API-hoz: projekt-, ügyfél-, kapcsolat-, cím- és megjegyzésadatok; stabil
  draft-ID; kompakt pozíciólista; egyszerre egy szerkesztő; nyers Sales
  ajtótípus/nyitás/felület/üvegezés/megjegyzés; kerekítésmentes cm→mm.
- Telefonon csak a lista vagy a kiválasztott, teljes szélességű részlet látszik;
  a fix Vissza gomb nem fedi az alsó navot, Escape után a fókusz visszatér.
  Tableten és PC-n a lista+részlet kétpaneles; desktop/tablet kiválasztás nem
  rántja el a fókuszt az editorra.
- Normalizált pozíciókód-duplikáció minden érintett sort blokkol, az új sor a
  legkisebb szabad `01–99` kódot kapja. A hónap-pontosságú határidő és az eltérő
  ajtólap/tok/tokborítás/blende felület explicit jelzővel handler-szinten zárt;
  nem lapul singular mezőbe és nem találunk ki napot.
- Production buildben a teljes Sales PII POST
  `AUTHENTICATED_SALES_PRINCIPAL_REQUIRED` állapotban DOM- és handler-szinten
  zárt. A DEV-kapu nem szerverauth; feloldása a DSORD-18 OIDC/RBAC,
  idempotencia, delivery union, raw dimension lineage és structured appearance
  backend-contractja után lehetséges.
- Handoffok: backend DSORD-17 verziózott gyártási dokumentumcsomag; backend
  DSORD-18 Sales intake v2; import MSG-DOORSTAR-IMPORT-011 parser/output-lineage.
  Az import candidate-kulcs dokumentumverzió-/hash-/locator-biztos, a vizuális
  megjegyzéshez determinisztikus render/OCR vagy kétlépcsős emberi evidence kell.
- QA: célzott 2 fájl / 30 teszt; teljes frontend 40/40 fájl és 223/223 teszt;
  TypeScript lint és production build zöld (166 modul). Browser: 390×844,
  820×1180, 1440×1000, világos/sötét téma, nulla overflow és warning/error;
  mobil Back/Escape/fókusz, desktop fókuszmegőrzés és alsó nav-rétegezés PASS.
  Független closure review: P0–P3 = 0. DB-write, deploy és RAG-írás nem történt.
