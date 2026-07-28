# Doorstar Root teendők

## Aktív

- [ ] Feldolgozni a `inbox/` új, olvasatlan üzeneteit és rögzíteni a döntéseket.
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

## Későbbi

- [ ] Ügyfél-visszajelzés után dönteni a demó adatról valós adatra váltásról.
- [ ] Éles autentikáció esetén a jelenlegi `X-Role` / `X-Station` fejléc-alapú
      védőhálót valódi belépési modellel kiváltani.

## Szabály

Minden lezárt nagyobb lépés után frissíteni kell a `state.md` és `memory.md`
állapotát, valamint szükség esetén a megfelelő mailbox- vagy task-üzenetet.
