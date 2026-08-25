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
- [x] A 26133 közvetlen Sales+gyártási PDF evidence alapján a fejlesztői Sales
      intake UI elkészítése: három eszközmód, normalizált egyedi pozíciókód,
      MONTH/structured-appearance fail-closed és production PII POST-zár.
      Teljes frontend 223/223, lint/build/browser és reviewer P0–P3 = 0.
- [x] DSCONV-03 M0 — tiszta baseline-os, default-off identity-authority M2M
      kliens: strict config/assertion/response contract, 48/48 fókuszált unit,
      build és OpenAPI zöld. Nem BFF, nem route és nem próbaüzemi aktiválás.
- [x] P0 — DSCONV-03 M1 terv: független security-, architektúra- és
      adatmodell-review lezárva, P0/P1 nélkül. A legacy 66-táblás RLS migráció
      nem emelhető át.
- [x] P0 — DSCONV-03 M1A: tiszta control-plane binding/evidence-policy source
      alap, opaque proof boundary, runtime factory-mentes exportfelület és
      descriptor-snapshot fail-closed unit proof. Nem BFF, nem session és nem
      üzleti multi-tenant/RLS proof.
- [x] P0 — DSCONV-03 M1B source: Prisma control-plane/evidence/session modellek,
      forward-only migration, append-only/revoke/truncate DB-guardok, exact UTC
      triple-ek, valamint külön, defaultból kizárt migration-proof harness.
      Raw human access-token perzisztencia kizárt; ez még nem üzleti
      multi-tenant/RLS proof.
- [ ] P0 — DSCONV-03 M1B runtime proof: csak külön emberi jóváhagyással,
      dedikált eldobható loopback PostgreSQL célon futtatható `migrate deploy`
      + binding/constraint/trigger smoke. Sem meglévő `DATABASE_URL`, sem a
      persistent `5462` Docker-port nem lehet cél.
- [ ] P0 — DSCONV-03 runtime-principal preflight: M2/trial előtt auditáltan
      bizonyítani a nem-owner/non-superuser BFF szerepet, a `PUBLIC`/untrusted
      schema-`CREATE` tiltását, és a bindingra kizárólag lockhoz szükséges
      column-level `UPDATE(id)` least-privilege grantot.
- [x] P0 — DSCONV-03 M2 előfeltétel: HTTP- és operációs Pino-logok
      allowlist-alapú redakciója. Cookie/header/query/body/response-header,
      raw Error message/stack/cause és Pino automatikus Error→`msg` útja
      kizárt; statikus `event` mező megmarad a diagnosztikához. Célzott
      lifecycle és globális-logger negatív teszt, build és független security
      review zöld.
- [ ] P0 — DSCONV-03 M2: a tokenmentes evidence-et használó BFF/route és a
      teljes negatív contract-gate megvalósítása; humán bearer Kernel felé vagy
      session storage-ba nem kerülhet.
- [ ] DSCONV-03 M3/M4: csak Kernel snapshot reconciliation + release
      attestation, valamint külön emberi jóváhagyás után eldobható local
      Keycloak–Kernel–Doorstar integráció és két-tenantos E2E bizonyíték.
- [ ] P0 — DSORD-18 backend/OpenAPI: hitelesített és idempotens Sales intake v2,
      delivery precision union, raw cm/conversion lineage, külön komponens-
      felületek, DB-unique pozíciókód és stabil concurrency/error envelope.
- [ ] P0 — DSORD-17 + import-011 után a műszaki előkészítés read-only
      dokumentumcsomag-readiness/preview UI-ja; review/kiadás csak exact
      package/IssuedWorkPackage authorityval.
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
- [x] Külön telefon/tablet/PC rendelési UX: egykezes alsó mobil menü,
      egytételes pozíciórészlet és fókusz-visszaadás; olvasható kétpaneles
      tablet; megtartott papírszerű PC-átadás. Teljes frontend 193/193,
      lint/build és független reviewer PASS.
- [x] A telefonos megnyitott pozíciórészlet teljes használható szélességének
      helyreállítása explicit egyoszlopos phone griddel; 320/390/620 px QA,
      621 px tablet-határ és független reviewer PASS.
- [x] A fejlesztői favicon 404 megszüntetése explicit SVG public assettel;
      friss browser-konzol warning/error nélkül, lint/build és reviewer PASS.
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
- [ ] Folyamatos mailbox-feldolgozás: a 2026-08-01 07:30-as frontend UX-
      fixture-handoffig minden üzenet feldolgozva; minden későbbi új üzenetet
      külön át kell venni és a döntését rögzíteni.
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
