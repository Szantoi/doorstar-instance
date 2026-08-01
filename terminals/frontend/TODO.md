# Doorstar frontend TODO

- [x] A 26133 forráscsomag alapján a `/orders/new` Sales-rögzítő munkatér:
      ügyfél/kapcsolat/cím, külön pozíciólista és egy editor, exact cm→mm
      fejlesztői normalizálás, telefonos detail+Vissza, tablet/PC kétpaneles
      mód, normalizált egyedi pozíciókód és olvasható light/dark UI. A MONTH és
      eltérő komponensfelület fail-closed; production buildben a PII POST
      `AUTHENTICATED_SALES_PRINCIPAL_REQUIRED` miatt DOM- és handler-szinten
      zárt. QA: 30/30 célteszt, teljes 40 fájl / 223 teszt, lint, build,
      390/820/1440 browser-mátrix, tiszta konzol, reviewer P0–P3 = 0.
- [ ] **Következő P0 — DSORD-18 adoption:** hitelesített Sales principal,
      idempotens v2 create, `DAY | MONTH | UNRESOLVED` határidő, raw cm +
      conversion lineage, revízión belüli DB-unique pozíciókód és külön
      ajtólap/tok/FIXED/ADJUSTABLE/blende felület backend/OpenAPI után a
      production Sales mentés feloldása. Addig a production UI marad zárt.
- [ ] **Következő önálló UI-láncszelet a contract után:** DSORD-17 verziózott
      gyártási dokumentumcsomag readiness/preview és a 26133 legacy output-
      lineage read-only megjelenítése a műszaki előkészítésben; review és kiadás
      csak exact backend authorityval.
- [x] A hiányzó `/favicon.ico` 404 megszüntetése explicit Doorstar SVG
      faviconnal; friss böngészőlapon 200 `image/svg+xml`, nulla warning/error,
      lint/build és független reviewer PASS. A React DevTools dev-info
      szándékosan változatlan.
- [x] A megnyitott telefonos pozíciórészlet üres grid-oszlopának megszüntetése:
      320–620 px között a detail a teljes használható munkatérszélességet
      kitölti; 621 px-től a tablet kétpaneles mód változatlan. Teljes frontend
      193/193, lint/build és független reviewer PASS.
- [x] Külön telefon-, tablet- és PC-office mód: `<=620` egykezes alsó menü és
      egytételes részlet/Vissza fókuszhelyreállítással; `621–1023` kétpaneles,
      olvasható tablet munkatér; `>=1024` megtartott papírszerű PC-átadás.
      Kritikus/pending/invalid állapot nem rejtőzik, az authority DRAFT-only.
      QA: 3 célfájl / 37 teszt, teljes 38 fájl / 193 teszt, lint, build,
      390/820/1440 light/dark browser-mátrix; független review PASS.
- [x] Kompakt, DSMR Sales-lap ihlette rendelési átadónézet: rövid papírszerű
      fejléc, exact következő teendő, fail-closed hiányjelzés, zárt pozíciósorok
      és progresszív műszaki/dokumentum/evidence/audit részletek. Köztes 735 px
      header-overflow javítva; teljes frontend 38 fájl / 170 teszt zöld.
- [x] Adatgazdag rendelési revízió UX: legfrissebb-default egyetlen részletfa,
      URL-címezhető read-only történet, hibás query fail-closed fallback,
      darabszám-összefoglaló, irodai munkatér-navigátor, mobil 2×3 rács és
      route-stabil projektkulcs a cockpit breadcrumbban. QA-fixture:
      `UX-REFERENCE-RETROFIT-001`.
- [x] A VERIFIED OperationPlan snapshot read-only adoptionja: exact GET-
      authority, audit- és lineage-adatok, 4 explicit szerverművelet sequence
      sorrendben, teljes negatív fail-closed DOM-lefedettség. Create/review/
      production release továbbra is zárt; teljes frontend 38 tesztfájl /
      168 teszt zöld.
- [x] A globális office fejléc mobil UX-auditja: a zsugorodó flex-header
      átfedése megszűnt, a témagomb 44 px-es és kattintható, a nav swipe- és
      billentyűzet-scrollja megmaradt látható scrollbar nélkül.
- [x] A `doorstar_frontend` agent identity/scope smoke futtatása és a kizárólag
      olvasási Nexus-határ ellenőrzése.
- [x] A projektfolyamat közvetlen legacy Task sorainak külön, read-only
      `(epik nélkül)` sávban történő megjelenítése, autoritatív műveletterv- vagy
      kiadási jog nélkül.
- [x] A projektcockpit és a Műveletterv közös exact-revision fingerprint
      kapujának, valamint a cache-refetch alatti fail-closed viselkedésének
      egységesítése.
- [x] Az irodai HomePage valós projekt-/rendelésprojekcióból származó,
      prioritásos és szerepkörtudatos következőteendő-munkasora.
- [x] A HomePage böngészős QA 1440/390 px light/dark nézeten: két élő kártya,
      nincs dokumentumszintű overflow, mobil kártya 343 px, akció 44 px,
      tiszta konzol, helyes route és látható natív linkfókusz.
- [x] DSORD-12: a rendelési adatlap kétoldali felületkezelési összefoglalója
      közérthető A/B kártyákkal, kiosztatlan örökölt forrásjelöltekkel,
      akadálymentes mobil műszaki táblázattal és regressziós tesztekkel.
- [x] A projektcockpit szemantikus, projektnevű főcíme és a törzsadat-műveletek
      cache-refetch, query-hiba és mutation pending alatti fail-closed védelme.
- [x] Az örökölt munkamenet teljes read-only zárolása a hiányzó szerveroldali
      revízió/CAS miatt; minden író út DOM- és handler-szinten fail-closed.
- [x] Mind a 17 leaf route route-szintű lazy betöltése úgy, hogy az irodai és
      üzemi shell az akadálymentes, élő státuszú fallback alatt is látható
      maradjon; a fő JS chunk 691,16 kB-ról 370,06 kB-ra csökkent.
- [ ] Backend: feltételes munkalap-GET/PUT/DELETE `worksheetRevision` vagy ETag,
      kötelező `If-Match`, atomi 409 és valódi PostgreSQL versenytesztek a
      `2026-07-31_016_frontend-work-session-concurrency-contract.md` szerint.
- [x] DSMR-26148 forrásszemantika: a rögzített Sales/import adatok elkülönítése
      a felmért ténytől, source-aware nulla-evidence jelzés, dokumentumtartalom-
      figyelmeztetés és a felmérés teljes mező/dokumentumkapcsolat/evidence-audit
      alapú, fail-closed frontend előkapuja.
- [x] Szerver-authoritatív exact-revision projektlánc a projektcockpitben:
      readiness + workflow runtime-validáció, completed/current/blocked/
      not-available állapot, hiány és felelős, determinisztikus next-action,
      valós UI-route allowlist, refetch/error/stale/hiányos DTO fail-closed.
- [x] Root browser-QA az exact projektláncra 1440/390 px light/dark nézetben,
      billentyűzetes kapuválasztással, tiszta konzollal és overflow-audittal.
- [x] Reviewer-hardening az exact projektláncon: `CONTRACT_REQUIRED`/
      `NOT_AVAILABLE` elsőbbség az aktuális kapuval szemben, gate-szintű exact
      `ORDER_REVISION` lineage, valamint currentGate/allowedActions/nextAction
      strukturális konzisztencia fail-closed validációval és regressziós tesztekkel.
- [ ] Faipari döntésnél Nexus-forrást és bizonytalanságot rögzíteni; authorityt nem képezni.

## Tartós UX-product backlog — faipari irodai projektmunkatér

Az alábbi prioritás a 2026-07-31-i `DOORSTAR_LOCAL` termékirányból és a
`memory.md` forrásjegyzett Nexus-auditjából származik. Egyik tétel sem
engedélyez kliensoldali gyártási vagy jóváhagyási authorityt.

### P0 — a napi projektmunka alapja

- [ ] **Termékpozíció-regiszter:** egy projektben külön, szűrhető sorokként
      kezelni az utólag beépíthető beltéri ajtókat és falpanel-zónákat;
      helyiség/falzóna, pozícióazonosító, felelős, határidő, revízió,
      completeness és blocker látszódjon. A blende az ajtó opcionális
      szerkezeti részlete, ne automatikusan önálló ajtópozíció.
      Forrás: `DOORSTAR_LOCAL`; a falpanel-adatmodell részletei nyitottak.
- [ ] **Ajtó-felmérési adatcsoport:** külön mezőként és közérthető
      ábrás/szöveges címkével kezelni legalább a falnyílást, kész
      falvastagságot, tokprofil/verziót, tok- és ajtólapméreteket, szabad
      átjárást és elhelyezési hézagot. Ne legyen egyetlen összemosott
      „ajtóméret”, és ne legyen profil nélküli képlet/default.
      Evidence: `szega_book_134_oldal_008.jpg` p.8 (`0,5420`) és p.111
      (`0,5427`); Doorstar-kötelezőség és képlet **nincs igazolva**.
- [ ] **Blende-adatcsoport:** jelenlét; `FIXED_HEIGHT` / `TO_CEILING` jellegű
      kiterjesztési mód; fix módnál explicit szükséges méret; plafonig módnál
      mérési/evidence hiányjelzés; önálló felület/szín és megjegyzés.
      A UI ne örökölje csendben az ajtó vagy tok felületét, és ne számoljon
      gyártási méretet. Forrás: `DOORSTAR_LOCAL`; Nexus-megerősítés nincs.
- [ ] **Falpanel-felmérési prototípus ügyfél-validációra:** fal-/mennyezetzóna,
      befoglaló és szegmentált méretek, határ/lezárás, csomópont, nyílás vagy
      kivágás, kiosztási irány/minta, anyag és felület, mindegyikhez rajzi/fotó
      evidence és `UNRESOLVED` lehetőség. Evidence:
      `szega_book_134_oldal_215.jpg` p.215 (`0,5209–0,5783`) és p.219
      (`0,5597–0,5623`); a konkrét mezők **UX-hipotézisek**, Doorstar-példákon
      validálandók, nem gyártási szabályok.
- [ ] **Pozíciószintű dokumentum- és readiness-sáv:** a felmért tényt,
      műszaki döntést, jóváhagyott gyártmányadatot és gyártástervezési átadást
      külön revízióval, felelőssel, forrással és blockerrel mutatni. Ne egy
      globális „kész” badge fedje el a hiányzó rajzot/jegyzéket/evidence-et.
      Evidence: `szega_book_230_oldal_007.jpg` p.7 (`0,5947`), p.20
      (`0,5809–0,6192`) és p.36 (`0,6012`); a termékenként kötelező
      dokumentumkészlet **még nincs igazolva**.
- [x] **Projektlánc-readiness első szerver-authoritatív szelete:** az exact
      rendelési revízió kilenc adatkapuja és a hétlépcsős projekt-workflow
      elkészült az irodai cockpitben. Ez projekt-/revíziószintű összesítés;
      a termékpozíció-regisztert és a pozíciónkénti dokumentumsávot nem
      helyettesíti.
- [x] **P0 frontend-facing szerződésigény átadása:** szükséges
      egy szerver-authoritatív terméktípus/pozíció/zóna modell, blende-
      attribútumok, falpanel survey-spec, mezőszintű evidence/lineage,
      exact-revision completeness és jogosultságok. Importoldalon ugyanezekhez
      explicit mapping + `UNRESOLVED`; fájlnévből vagy szabad szövegből nincs
      automapping. Backend handoff:
      `2026-07-31_015_frontend-door-blende-wall-panel-contract.md`; import
      handoff:
      `2026-07-31_010_import-discovery-blende-wall-panel-mapping-request.md`.
      Forrás: `DOORSTAR_LOCAL` termékirány + a jelenlegi ajtócentrikus
      szerződés; a szükségesség bizonyossága magas, a javasolt mezőhatárok
      Doorstar-validációig közepes bizonyosságúak.

### P1 — többpozíciós munka gyorsítása

Forrás: `UX_PRODUCT_HYPOTHESIS`, a `DOORSTAR_LOCAL` kényelmi cél és a meglévő
piszkozat-/evidence-kapuk szintézise. Bizonyosság: közepes; megfigyelt
Doorstar-felhasználói munkamenetekkel validálandó.

- [ ] Pozíció duplikálása és tömeges módosítása változás-előnézettel,
      kijelölt célokkal, mezőnkénti forrásmegőrzéssel és visszavonható helyi
      piszkozattal; `SIDE_A/SIDE_B` és `FIXED/ADJUSTABLE` soha ne legyen
      automatikusan felcserélve.
- [ ] Terméktípusonként completeness-mátrix és „következő teendő” szűrők:
      felmérésre vár, műszaki hiány, review, jóváhagyott, tervezési átadásra
      vár. Loading/refetch/error alatt a célakciók maradjanak fail-closed.
- [ ] Összehasonlító revíziónézet mező-, dokumentum- és evidence-szinten;
      változatlan/eltérő/hiányzó állapot ne csak színnel legyen jelölve.
- [ ] Helyszíni mobil komfort folytatása: az egytételes, alsó menüs, 44–48 px
      célú és fókusz-visszaadó alap elkészült; nyitott a fotó/dokumentum-
      hozzárendelési visszajelzés, dirty-state és megszakított mentés
      helyreállítása.

### P2 — irodai koordináció és tanulható sablonok

Forrás: `UX_PRODUCT_HYPOTHESIS`; közvetlen felhasználói prioritás vagy Nexus-
igazolás nincs. Bizonyosság: alacsony/közepes, P0/P1 használati tapasztalat
után újrapriorizálandó.

- [ ] Projektáttekintő termékcsalád-, felelős-, határidő- és blocker-szűrőkkel,
      valamint pozíciószintű készültségi összesítéssel; az üzemi filctábla
      vizuális és viselkedési nyelve maradjon külön.
- [ ] Csak ember által jóváhagyott, verziózott Doorstar profil-/mezősablonok
      használata gyakori ajtó-, blende- és falpanel-konfigurációkhoz. A sablon
      forrása és verziója látszódjon; Nexus-találatból ne keletkezzen runtime
      sablon vagy alapérték.

### Minden backlog-tétel közös done-kapuja

- Fókuszált unit/DOM teszt, teljes lint és build, 1440/390 px light/dark
  böngészős bizonyíték, dokumentumszintű overflow-hiány, tiszta konzol,
  billentyűzet/fókusz/állapotjelzés és authority-refetch fail-closed teszt.
- A termékfogalom vagy mező forrása (`DOORSTAR_LOCAL`, szerver-contract,
  import evidence vagy `NEXUS_ADVISORY`) és bizonytalansága a UI-specben és a
  tartós memóriában is maradjon visszakereshető.
