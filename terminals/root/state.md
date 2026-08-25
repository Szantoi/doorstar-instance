# Doorstar Root állapot

**Frissítve:** 2026-08-01
**Szerep:** Doorstar ügyfél-specifikus root

## Aktív állapot

- 2026-07-31: elkészült a Doorstar kontrollált Nexus RAG dry-run csomag a
  `docs/projects/doorstar-nexus-rag/` könyvtárban. A korlátozott forrásleltár
  45 tételt kezel közvetlen indexelés nélkül; a kereshető réteg 6 kanonikus,
  PII-/rendelésadat-mentes dokumentum, 98 forrásolt claim, 41 determinisztikus
  chunk és 35 eval kérdés. A dry-run 0 hibával és 0 warninggal zöld,
  Nexus/ChromaDB/network/database write nem történt. Állapot:
  `HUMAN_APPROVAL_REQUIRED — STOP`.
- Végső RAG-bizonyíték: package
  `34110af5a9ea4c129467034fa3d181cbba6c5601b908abd87be89d078fbae116`,
  inventory 45/45 hash- és méretegyezés, validator unit 12/12, független QA
  PASS P0/P1=0. Backend build PASS; OpenAPI 3.1, 83 művelet, teljes
  route-lefedettség; teljes backend suite 39 fájl / 127 teszt PASS.
- 2026-07-29: elkészült az első Doorstar Import Inbox (`/imports`). A fejlécből
  és a kezdőlapról elérhető; listázza az ImportRun állapotát, preview
  artefaktját, mapping-verzióját, forrás-hashét, jelöltszámát és a tesztsémás
  célját. A nézet domain-specifikus; később a platformos DataTable-re
  cserélhető a Doorstar workflow és API megváltoztatása nélkül. Frontend build
  zöld (128 modul).
- Az Import Inbox alkalmazott futásnál már feloldja a létrejött rendelést:
  megjeleníti a projektkulcsot, revíziót, intake-állapotot, pozíció-,
  dokumentum- és feedback-számot, valamint közvetlen rendeléslinket. Az API
  integrációs és OpenAPI-tesztje 4/4 zöld; frontend build zöld.

- 2026-07-29: a Doorstar adatátállási és platformhatár-döntései az
  `docs/decisions/ADR-2026-07-29-doorstar-gradual-data-transition-and-platform-boundary.md`
  dokumentumban rögzítve. Excel/PDF/XLSM források megmaradnak, a rendszer
  relatív hivatkozást + hash-et kezel; a fokozatos betöltés tesztsémás
  `DRAFT`/`SURVEY_PENDING`; visszajelzés `OrderFeedback` rekordban; a
  JoineryTech-kapcsolat csomag- és kontraktusalapú, nem auth/tenant függőség.

- A Doorstar megrendeléstől gyártásig tartó adatút önálló, aktív epicet
  kapott. Egy összetartozó 2026. júliusi helyi mintán a
  `Gyártásmegrendelő → Kalkulátor → Folyamatok → Kiíró` lánc mezőszintű
  szerkezete ellenőrizve lett, rekordértékek másolása nélkül. Az új
  `docs/projects/doorstar-order-data-chain/PROJECT.md` a célmodellt,
  revíziókapukat és DSORD-01…06 megvalósítási sorrendet rögzíti.
- A következő implementációs szelet DSORD-01: a meglévő `Project` gyökér
  kibővítése verziózott megrendelésfejléccel és ajtópozíciókkal. A teljes
  konfigurációs katalógus, kalkulációs szabályok és platformos tervezési
  kiadás későbbi, egymásra épülő feladatok; Excel-képletek/cellahivatkozások
  nem kerülnek át a production-service-be.
- Az adatút kötelező része a kontrollált Excel-import és a dokumentumtár:
  forráshash, mapping-verzió, előnézet, karantén és vezetői jóváhagyás nélkül
  nincs revízióképzés; dokumentum új verzióként kerül be, kiadáskor pedig
  konkrét dokumentumverzióra rögzített hivatkozás készül.
- A dokumentumtár SharePoint-alapú lesz, Graph API-s, site-szinten korlátozott
  olvasási jogosultsággal. Az LLM/GraphRAG csak ACL-szűrt, hivatkozott
  dokumentumrészletet kaphat; automatizált adat- vagy kiadásmódosításra nincs
  jogosultsága. Szerveroldali Office-makró futtatás tiltott.
- DSORD-01 alap elkészült: a production-service csak teljes, olvasási
  SharePoint-konfigurációval aktiválható, nem követhet külső Graph delta-linket
  és más drive dokumentumát sem kérheti le. A GraphRAG retrieval ACL-kapuja
  fail-closed. Unit ellenőrzés: 49/49 zöld, build zöld.

- Az Üzemi Tábla éles, jelenleg demó adatokkal fut.
- A Doorstar production-service formális OpenAPI specifikációja elkészült;
  a generált kliens és a platformos biztonsági kontraktus későbbi kapu.
- A production-service `GET /openapi.json` útvonalon a buildbe másolt, saját
  OpenAPI 3.1 forrásdokumentumot szolgálja ki; route-drift kapu és unit teszt
  védi a futó kontraktust.
- A `spaceos.scheduling` platformmodul PLAN-03 megvalósítása platformoldalon
  elindult. Doorstar M3-kapu: read-only OpenAPI publikáció és sandbox.
- A PLAN-03 M1 azonnal indulhat a kalkulációs megfeleltetéssel, fixture-hash
  kapuval és gráfvalidációval. A `partialRelease` prioritása és
  naptár-tudatos perc-képzése döntésig elkülönített, nem végleges policy.
- A 2026 júliusi valós munkafüzetekből készült adatminimalizált kivonat
  overload-jelöltet igazol, de standard-revíziópárt és 100% alatti
  partial-release példát nem talált.
- A `Folyamat` Power Query-kimenethez elkészült a modern, tiszta adapterhatár:
  a művelet csak jóváhagyott, minősítőkkel együtt azonosított standardhoz,
  pozitív mennyiséghez, egységhez és forrásrevízióhoz kötve adható át. A
  hiányos vagy kétértelmű sor karanténba kerül; nem keletkezik Excel-formula-
  vagy saját ütemezőmásolat.
- A Doorstar megerősítette és dokumentálva van a teljes lánc:
  `Gyártásmegrendelő.xlsm → Kalkulátor.xlsm → Folyamatok.xlsm → Kiíró`.
- Elsődleges integrációs szabály: ez a lánc csak a kernel
  Project–FlowEpic–Task modellhez, publikus és hash-pinnelt kézfogáson át
  kapcsolódhat; saját kernel-ownership vagy helyi handshake tilos.
- A platform `spaceos-modules-scheduling` C# domainmagjában megjelent a
  `TaskRef` és `KernelWorkScope` alap: az ütemezés a Project–Epic–Task láncot
  csak átlátszatlan hivatkozásként tartja. A hálózati kernel-kézfogás továbbra
  is a publikált contract kapuja.
- A Doorstar root 2026-07-28-i platformállapot-jelentést készített a
  JoineryTech root/backend felé: kernel scope, kapacitásfoglalás és verziózott
  normaidő/import-karantén látható; M3 OpenAPI/sandbox és a közös policy-k a
  következő kapuk.
- A Doorstar adapter preflight a teljes Excel-adatláncot védi: egy Folyamat
  művelethez már kötelező a megrendelés- és Kalkulátor-revízió, valamint a
  stabil alkatrész-kulcs. A 35/35 unit teszt és a backend build zöld; erről a
  `root/outbox/2026-07-28_003...` jelentés értesíti a platformot.
- A 004-es JoineryTech-válasz szerint az M3 OpenAPI/sandbox az M2 review után
  érkezik; előzetes kézfogás-kód továbbra is tiltott. A Doorstar elkészítette
  az atomikus Power Query batch-preflightet: csak saját preflighton átment
  norma használható, és a függőség-elődnek ugyanabban a kivonatban kell
  szerepelnie. 38/38 unit teszt és build zöld. A partial-release precedence és
  naptár-tudatos időpont továbbra is üzleti döntési kapu; a júliusi példák nem
  bizonyítják, ezért default nem készült. Jelentés: `root/outbox/2026-07-28_004...`.
  A platform M2-ben a `6260015` auditnapló + tranzakciós outbox commit is
  látható; ez platformtulajdon, Doorstar a későbbi publikált eseménykontraktust
  fogyasztja majd.
- A JoineryTech 005-ös üzenete véglegesítette az ADR-069 §4 partial-release
  szabályt. A Doorstar hash-pinnelt input pack új, későbbi-release/FS vektort
  és `partial_release_delays_fs_start` figyelmeztetést kapott; 39/39 teszt és
  build zöld. A százalék naptár-tudatos feloldása továbbra is kizárólag
  platformfeladat. Jelentés: `root/outbox/2026-07-28_005...`.
- A JoineryTech 006-os csomagfegyelmi kérése nyomán a v1 fixture visszaállt az
  eredeti, pinelt SHA-256-ra (`D7D84...C837`), a bővített 7-vektoros csomag
  külön v2 (`2.0.0`, `7BB8...2A55`). A v1 és v2 preflight külön zöld; a batch
  az érvénytelen elődre mutató függőséget is karanténba teszi. 41/41 teszt és
  build zöld. Korrekciós jelentés: `root/outbox/2026-07-28_006...`.
- A fixture-manifest kapu rögzíti és automatikusan ellenőrzi a v1/v2 név,
  sémaverzió és SHA-256 pinjeit, valamint mindkét pack preflightját.
  Ellenőrzés: 42/42 unit teszt, manifest-verify és build zöld. Jelentés:
  `root/outbox/2026-07-28_007...`.
- A Doorstar production-service saját readiness probe-ot kapott: `/healthz`
  liveness maradt, `/readyz` viszont adatbázis-próbával 200/503 ready állapotot
  ad. OpenAPI drift-kapu 42/42 route-ot fed, 44/44 unit teszt és build zöld.
  Élesítés nem történt. Jelentés: `root/outbox/2026-07-28_008...`.
- A `/readyz` HTTP-válaszát sikeres és hibás adatbázis-próbával is lefedi unit
  teszt: hiba esetén 503 és szándékosan nem szivárog ki belső hibaüzenet.
  46/46 teszt és build zöld. Jelentés: `root/outbox/2026-07-28_009...`.
- Új federation-bejövő: a JoineryTech kiadta a `spaceos.scheduling` M3
  read-only OpenAPI 3.1 kontraktust (`/api/scheduling/v1`, SHA-256
  `3fc6c57d4ec6d768c432bb023e5ca98f4a960c70f7331f482e276729adfc0756`).
  Megnyílt a Doorstar generált TypeScript kliensének és shadow fogyasztásának
  előkészítése; Tailnet sandbox URL/token/demo tenant még nem érkezett, ezért
  élő API-hívás nem indul.

## Kommunikáció

- Elsődleges bejövő mailbox: `terminals/root/inbox/`.
- Szolgálati identitás és működési szabályok: `terminals/root/CLAUDE.md`.
- A federation inbox csak szigetközi kézbesítési csatorna; a root döntéseit és
  feladatait a root mailboxban kell nyomon követni.
- Az automatikus mailbox-heartbeat a feladatforgalom hiánya miatt ki van
  kapcsolva; a mailbox ellenőrzése kézi, szükség szerinti.

## Nyitott külső bemenetek

- Scheduling kontraktus-reviewer jelölése.
- Standard verzióváltási példa és overload-példa.
- Naptárdraft jóváhagyása.
- Tailnet sandbox base URL, demo tenant és dedikált Keycloak-kliens/token
  igénylési módja a Scheduling M3 read-only contracthoz.

## 2026-07-29 — Rendelésfelvétel vizuális elhatárolása

- A `docs/Doorstar-design-system-standalone.html` az egész Doorstar rendszer
  vizuális nyelve: IBM Plex Sans/Mono, Source Serif 4, törtfehér papír,
  grafit kontúr és műszaki kék. Ez nem azonos az Üzemi Tábla Whiteboard
  megjelenésével.
- Az `/orders/new` ezért saját, általános Doorstar fejlécet és vezetett,
  szekciós rendelésfelviteli nézetet használ. A marker/handwriting tokenek
  csak a tábla, kanban és terhelés nézetekben maradtak.
- A form mezői, mm-es technikai beviteli egységei, pozíció-hozzáadás és
  piszkozatmentése működnek a korábban készített API-val. Lint és production
  build zöld; helyi backend nélkül a projektlista szándékosan hibát jelez.

## 2026-07-29 — Két külön Doorstar munkatér

- A frontend routingban éles határ készült: `AppShell` csak az Üzemi
  Whiteboard (`/board`, `/kanban`, `/load`), míg `ProductShell` az irodai
  adatkezelés (`/orders/new`, `/projects`, `/projects/:key`) kerete.
- A `ProductShell` perzisztens világos/sötét kapcsolót kapott
  (`doorstar.product-theme` localStorage-kulcs). A dark mód nem módosítja a
  Whiteboard fix marker-palettáját.
- A mobil és desktop böngészős ellenőrzés szerint a kapcsoló, a szeparált
  navigáció és az irodai rendelésfelvételi sötét mód működik. Frontend lint és
  production build zöld.

## 2026-07-29 — Irodai kezdőoldal és méretbevitel

- A `/` most az irodai Doorstar kezdőoldal: áttekintés, gyors navigáció
  (rendelések, projektek, Üzemi Whiteboard) és új rendelés művelet. Az
  Üzemi Whiteboard saját belépési útvonala `/board`.
- A rendelési pozíció mérete egységesen `szélesség × magasság × vastagság`,
  három külön mm mezővel jelenik meg. A meglévő backend mezőkre képezzük le,
  ezért adatmigráció nem szükséges.
- Frontend lint/build zöld; a helyi kezdőoldali áttekintés API-adat nélkül
  elérhetőségi állapotot jelez, nem hamis nullákat.

## 2026-07-29 — Rendelésregiszter

- A `GET /api/production/production-orders` az aktív projektekhez kapcsolt
  rendelés legfrissebb revízióját adja: projekt, ügyfél, revízió, státusz,
  pozíciószám és szállítási dátum. A teljes revíziótörténet továbbra is a
  projektkulcsos részletes végponton marad elérhető.
- Az irodai `/orders` nézet ezt a regisztert mutatja; a főmenü és a kezdőlap
  már erre visz, az új felvitel pedig mentés után ide tér vissza.
- Ellenőrzés: 64/64 backend teszt, backend build, 45 OpenAPI művelet teljes
  route-lefedettséggel, valamint frontend lint/build zöld.

- Az `/orders/:projectKey` részletes nézet az összes revíziót és pozíciót
  változatlan történetként jeleníti meg; a pozíció mérete itt is
  `szélesség × magasság × vastagság` sorrendben olvasható. A frontend lint és
  production build ismét zöld.

## 2026-07-29 — Sales és felmérés üzleti döntései

- Minden új ügyféligény új projekt és új rendelés; korábbi beépítés nem írható
  felül vagy újrahasznosított projektként kezelve.
- A Sales elkülönült munkatér: dokumentumot ad át, de nem véglegesít gyártási
  adatot. A felmérés véglegesíti a típus, szélesség × magasság × vastagság,
  felület, falpanel/blende, üveg és nyitás adatokat.
- A Sales olvasási forrása a `01 - Megrendelés` dokumentummappa. PDF/DWG
  jelölt kezelhető; AutoCAD `.bak`, `.dwl`, `.dwl2` és rendszerfájl kizárt.
  Automatizált írás nincs; később SharePoint-szinkron követi ugyanezt a
  szabályt.
- A beépítőnek minden kiadott pozícióhoz kitöltött lezárási bizonyíték kell;
  eltérés `site_issue` review-t nyit, nem módosítja a rendelést. Részletek:
  `docs/projects/doorstar-order-data-chain/SALES_SURVEY_WORKFLOW.md`.
## 2026-07-29 — Sales → felmérés adatkapu implementáció

- A Sales bevitel atomi tranzakcióban hoz létre új projektet és első
  rendelési revíziót; ismételt vevői rendelés sem kapcsolható régi projekthez.
- A DRAFT revízió explicit felmérési frissítést kapott; a REVIEW és APPROVED
  változat továbbra is módosíthatatlan.
- A pozíció véglegesíthető mezői: felület, falmegoldás (nincs/falpanel/blende),
  üvegezés és üvegspecifikáció. Felmérés csak teljes gyártási adatlap esetén
  zárható le.
- Az irodai UI külön Sales és Felmérés munkateret, illetve dokumentumátvétel →
  felmérés → műszaki előkészítés kaput kapott; ez még nem ad ki feladatot az
  Üzemi Táblára.
- Ellenőrzés: frontend production build, backend Prisma client generation,
  TypeScript build és 48 műveletes OpenAPI route-lefedettség zöld; a tiszta
  sémateszt 4/4 zöld. A teljes DB-integrációs teszt a helyi `localhost:5462`
  PostgreSQL hiánya miatt most nem futtatható.
## 2026-07-29 — Dokumentumkapu és Dockeres ellenőrzés

- Az `OrderDocument` metaadatrekord a Sales-forrás relatív útvonalát, típust és
  későbbi SharePoint-azonosítókat kezeli; bináris vagy helyi abszolút útvonal
  nem kerül adatbázisba.
- A Sales → dokumentumok átvéve átmenet legalább egy rögzített dokumentum-
  hivatkozást követel. A rendelési adatlapon ehhez külön dokumentumkapu UI van.
- Docker Desktop és a `doorstar-production-db` elindult; a teljes, adatbázist
  használó backend tesztcsomag 68/68 zöld. A dokumentumkapu integrációs teszt
  külön is sikeres.
## 2026-07-29 — Szerepkör-kapuk v1

- Az ideiglenes `X-Role` védőháló már stabil Doorstar szerepkódokat is fogad,
  miközben a régi `vezeto` / `allomas` kompatibilis marad.
- Sales rendelést és dokumentumhivatkozást a `sales`, műszaki előkészítő és
  jóváhagyó hozhat létre; felmérést és műszaki előkészítésre adást a műszaki
  előkészítő/jóváhagyó (vagy admin) végezhet. `reader` írása tiltott.
- Az irodai fejlécben ideiglenes szerepválasztó van az átvételi ellenőrzéshez;
  ezt később valódi bejelentkezés/Entra csoportoldás váltja ki.
- Dockeres teljes regresszió: 14 tesztfájl, 69 teszt zöld. Frontend és backend
  production build zöld, OpenAPI 49 végpont teljes lefedettséggel.
## 2026-07-29 — Review és jóváhagyási kapu

- A teljes műszakilag előkészített DRAFT review-ra küldhető; a kapu teljes
  felmérést és legalább egy dokumentumhivatkozást követel.
- A `order_approver` (vagy admin/vezető kompatibilitási mód) jóváhagyása
  SHA-256 tartalmi ujjlenyomatot és auditbejegyzést rögzít. Az APPROVED
  revízióból már nem lehet adatot módosítani.
- Az irodai adatlap megmutatja a review/jóváhagyás műveletet és az audit
  események rövid hash-ét. A kalkulátor/gyártási kiadás erre a későbbiekben
  csak APPROVED revíziót fogadhat el.
- Ellenőrzés: új review/approval adatbázis-integrációs teszt, 51 OpenAPI
  művelet teljes lefedettséggel, frontend/backend build, teljes Dockeres
  regresszió 15 tesztfájl / 70 teszt zöld.
## 2026-07-29 — Legacy-felderítés átvétele és import-provenance

- Az adatfeltérképezés eredménye: 58 projekt-, 1 173 dokumentum-, 730 pozíció-
  jelölt, 270 Excel-forrás és 278 határidősor. A részletes, csak olvasásos
  bizonyíték az `IMPORT_DISCOVERY.md` és `IMPORT_MAPPING.md` fájlokban van.
- A rendszer `ImportRun` provenance burkot kapott: profilverzió, forrás-hash,
  preview-artifact, jelöltszám, felelős szerep és cél-séma. A regisztráció
  kizárólag `doorstar_test` cél-sémát fogad el; `public`/production cél nem
  regisztrálható.
- DSORD-02 és DSORD-04 teljesítettként vezetve. A tényleges író import továbbra
  is egyetlen emberileg kiválasztott, felmérésileg teljes Sales-csomagot igényel.
- Ellenőrzés: 53 OpenAPI művelet teljes lefedettséggel; Dockeres regresszió
  17 tesztfájl / 72 teszt zöld.

## 2026-07-29 — Kereshető importbizonyíték

- Az `ImportCandidate` és `OrderDeadlineObservation` Prisma-model,
  migráció, validáció és REST API elkészült. Mindkettő forráshelyet,
  normalizált adatot és felülvizsgálati állapotot őriz az `ImportRun` alatt.
- Az importbizonyíték írása runtime ellenőrzéssel kizárólag
  `doorstar_test` sémában engedélyezett. A határidő-megfigyelés nem írja
  felül a rendelés `expectedDelivery` mezőjét.
- Új végpontok: importjelölt létrehozása, határidő-megfigyelés létrehozása
  és egy ImportRun teljes bizonyítékcsomagjának lekérése. Az OpenAPI
  szerződés mindhárom műveletet tartalmazza.
- Az irodai Import Inbox megmutatja a preview-rekordok, a kereshető jelöltek
  és a határidő-megfigyelések darabszámát.
- Ellenőrzés: 19 backend tesztfájl / 76 teszt zöld; backend és frontend
  production build zöld. A helyi backend újra fut a 4610-es porton.
- Következő adatcsomag: `DSMR-26148`; először bizonyíték és review,
  `apply-draft` csak külön döntéssel a teszt sémában.

## 2026-07-29 — Mezőszintű pozíció-bizonyíték

- Az `OrderPositionEvidence` modell és migráció elkészült: típusos pozíciómező,
  relatív dokumentumhely, nyers és normalizált érték, bizonyosság,
  review-állapot és indoklás tárolható.
- A bizonyíték nem alkalmazza automatikusan a jelölt értéket. DRAFT alatt
  rögzíthető; DRAFT/REVIEW alatt elfogadható vagy elutasítható; APPROVED után
  változtathatatlan.
- A Survey mentés stabilan megőrzi a meglévő `OrderPosition.id` értékeket,
  ezért az importból vagy dokumentumból származó mezőbizonyíték nem vész el.
- A rendelési adatlapon megjelent a forrás, nyers → normalizált érték és az
  emberi felülvizsgálat. A sötét mód kontraszthibája a böngészős QA során
  javítva lett; 390 px-en nincs komponens-túlcsordulás.
- Ellenőrzés: teljes backend regresszió 21 tesztfájl / 79 teszt, frontend
  2 tesztfájl / 5 teszt, frontend lint és mindkét production build zöld.
  OpenAPI: 62 művelet, teljes route-lefedettség. DSORD-07 állapota
  `in_progress`.

## 2026-07-29 — Önálló falpanel- és bútorfront-adatlánc

- A `ManufacturedItem` és `ManufacturedItemEvidence` modell/API elkészült
  `WALL_PANEL` és `FURNITURE_FRONT` tételekhez. Az ajtópozícióval csak
  opcionális kapcsolatuk van; ajtó-specifikus mezőt nem örökölnek.
- Minden tétel legalább egy forrásbizonyítékkal jön létre, majd kötelező
  emberi döntéssel `VERIFIED` vagy `REJECTED`. Az ellenőrizetlen tétel
  blokkolja a rendelés review-ját; a lezárt snapshot része az approval
  SHA-256 hashnek.
- Az irodai rendelési oldalon külön panel jeleníti meg a méretet, anyagot,
  felületet, munkajelleget, forrást és review-döntést. Világos/sötét asztali
  és 390 px-es mobil nézetben nincs túlcsordulás.
- A preview extractor elavult API-hiány jelzése megszűnt; makró- és
  adatbázisfuttatás továbbra sincs.
- Ellenőrzés: backend 23 tesztfájl / 81 teszt, frontend 2/5 teszt, lint,
  mindkét build és 64 műveletes OpenAPI drift-kapu zöld. DSORD-07 továbbra
  `in_progress`.

## 2026-07-29 — Determinisztikus payload és ImportRun bizonyítékoldal

- Az `extractManufacturedItemPreview.py` minden teljes rekordhoz az aktuális
  ManufacturedItem POST-szerződésnek megfelelő `apiPayload` értéket készít.
  A munkajelleg kötelező CLI-paraméter; a script nem következteti ki.
- Hiányzó típus, kód, név, mennyiség vagy relatív forráshely blokkolja a
  rekordot. Az API-kész payload mellett minden mező forrásbizonyítéka megmarad.
- Az Import Inbox minden futása megnyitható a
  `/imports/:importRunId` read-only oldalon. Látható a fingerprint, mapping,
  READY/REVIEW/BLOCKED összesítés, normalizált payload, forráshely, hiba,
  határidő-megfigyelés és az esetleges létrejött gyártási tétel.
- A részletes oldal nem kínál írást, production célt vagy tömeges elfogadást.
  Következő biztonságos szelet: idempotens, kizárólag `doorstar_test` DRAFT-ra
  dolgozó uploader, emberi kapuval.
- Ellenőrzés: teljes backend regresszió 23/23 tesztfájl és 81/81 teszt;
  frontend 2/2 tesztfájl és 5/5 teszt, lint/build; backend build; 64 műveletes
  OpenAPI drift-kapu. Asztali, 390 px mobil, világos és sötét vizuális QA
  túlcsordulás nélkül.

## 2026-07-29 — Emberi kapus, idempotens gyártási tétel-import

- Új végpont:
  `POST /api/production/import-runs/:importRunId/apply-manufactured-items`.
  Csak `doorstar_test` kapcsolaton, ugyanahhoz az ImportRunhoz tartozó DRAFT
  revízióra, változatlan fingerprinttel és konkrét candidate ID-listával fut.
- Csak hibamentes, READY `ManufacturedItemImportPreview` fogadható. A szerver
  az eltárolt payloadot validálja, nem a kliens által újraküldött tételadatot.
- Az alkalmazás tranzakciós. Az `importCandidateId` egyedi kapcsolat és a
  READY → APPLIED compare-and-set miatt az ismételt kérés nem duplikál; a már
  létrejött tételt `existing` eredményként adja vissza.
- A felületen nincs automatikus kijelölés. A felhasználó egyenként jelöli a
  tételeket, kiválasztja a kapcsolt DRAFT-ot és begépeli: `BETÖLTÖM`. Sales és
  olvasó csak a bizonyítékot látja; műszaki előkészítő, jóváhagyó,
  rendszergazda vagy vezető alkalmazhat.
- A létrejött tétel mindig `REVIEW`; az uploader nem hagy jóvá, nem módosít
  határidőt és nem hoz létre gyártási feladatot.
- ADR:
  `docs/decisions/ADR-2026-07-29-controlled-manufactured-item-import-apply.md`.
- Ellenőrzés: backend 23/23 tesztfájl, 82/82 teszt; frontend 3/3 tesztfájl,
  6/6 teszt, lint/build; backend build; OpenAPI 65 művelet. Asztali és 390 px
  mobil, világos/sötét, vezető/Sales szerepkörös kattintásos QA zöld.
- Következő biztonságos szelet: verziózott, újraindítható bulk preview-
  regisztráló, amely a preview artefaktumból ImportRunt és jelölteket készít
  manuális soronkénti API-hívás nélkül.

## 2026-07-29 — UTF-8 és tesztadat-szennyezés diagnózis

- A `DSMR-26148` helytelen karakterei már az adatbázisban literal `?`
  karakterek (`U+003F`), nem a frontendben keletkeznek. Az eredeti
  `IMPORT_PREVIEW_DSMR_26148.json` helyes UTF-8 szöveget tartalmaz, ezért a
  teszt-DRAFT célzott újratöltéssel helyreállítható.
- A hiba a 2026-07-29 15:20-as egyszeri feltöltési útvonalon keletkezett,
  nagy valószínűséggel a PowerShell/HTTP request body legacy
  karakterkódolásakor. UTF-8 request bytes és ékezetes round-trip teszt nélkül
  bulk regisztráló nem tekinthető késznek.
- A négy `Minta Kft.` kártya négy külön integrációs fixture:
  `DSMR-FEEDBACK-TEST`, `DSMR-POSITION-EVIDENCE-TEST`,
  `DSMR-MANUFACTURED-ITEM-TEST`, `DSMR-TEST-IMPORT-24181`.
- Az automatikus tesztek ugyanazt a tartós `doorstar_test` sémát használják,
  amelyet a lokális UI olvas; a tesztek indulás előtt törölnek, befejezés után
  viszont meghagyják az utolsó fixture-t. Ezért a tesztfutás szennyezi a
  kézzel böngészett adatokat.
- Javítási sorrend: teszt-fixture afterAll takarítás; külön futásonkénti
  Vitest-séma; UTF-8 import round-trip kapu; végül a `26148` célzott,
  bizonyítékvezérelt helyreállítása.

## 2026-07-31 — Codex/Nexus agent identity cutover: kész

- A hat terminálszerep Codex custom agentje és közvetlen `AGENTS.md` fájlja
  elkészült; a monitor read-only, a specialisták scope-ja explicit.
- Hat külön Nexus identity él, mind a `doorstar` szigeten, knowledge-only
  szerveroldali RBAC-kal. A régi közös identity vissza lett vonva.
- QA: Doorstar MCP 19/19 teszt + build; agent-contract validator zöld; Nexus
  policy 8/8 + first-load 5/5 + legacy auth 36/36, admin-szkriptek 7/7,
  typecheck/build zöld.
- Live: 6/6 identity `tools/list=search_knowledge`, 18/18 tiltott próba 403,
  6/6 forrásos Doorstar-keresés, no-token 401, invalid/retired 403.
- Nexus service restart nélkül, PID `1733284` mellett hot-reloadolt.
- Új Codex CLI task a `doorstar_monitor` custom agentet sikeresen felfedezte,
  és a helyes name/principal/configured-sandbox hármast adta vissza. A Windows
  read-only sandbox helper külön gépi `os error 5` hibán áll; bypassos,
  kizárólag olvasó discovery smoke PASS, a TOML `read-only` értékét a
  determinisztikus validator ellenőrzi.
- A kliensverzió child-MCP override driftjét egyedi, alapszinten regisztrált
  role-serverek zárták le. `doorstar_frontend` E2E: saját role-tool, Doorstar
  island, forrás jelen, Nexus caller-log delta pontosan +1.
- A független záróaudit által talált restartkori P1 lezárult: a Nexus forrás
  első policy-betöltése `none` alapértékű és malformed permissiont is tilt;
  az élő systemd `ExecStartPre` validátora hibás/hiányzó/túl tág policyvel nem
  engedi elindulni a szolgáltatást. A guard felrakása restart nélkül történt,
  a Nexus PID továbbra is `1733284`.
- Független utóreview: PASS, P0/P1 nincs. A tracked és élő preflight-validátor
  byte-azonos; service aktív, `NRestarts=0`. P2 követés marad a Nexusnak: a
  szigorú customer contractot a jövőben a hot-reload csere előtt is futtatni.

## 2026-07-31 — Faipari terminológiai baseline

- Elkészült a Doorstar működésének repo-, séma-, UI-, import- és read-only
  faipari MCP-alapú szakzsargon-auditja. Kanonikus emberi szótár:
  `docs/knowledge/domain/DOORSTAR_FAIPARI_TERMINOLOGIAI_SZOTAR_2026-07-31.md`;
  gépi párja: `doorstar-faipari-terminology.v1.json`.
- P0 automatikus félremappelést az audit nem igazolt; a jelenlegi evidence- és
  review-kapuk fail-closed működnek. A valós adatra váltás előtt P1 marad a
  dátumszemantika, felmérési teljesség, kétoldali ajtószerkezet backendmodell,
  falpanel/blende kapcsolat, Sales átadás kontra gyártási kiadás, valamint a
  stage–állomás–művelet határ egységesítése.
- A régi domainleírás terminológiai hibái javítva: fúrás = megmunkálás;
  csiszolás = jellemzően felület-előkészítés; kiszállításra kész = állapot,
  nem tényleges logisztikai/beépítési esemény.
- Forrásdokumentum, adatbázis, éles/public séma és deploy nem érintett.

## 2026-07-31 — Irodai kezdőoldali következőteendő-munkasor

- A HomePage a meglévő projekt- és rendelésprojekcióból legfeljebb négy,
  prioritásos és kattintható következő teendőt mutat. Nem tárol új workflow-
  állapotot, és minden link a meglévő adatgazda-munkatérre vezet.
- Projekt- vagy rendelésquery loading, refetch vagy error állapotában a sor
  fail-closed: nincs hamis rendelésnélküli tény vagy célakció.
- QA: 30 tesztfájl / 114 teszt, lint és production build zöld; 1440/390 px
  light/dark böngészős ellenőrzés overflow és konzolhiba nélkül. A light muted
  kontraszt legalább 4,86:1. Független monitor re-review PASS, P0-P3 nincs.
- Új backend- vagy import-contract nem keletkezett; deploy és adatbázisírás
  nem történt.

## 2026-07-31 — Ajtó–blende–falpanel termékirány és handoff

- A faipari irodai UI elsődleges terméke az utólag beépíthető beltéri ajtó;
  a falpanel külön projektpozíció/falzóna, a blende pedig az ajtó opcionális
  felső takarás-hosszabbítása fix magasságig vagy plafonig.
- A frontend saját Nexus-keresése forrás- és score-megőrzéssel készült.
  Blendére nem volt releváns találat; a definíció ezért elsődleges
  `DOORSTAR_LOCAL`, a RAG mindenhol advisory-only.
- Backend inbox `015`: exact product-spec/readiness, profilfüggő casing,
  `UNRESOLVED` blende, lifecycle, concurrency és OIDC-ig read-only kapu.
  Import-discovery inbox `010`: explicit entitásmapping, teljes provenance és
  unit-conversion lineage, preview-only, emberi review és fail-closed replay.
- Független monitor végső re-review: PASS, P0–P3 nincs. Alkalmazáskód,
  adatbázis, Nexus-adat és deploy nem változott.

## 2026-07-31 — DSMR-26148 fail-closed felméréslezárás

- DSORD-16 lezárva. A Salesből származó pozícióértékek a rendelési oldalon
  `Rögzített forrásadatok`; igazolt felmérésnek nem nevezhetők.
- A szerver `SURVEY_COMPLETED` kapuja kész falvastagságot, három kötelező
  katalógusdrivert, legalább egy `SURVEY` dokumentumot és pozíciónként exact
  dokumentumverzió-linket követel. Nulla evidence megengedett a kézi flow-ban;
  meglévő evidence kizárólag teljes auditált `RESOLVED` döntéssel fogadható el.
- DSMR-26148 változatlanul `DRAFT / SURVEY_PENDING`, 2 hiányos pozícióval,
  1 Sales PDF-fel, 0 felmérési dokumentummal/linkkel/evidence-szel. Az UI a
  véglegesítést blokkolja; adat- vagy forrásmódosítás nem történt.
- QA: frontend 33/130 + lint/build; backend 41/131 + build + OpenAPI 3.1,
  83/83 route coverage. Helyi böngésző desktop, 390×844 mobil és sötét mobil
  PASS; dokumentumszintű overflow nincs. Deploy nem történt.
- Design és bizonyíték:
  `docs/decisions/ADR-2026-07-31-survey-source-verification-gate.md`,
  `docs/projects/doorstar-order-data-chain/DSORD-16-SURVEY-SOURCE-VERIFICATION.md`.

## 2026-07-31 — Kontrollált Nexus RAG apply-előkészítés

- A felhasználó a változatlan
  `34110af5a9ea4c129467034fa3d181cbba6c5601b908abd87be89d078fbae116`
  csomagot betöltésre jóváhagyta. A hat kanonikus fájl és a csomag hash-lánca
  változatlan; egy inventory-only, manifest-forrásként nem használt OpenAPI-pin
  a jóváhagyás után driftelt.
- Élő, csak olvasható baseline: `doorstar-knowledge`, 1998 rekord. Négy korábbi
  Doorstar-forrás 23 rekordja elavult/superseded; egyikük titokszerű stale
  szöveget tartalmaz. Titokérték nem került naplóba vagy repositoryba.
- Elkészült a read-only, hash-pinnelt ingest planner és az apply ADR. A planner
  11/11, a package-validator 12/12 teszten zöld; minden write-proof hamis.
- Chroma/Nexus írás nem történt. Az apply külön exact-ID backup + 41 upsert +
  verifikáció + 23 legacy delete + rollback szerződésre, valamint e célzott
  romboló lépés explicit emberi jóváhagyására vár.

## 2026-07-31 — Szerver-authoritatív exact-revíziós projektlánc

- Elkészült a read-only exact-revíziós readiness és projekt-workflow authority:
  `GET /api/production/production-orders/:projectKey/revisions/:revision/readiness`
  és `GET /api/production/projects/:projectKey/workflow`. A rendelés, alkatrész-
  snapshot és műveletterv valós authority; a tervezés, immutable munkacsomag,
  6-stage runtime és handover továbbra is explicit `CONTRACT_REQUIRED` vagy
  `NOT_AVAILABLE`, művelet nélkül.
- A backend minden hozzájáruló olvasást egy PostgreSQL `REPEATABLE READ`
  snapshotban értékel, stale revízión és superseded dokumentumlinken lezár,
  a `PRODUCTION_RELEASE` pedig PlanningProposal és IssuedWorkPackage nélkül
  mindig `NOT_AVAILABLE`. Két valós konkurenciateszt fedi az új revízió és az
  alkatrészsnapshot közbeni olvasást.
- A projektcockpit a hét üzleti kaput és a kilenc exact adatkaput mutatja,
  felelős szerepkörrel, hiánnyal és csak létező adatgazda-linkkel. API-mutation
  href sosem válik UI-akcióvá. A két külön HTTP-projekció ORDER/COMPONENTS/
  OPERATIONS kapui exact tükörvalidációt kapnak; eltérő snapshot, lineage,
  blocker/action flatten vagy refetch esetén a teljes panel fail-closed.
- QA: backend 42 tesztfájl / 138 teszt, build és OpenAPI 85/85; frontend
  36 tesztfájl / 154 teszt, lint és build. A 1440×1000 és 390×844 light/dark
  böngészős mátrix, billentyűfókusz, konzol és dokumentum-overflow zöld. A
  végső független monitor review PASS, P0–P3 finding nincs.
- A végső browser smoke-hoz kizárólag a localhost:5462 helyi PostgreSQL
  fejlesztői és `doorstar_test` sémája kapta meg a repository migrációit/séma-
  szinkronját; távoli vagy éles adatbázis nem változott. A
  `QA-READINESS-20260731` tesztprojekt a próba után soft-archiválva lett, az
  ideiglenes 4610-es backendfolyamatokat leállítottuk. Deploy nem történt.
- Freeze-incidens: a pinelt production OpenAPI két leíró mezőjét egy backend
  agent közvetlen patch-e 21:54:57-kor átírta. Az agentet leállítottuk, az okot
  azonosítottuk, visszavonás nem történt. A felhasználó describe-only overlayben
  re-pinel; a fájl azóta változatlan, 162108 byte és SHA-256
  `555d90a095ee757e75d78f294e68584bfc878ac82218397ad437f9ea626c204d`.
- Következő önálló P0 szelet: read-only exact-revíziós Product Position
  Register. A `DOOR` és `WALL_PANEL` külön pozíció; a blende ajtóhoz kötött
  `FIXED_HEIGHT | TO_CEILING` design intent, nem automatikus gyártási méret.
  Minden product-spec mutation validált OIDC/RBAC-ig zárva marad.

## 2026-08-01 — Adatgazdag fejlesztési tesztprojekt és folyamat-UX

- A helyi fejlesztési adatbázisban reprodukálható referencia készült
  `UX-REFERENCE-RETROFIT-001` kulccsal. R01 `SUPERSEDED`, R02 `APPROVED`; az
  aktuális revízió 3 pozíciót, 3 exact dokumentumot, 1 ellenőrzött falpanelt,
  1 ellenőrzött kiegészítőt, 7 `VERIFIED` alkatrészsort és 4 `VERIFIED`
  műveletet tartalmaz. Nem valós ügyféladat és nincs éles adatbázis.
- A seed csak PostgreSQL, loopback host, exact `doorstar_production` DB és
  engedélyezett explicit séma mellett indul. `public` esetén két külön CLI-
  megerősítés kell; más DB-n Prisma-kapcsolat előtt fail-closed. Csak a stabil
  projektkulcsot építi újra, meglévő HTTP/API authorityn keresztül.
- A rendelési adatlap egyszerre egy revíziót mutat. A történeti deep link
  read-only; hibás revízió queryje explicit helyreállításig lezár minden író
  utat. Az irodai navigátor a munkatereket köti össze, de nem readiness-
  authority. A projekt breadcrumb stabil kulcsot mutat.
- A műveletterv-oldal már az exact backend snapshotot fogyasztja: a 4 explicit
  sor `10 → 20 → 30 → 40` sorrendben látszik. Nincs kliensoldali generálás,
  create/review/release akció; `PRODUCTION_RELEASE` továbbra `NOT_AVAILABLE`.
- A mobil office header flex-zsugorodási átfedése megszűnt; 44 px-es működő
  témakapcsoló és vizuális scrollbar nélküli, továbbra görgethető nav készült.
- QA: backend 44/44 tesztfájl, 144/144 teszt, build, OpenAPI 85/85; frontend
  38/38 tesztfájl, 168/168 teszt, lint és build. A 1440×1000 és 390×844
  light/dark browser-mátrix, történeti/hibás revízió, header-overlap,
  dokumentum-overflow és konzolhiba ellenőrzése zöld. Deploy nem történt.
- Új backend- vagy import-contract nem keletkezett. A következő P0 továbbra is
  a Product Position Register; a teljes projektlánc planning/work package/
  6-stage runtime/handover szakasza meglévő authority nélkül zárva marad.

## 2026-08-01 — Kompakt Sales-átadás és RAG v1.0 live állapot

- A rendelési adatlap alapnézete a DSMR 24181 Sales-gyártásmegrendelés
  vizuális hierarchiáját követő, tömör átadólap lett. A projekt, ügyfél,
  vállalt idő, revízió/állapot, konkrét következő teendő, kritikus hiány és a
  három nyitható pozíciósor marad elöl; a műszaki, dokumentum-, evidence- és
  auditanyag alapból zárt részletben él.
- A nézet explicit Sales-forrás, nem gyártási kiadás vagy jóváhagyási
  bizonylat. Refetch, történeti és invalid revízió alatt fail-closed; a valódi
  REVIEW jóváhagyási CTA csak a meglévő kaput nyitja, új API/mutation nincs.
- QA: célzott 2 fájl / 10 teszt, teljes frontend 38/38 fájl és 170/170 teszt,
  lint/build; 1440/1280/735/390 light/dark böngészős bizonyíték, nulla
  dokumentum-overflow és warning/error konzol. Független review PASS, P0–P3
  megállapítás nincs. Backend/import contract és deploy nem keletkezett.
- A koordinációs handoff szerint a Doorstar RAG v1.0 live apply elkészült:
  exact 41 új / 23 legacy csere, végső count 2016, idempotens
  `SKIP_IDENTICAL`, Knowledge Service health és mind a hat principal smoke
  PASS. Alkalmazás-DB, production/public séma és frontend/backend deploy nem
  változott; a korábbi freeze megszűnt, az OpenAPI-pin változatlan.
- A post-live 35 kérdéses retrieval eval minőségi rést mutatott: 13/35
  dokumentumtalálat és 1/35 teljes claim. A v1.0 immutable marad; a claim-szintű
  chunkolású v1.1 új dry-run és külön emberi jóváhagyás tárgya. Audit:
  `docs/projects/doorstar-nexus-rag-execution/LIVE_APPLY_2026-08-01.json` és
  `LIVE_EVAL_2026-08-01.json`. A mostani UI nem támaszkodott új RAG-claimre.

## 2026-08-01 — RAG v1.1 offline csomag lezárva, live csere HOLD

- Elkészült a külön `doorstar-controlled-knowledge-rag@1.1.0` csomag:
  6 dokumentum, 98 claim, 98 claim chunk + 6 overview chunk, 35 eval-kérdés.
  Package hash:
  `237dcdf5be94131ae9d5be0dc9062d757896b7b11693c37198323db43db68e16`.
- Az exact live-v1.0 baseline 6 dokumentum / 41 chunk; a content-free planner
  exact `41 → 104` cserét jelez. Payload, delete action, broad delete,
  hálózati és írási művelet nincs; státusz `HUMAN_APPROVAL_REQUIRED`.
- Lineage: claim→chunk 98/98, claim→citation 98/98, kérdés→elvárt forrás 35/35.
  Offline claim recall @5/@10/@20: 25/61, 30/61, 34/61; szigorú teljes
  claim-match: 14/35, 17/35, 18/35.
- Döntés: `HOLD_FOR_RETRIEVAL_TUNING`. A v1.0 marad élő; v1.1 Nexus-/Chroma-
  írás csak új, explicit jóváhagyással történhet a retrieval-stratégia
  javítása és külön review után.
- QA: RAG Python 68/68, Nexus evaluator 9/9 + typecheck/Biome, backend build,
  OpenAPI 3.1 / 85 / complete és teljes backend 44 fájl / 144 teszt zöld.
  Független re-audit PASS, P0–P2 eltérés nincs.
- Sem alkalmazásadatbázis, sem production/public séma, sem deploy nem
  változott. A backend suite kizárólag izolált `doorstar_test_vitest_*`
  sémában futott.
- Read-only live check: health `ok`, 2016 rekord, port 3460, PID `492075`.
  A Doorstar Knowledge Service-hez nincs systemd unit (`LoadState=not-found`),
  a process user-session scope-ban fut. Ez külön availability-follow-up;
  restart vagy deploy nem történt.

## 2026-08-01 — Lezáró root checkpoint

- `memory.md`, `state.md` és `todo.md` szinkronizálva a RAG v1.1 review
  eredményével.
- Aktuális stabil állapot: v1.0 live/healthy/2016; v1.1 offline/104 chunk/
  `HOLD_FOR_RETRIEVAL_TUNING`; új live írás nincs.
- Következő végrehajtható P0: offline kétlépcsős retrieval-kísérlet. Külön P1
  üzemeltetési döntés: systemd-felügyelet a jelenlegi 3460-as processhez.
- Utolsó teljes kapu: RAG Python 68/68, Nexus evaluator 9/9, backend build,
  OpenAPI 85/85 és backend 44 fájl / 144 teszt PASS.

## 2026-08-01 — Telefon/tablet/PC rendelési UX lezárva

- A `doorstar_frontend` külön office interakciót készített telefonra
  (`<=620 px`), tabletre (`621–1023 px`) és PC-re (`>=1024 px`). Telefonon
  alsó menü, ritka célokhoz `Továbbiak`, egyetlen megnyitott pozíciórészlet és
  egy kézzel elérhető Vissza gomb működik; tableten olvasható kétpaneles nézet,
  PC-n a kompakt Sales-átadólap maradt.
- Az authority closure fail-closed: pozíciós szerkesztés kizárólag jogosult,
  latest/valid `DRAFT` revízión látható. Független `doorstar_monitor` review:
  PASS, P0–P3 finding nincs.
- QA: 3 célfájl / 37 teszt, teljes frontend 38/38 fájl és 193/193 teszt,
  TypeScript lint, production build (165 modul), 390×844 / 820×1180 /
  1440×1000 light/dark browser-ellenőrzés, fókusz/Escape és nulla vízszintes
  túlcsordulás.
- A 2026-08-01 07:30-as frontend fixture-handoff átvéve. A referencia kizárólag
  a helyi fejlesztési adatbázis `UX-REFERENCE-RETROFIT-001` projektje; a
  snapshotok explicit demóadatok. Új backend/import-contract, RAG-írás,
  alkalmazás-DB módosítás vagy deploy nem történt. A production OpenAPI pin
  változatlan.

## 2026-08-01 — Mobil részletszélesség follow-up

- A felhasználói visszajelzés alapján a telefonos pozíciódetail üres második
  grid-oszlopa megszűnt. 390 px-en a részlet 320 px-ről a teljes 353,6 px
  használható munkatérre nőtt; 320 és 620 px-en is 100%-os, overflow nélkül.
- A tablet/PC kétpaneles elrendezés, one-hand Back/nav stacking, authority és
  ajtószerkezeti invariáns változatlan. Teljes frontend 193/193, lint/build és
  független monitor review PASS. Backend/import/DB/deploy változás nincs.

## 2026-08-01 — Konzol 404 lezárva

- A hiányzó implicit favicon helyett explicit, statikus Doorstar SVG asset
  került az office appba. Friss böngészőlap: `/favicon.svg` 200,
  `image/svg+xml`, warning/error nélkül.
- A megmaradó React DevTools sor kizárólag dev-mode információ, nem hiba és
  production buildben nincs jelen. Lint/build és független review PASS;
  backend-, adatbázis- vagy deploy-változás nem történt.

## 2026-08-01 — 26133 Sales intake és teljes dokumentumlánc előkészítése

- A `doorstar_import_discovery` read-only auditja mind a kilenc PDF-oldalt
  ellenőrizte: Sales `01–06` ↔ Gyártólap `01–06` ↔ Szabászati `T=01–06` exact
  lineage; lábazat és két accessory külön; Mennyiségek/Munkamenet aggregált.
- A `doorstar_frontend` elkészítette a `/orders/new` DEV Sales-rögzítőt három
  eszközmóddal, egyetlen pozícióeditorral, contact/address/notes adatokkal,
  nyers Sales mezőkkel és exact cm→mm normalizálással. A duplikált pozíciókód,
  MONTH és structured appearance fail-closed.
- Production/public buildben a Sales PII POST
  `AUTHENTICATED_SALES_PRINCIPAL_REQUIRED` állapotban DOM- és handler-szinten
  zárt. A backend audit igazolta a jelenlegi header-only auth, idempotencia,
  source-lineage, delivery union, structured surface, code uniqueness és
  concurrency hiányát.
- Új handoffok: DSORD-17 production document package; DSORD-18 authenticated
  Sales intake v2; import MSG-DOORSTAR-IMPORT-011 parser/output lineage.
  Review, artifact-content access, stable errors és exact state transitionök
  részletezve; SIDE/casing cross-inference mindenhol tiltott.
- QA: frontend célzott 30/30; teljes 40/40 fájl, 223/223 teszt; lint/build 166
  modul; 390/820/1440 light/dark browser, overflow és konzolhiba nélkül.
  Független source-aware closure review: P0–P3 = 0.
- Alkalmazás-DB, production/public séma, OpenAPI implementáció, deploy és RAG
  nem változott. Következő terméklánc-feladat a DSORD-18 feloldása, majd a
  DSORD-17 read-only műszaki dokumentumcsomag UI adoptionja.

## 2026-08-25 — Doorstar identity-authority M0 checkpoint

- Elkészült a tiszta baseline-on a default-off, source-only M2M resolver
  kliens és a hozzá tartozó konfiguráció-, assertion- és kliensunit teszt.
  Nincs application wiring: route, BFF, Prisma, OpenAPI és runtime `.env`
  változatlan.
- Bizonyíték: fókuszált Vitest 48/48 PASS; `npm run build` PASS; OpenAPI
  `3.1.0` / 85 művelet / teljes coverage PASS; `git diff --check` PASS.
  Független security és quality review P0/P1 nélkül.
- A teljes unit suite 122/124; a két változatlan baseline hiba a
  `planningInputPack` fixture SHA és a `pythonImportTools` RAG dry-run
  validator driftje. Ezek nem M0 regressziók és külön owner-döntést kérnek.
- Próbaüzem állapota: még nem indítható. Következő kapuk: külön reviewzott M1
  control-plane/evidence/session alap, M2 BFF, Kernel snapshot reconciliation
  + release attestation, majd explicit jóváhagyott, eldobható local E2E stack.
- Keycloak-, VPS-, credential-, adatbázis- és deploy-művelet nem történt.

## 2026-08-25 — Doorstar M1 control-plane terv: végső review lezárva

- A `DSCONV-03-M1-CONTROL-PLANE-DESIGN.md` külön, tiszta branch-en rögzíti a
  három új control-plane modellt (instance tenant binding, resolved evidence,
  opaque session) és a szándékos nem-célokat. Kód, Prisma migration, route,
  OpenAPI és runtime config változatlan.
- A döntés az első trialhoz instance-szintű izolációt használ; nem állítja, hogy
  a jelenlegi 33 üzleti modell tenantolt vagy ADR-062 szerinti RLS-proof zöld.
- A security-, architektúra- és adatmodell-review után nincs P0/P1. A kötelező
  invariánsok: minden védett kérés M0 revalidációja, immutable/disable-only
  binding + tranzakciós revoke, egyszeri DB revoke state machine, session→evidence
  kompozit FK + state-MAC, exact `__Host` cookie, CSRF, Origin és
  duplicate-cookie fail-closed szerződés.
- Kód, adatbázis, Keycloak, VPS és deploy továbbra sem indult. Következhet a
  tiszta, source-only M1 implementation slice; shared/local integrációhoz
  továbbra is külön emberi jóváhagyás kell.

## 2026-08-25 — Doorstar M1A control-plane source slice kész

- A tiszta M1A source slice elkészült: instance-lifetime tenant-binding
  validáció, safe descriptor snapshotok, opaque proof boundary és tokenmentes
  evidence policy. Ez nem BFF, nem login és nem perzisztált session.
- Az `evidence.ts` production runtime exportjai üresek; a korábbi tesztfactory
  P1-et megszüntettük. A külön policy csak `{ kind: "accepted" }` vagy
  `{ kind: "denied" }` döntést képez, authority artefaktumot nem.
- Ellenőrzés: M0+M1 célzott Vitest 84/84 PASS; build PASS; teljes unit suite
  158/160. A két failure a változatlan planning-input-pack SHA és RAG
  dry-run-validator baseline drift, nem M1A regresszió.
- Független security és domain review: P0/P1 nincs. Az M1B Prisma migration,
  session state machine és egy explicit engedélyű eldobható PostgreSQL proof
  nélkül a próbaüzem továbbra sem indítható.
