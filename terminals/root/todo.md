# Doorstar Root teendők

## Aktív

- [x] A Doorstar működésének és szóhasználatának faipari szakzsargon-auditja,
      kanonikus Markdown-szótár és gépi JSON-baseline elkészítése.
- [x] A kontrollált, `doorstar`-only Nexus RAG dry-run csomag elkészítése:
      forrásleltár, 6 kanonikus dokumentum, verziózott manifest, idempotencia,
      35 eval kérdés és review-jelentés.
- [x] A Nexus RAG v1.0 emberi jóváhagyása és kontrollált live applyja: exact
      41 új / 23 legacy csere, 2016 végső rekord, idempotens ellenőrzés és hat
      principal smoke. A v1.0 immutable.
- [x] A claim-szintű chunkolású RAG v1.1 dry-run üzleti/minőségi review-ja:
      exact lineage PASS, retrieval-döntés `HOLD_FOR_RETRIEVAL_TUNING`; nem
      történt újabb Nexus/ChromaDB módosítás.
- [ ] P0 — Külön verziózott kétlépcsős retrieval-kísérlet készítése: dokumentum-/
      témaszintű előszűrés, azon belüli claim-ranking, előre jóváhagyott
      @5/@10/@20 acceptance-küszöbök és változatlan kanonikus/eval bemenetek.
- [ ] P1 — Üzemeltetési döntés a 3460-as Doorstar Knowledge Service tartós
      felügyeletéről: jelenleg egészséges, de systemd unit nélkül user-session
      scope-ban fut. Unit/deploy csak külön jóváhagyással.
- [ ] A valós adatra váltás előtt külön mező/szemantika a vállalt szállítási
      határidőnek és a várható kiszállításnak.
- [x] A backend felmérési teljességkapuját egyeztetni a frontend kész
      falnyílás-, kész falvastagság- és ajtólap-geometriájával.
- [x] Exact-revíziós readiness és projekt-workflow read authority, irodai
      projektlánc-panel, mixed-snapshot fail-closed tükörvalidáció és teljes
      desktop/mobil light/dark minőségi kapu megvalósítása.
- [x] Reprodukálható, idempotens helyi UX referencia-projekt készítése két
      revízióval és a jelenlegi authority-lánc adatgazdag fixture-ével.
- [x] Revíziófókuszú rendelési adatlap, irodai projektmunkatér-navigáció,
      invalid-query helyreállítás és stabil projekt-breadcrumb elkészítése.
- [x] A VERIFIED OperationPlan exact GET read-only frontend adoptionja,
      negatív fail-closed DOM-lefedettséggel és zárt production release-szel.
- [x] A mobil office header átfedésének, témakapcsolójának és látható
      navigációs scrollbarjának UX-javítása.
- [x] A DSMR Sales-lap vizuális hierarchiáját követő kompakt rendelési
      átadónézet, progresszív részletek, exact következő teendő, refetch/
      historical/invalid fail-closed szöveg és tablet-header overflow-javítás.
- [ ] Következő P0: exact-revíziós, read-only Product Position Register a
      projektcockpitben külön `DOOR | WALL_PANEL` pozíciókkal, per-position
      product-spec/readiness adatokkal és OIDC-ig nulla mutationnel.
- [ ] A kétoldali ajtószerkezet (`SIDE_A/B`, leaf face, casing state/role,
      handing, opensIntoSide) strukturált backend/OpenAPI szerződését
      megvalósítani a már fail-closed frontend gate mögött.
- [ ] A falpanel saját projektpozíció-/zónaigényét elválasztani a tényleges
      `ManufacturedItem`/`SupplementaryItem` rekordtól; a blendét az ajtó
      opcionális felső takarási részleteként modellezni explicit fix méretű vagy
      plafonig tartó móddal, önálló felület/szín adattal és gyártási automatikák
      nélkül.
- [ ] A stage–munkaállomás–művelet–állapot terminológiát egy configban
      konszolidálni; az `Egyéb → CSOMAGOLAS` automatikus jelentést felülvizsgálni.
- [x] A hat Claude-terminálsémából Codex custom agentet készíteni, külön Nexus
      identityvel, Doorstar-szigetleképezéssel és knowledge-only RBAC-kal.
- [x] Új izolált Codex taskban ellenőrizni a custom-agent discoveryt:
      `doorstar_monitor` a helyes principal- és konfigurált sandboxértékkel
      válaszolt, fájl- és MCP-művelet nélkül.
- [x] A Nexus első policy-betöltési hibáját fail-closedra javítani, és az élő
      systemd unitot restart előtti knowledge-only policy-validátorral védeni.
- [ ] Klienskörnyezetben javítani a Windows read-only sandbox helper
      `orchestrator_helper_launch_failed / os error 5` jogosultsági hibáját.
      Ez nem Doorstar/Nexus konfigurációs hiba; a sandbox nélküli discovery
      smoke és a statikus sandbox-contract zöld.
- [ ] Folyamatos mailbox-feldolgozás: a 2026-07-31 21:54:57-ig beérkezett
      frontend/backend readiness-handoffok feldolgozva; minden későbbi új
      üzenetet külön át kell venni és a döntését rögzíteni.
- [ ] Begyűjteni a Schedulinghez a kontraktus-reviewer jelölést, a standard
      verzióváltási példát, az overload-példát és a naptárjóváhagyást.
- [x] Fogadni és rögzíteni a platform `spaceos.scheduling` M3 read-only
      kontraktusát: OpenAPI 3.1, `/api/scheduling/v1`, hash
      `3fc6c57d4ec6d768c432bb023e5ca98f4a960c70f7331f482e276729adfc0756`.
- [ ] A platform-repóból ellenőrzötten lekérni és Doorstar-oldalon hash-pinelni
      az M3 OpenAPI-forrást; ezután generált TypeScript klienst készíteni csak
      shadow/read-only használatra.
- [ ] Megvárni a Tailnet-only sandbox base URL-t, demo tenantot és a dedikált
      Keycloak kliens/tokenigénylés módját. Addig nem küldeni élő API-kérést.
- [x] Rögzíteni a végleges `partialRelease` policyt és a
      `partial_release_delays_fs_start` warningot a v2 fixture-ben; a
      százalék naptár-tudatos feloldása továbbra is platform C# feladat.
- [ ] A valós overload-jelölt (fóliázó, 68,91 munkaóra) mellé hitelesíteni az
      akkori kapacitást, műszakot és kivételeket; csak utána készülhet belőle
      adatminimalizált platform-fixture.
- [ ] Megkeresni ugyanazon Doorstar standard eltérő, előtte/utána revízióját;
      a júliusi munkafüzetek mind `00.0.01` beállítás-verziójúak.
- [ ] A Power Query M-definíciókból és a query-kimeneti sémákból elkészíteni a
      `Folyamat` extraktor konkrét mezőtérképét a már kész, tiszta
      `folyamatOperationPreflight` adapterhez. Ez forrásrekonstrukció, nem
      Excel-képlet vagy VBA másolás.
- [x] Az exact 23 legacy Doorstar chunk mentésének/cseréjének és a kontrollált
      exact-ID applynak az explicit felhatalmazása és végrehajtása; végső count
      2016, idempotens `SKIP_IDENTICAL`.
- [x] A 35 kérdéses post-live eval és a hat role-principal Doorstar-island
      smoke lefuttatása. Az eval minőségi rése külön v1.1 dry-run feladat.

## Későbbi

- [ ] Ügyfél-visszajelzés után dönteni a demó adatról valós adatra váltásról.
- [ ] Éles autentikáció esetén a jelenlegi `X-Role` / `X-Station` fejléc-alapú
      védőhálót valódi belépési modellel kiváltani.

## Szabály

Minden lezárt nagyobb lépés után frissíteni kell a `state.md` és `memory.md`
állapotát, valamint szükség esetén a megfelelő mailbox- vagy task-üzenetet.
