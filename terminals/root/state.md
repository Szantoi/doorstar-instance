# Doorstar Root állapot

**Frissítve:** 2026-07-29
**Szerep:** Doorstar ügyfél-specifikus root

## Aktív állapot

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
