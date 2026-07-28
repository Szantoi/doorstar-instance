# Doorstar Root állapot

**Frissítve:** 2026-07-28  
**Szerep:** Doorstar ügyfél-specifikus root

## Aktív állapot

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
