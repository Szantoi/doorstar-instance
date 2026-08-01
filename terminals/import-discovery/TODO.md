# Import Discovery TODO

**Utolsó frissítés:** 2026-07-31

## Aktív cél

A legacy Sales-, felmérési, CAD-, Excel- és SharePoint-metaadatokból olyan
kereshető, forrásra visszavezethető `SourceCatalog` előkészítése, amelyből csak
emberi review után készülhet Project-, rendelés-, pozíció-, határidő- vagy
dokumentumkapcsolat.

## Következő végrehajtható feladatok

- [x] Kontrollált Nexus RAG-forrásleltár és hat PII-/rendelésadat-mentes
      kanonikus tudásdokumentum elkészítése teljes forráshash-citációval.
- [x] Verziózott `doorstar`-only manifest, idempotencia-szerződés,
      determinisztikus offline dry-run validátor és 35 kérdéses eval-korpusz.
- [x] Dry-run + review-jelentés: 6 dokumentum / 98 claim / 41 chunk,
      0 hiba, 0 warning; Nexus/ChromaDB/network/database write nem történt.
- [x] Független dry-run biztonsági QA: 12/12 unit, dupla bájtazonos futás,
      hardlink/symlink és input-felülírás elleni kapu; P0/P1 nincs.
- [ ] Emberi tulajdonosi review és explicit döntés a RAG-betöltésről. Addig a
      `READY_FOR_HUMAN_REVIEW` dokumentumok nem ingestálhatók.
- [ ] A snapshot-alapú `SourceCatalog` Prisma/API tervet a meglévő ADR alapján
      additív, tesztsémás implementációs taskokra bontani.
- [ ] A frontendnek átadni a csak olvasható Forráskatalógus,
      Projektcsomag-review, Dokumentumrészletek és Integráció állapota
      képernyők elfogadási feltételeit.
- [ ] A 109 munkaszám-azonosítási review rekordból — 105 `CONFLICT`, 4
      `MULTIPLE` — determinisztikus emberi review-listát készíteni.
- [ ] A 640 releváns, munkaszám nélküli dokumentumot fájlnév-, mappa- és
      dokumentumtípus-minták szerint review-csoportokra bontani, találgatás
      nélkül.
- [ ] Folytatni a projektcsomagok PDF-first egyeztetését: Sales
      `GYÁRTÁSMEGRENDELÉS` → felmérés → CAD/XLSM → `Ütemterv.xlsx`.
- [ ] A falpanel-, bútorfront-, kiegészítő- és műhelykomponens-adatokat külön
      gyártási tételként/evidence-ként tovább finomítani.
- [ ] Verziózott `ComponentProposalEvidence` szerződést készíteni a
      RAG/profilrajz kimenetéhez: dokumentumverzió és relatív út, lokátor,
      raw/normalizált érték, komponenskulcs, rule key/version,
      profile fingerprint, review state és resolution.
- [x] Backend P0 evidence-kapu: manufactured evidence egyszeri auditált
      review, parent `VERIFIED` csak teljes auditú `RESOLVED` sorokkal, és a
      component snapshot külön újraellenőrzése. Célzott backend teszt 10/10.
- [ ] Adverszáriális tesztben bizonyítani, hogy source link, munkaszám,
      fájlnév, ajtóméret és legacy formula önmagában nem tölthet ki
      komponens- vagy szabászati sort.
- [x] Frontend source-eligibility kapu: manufactured csak `VERIFIED` +
      nem üres, minden soron `RESOLVED` evidence; `SOURCE_REVIEW`
      supplementary ugyanezt követi.
- [x] Frontend soronkénti source-evidence review UI és teljesaudit-kapu.
      Import-discovery célzott ellenőrzés: 6 fájl / 19 teszt zöld.
- [x] Frontend exact-revision parent-item kapu: a teljes manufactured és
      supplementary lista számít, ezért a komponens-payloadból kihagyott
      nyitott source item is blokkol. Teljes QA: 23 fájl / 69 teszt, lint és
      build zöld.
- [x] P2 frontend tesztmélység: `ComponentWorkspacePage` DOM/API integrációs
      teszt bizonyítsa, hogy aktív aggregált parent-blocker mellett nem indul
      snapshot POST. Igazolt: `Gyártott 0/1`, műszaki audit-link, editor/gomb
      DOM-hiány és create-mutation 0 hívás.
- [x] P3, nem blokkoló frontend teszt-robosztusság: a page-regresszió a teljes
      App route-fát használja vagy közös route-konstansból dolgozzon, és
      explicit igazolja, hogy a fixture-ben az evidence az egyetlen blocker.
      Lezárva közös route helperrel és pontosan egy blocker-listitem
      assertionnel.
- [ ] A jövőbeli import/RAG evidence-sémában szerveroldalilag tiltani a final
      review state, resolution, reviewer és időpont adapterből történő
      megadását; csak auditált review PATCH írhassa ezeket.

## Élő SharePoint-integráció előtti P0 kapuk

- [ ] Valódi Entra/OIDC hitelesítés és szerveroldali RBAC; az `X-Role` nem
      elfogadható élő védelem.
- [ ] Tenant-admin által kijelölt egyetlen site/library és bizonyított,
      kizárólag olvasási jogosultság.
- [ ] Stabil `siteId + driveId + itemId`, eTag/verzió, lapozás, delta-cursor,
      tombstone és reconciliation perzisztens modellje.
- [ ] Megnevezett üzleti owner és projektkapcsolati reviewer.
- [ ] Egyetlen könyvtár kontrollált INITIAL szinkronja, majd snapshot–Graph
      darabszám- és identitás-egyeztetés; scheduler csak külön jóváhagyással.

## Elkészült minőségi kapuk

- [x] 9 297 forrássor teljes elszámolása.
- [x] 5 855 dokumentum és 2 988 mappa determinisztikus snapshotja.
- [x] 3 977 releváns dokumentum és 271 erős csomagjelölt elkülönítése.
- [x] Közös `sharePointMetadataRules.py` szemantikai szabálykönyvtár.
- [x] Byte-pontos golden replay:
      `spcatalog_974bb607bd9c693017d1`, validáció 0 hiba.
- [x] Backend build; OpenAPI 78/78; teljes Vitest 32 fájl / 98 teszt.
- [x] Frontend exact-revision Kalkulátor source-contract fogadása és az
      import/evidence dokumentációba építése.

## Leállási és biztonsági feltétel

Élő connector, automatikus Project/OrderDocument létrehozás, production/public
adatbázisírás vagy deploy nem indulhat, amíg valamely P0 kapu nyitott. A
snapshot-felderítés és a tesztsémás fejlesztés csak forrást nem módosító,
makrómentes és bizonyítékkal ellenőrzött módban folytatható.
