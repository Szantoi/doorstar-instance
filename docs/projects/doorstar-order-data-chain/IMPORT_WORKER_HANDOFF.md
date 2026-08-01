# Adatfeltérképező task — közös handoff

## Cél

A Doorstar meglévő dokumentum- és Excel-alapú munkafolyamataiból készüljön
adatleltár, forrásmező → célmező mapping és kontrollált import-előnézet.

## Források — csak olvasás

- `C:\Users\szant\Doorstar Kft\Gyártás-Dokumentumok - Dokumentumok\01 - Megrendelés`
- `C:\Users\szant\Doorstar Kft\Gyártás-Dokumentumok - Dokumentumok\03 - Határidők`
- `C:\Users\szant\Doorstar Kft\Gyártás-Dokumentumok - Dokumentumok\2026`

Ne hozz létre, módosíts vagy törölj fájlt ezekben a mappákban. Ne másolj üzleti
dokumentumbinárist a repositoryba. Makrót nem szabad futtatni.

## Domain-szabályok

- Egy új megrendelés mindig új `Project`, ismételt vevőnél is.
- A méret sorrendje: szélesség × magasság × vastagság, mm.
- A felmérés véglegesíti a típust, nyitásirányt, méretet, felületet,
  falmegoldást (`nincs` / `falpanel` / `blende`) és üvegezést.
- A Sales dokumentumot ad át; a rendszer csak relatív dokumentumhivatkozást
  tárol, binárist vagy abszolút Windows útvonalat nem.
- A `.bak`, `.dwl`, `.dwl2`, Office-ideiglenes és lock/cache fájl kizárandó.
- Az XLSM csak olvasható szerkezeti/adatforrás; makrófuttatás tilos.

## Elvárt eredmények

1. `IMPORT_DISCOVERY.md`: mappastruktúra, csomagminták, Excel-munkalapok,
   fejlécek, mezők és adatminőségi problémák.
2. `IMPORT_MAPPING.md`: forrásmező → Doorstar célmező megfeleltetés.
3. Determinisztikus import-előnézeti script vagy eszköz JSON/CSV kimenettel.
   Az alapértelmezett mód kizárólag preview, nem ír adatbázisba.
4. Tesztadatbázisba írás csak preview után, csak a Dockeres `doorstar_test`
   sémába engedett. A `public`/éles adatbázist nem érintheti.

## Elsődleges elemzési fókusz

- `03 - Határidők\Ütemterv.xlsx`: munkaszám, ügyfél, prioritás, határidő,
  tervezett beépítés és Sales-kommunikáció mezői.
- `01 - Megrendelés`: Sales dokumentumcsomagok és projektazonosítók.
- `2026`: stabil projektcsomag-szerkezet, felmérési / gyártási dokumentumok,
  kalkulátor- és folyamatmunkafüzetek.

## Visszajelzési napló

Ide, új bejegyzésként írd a munkaállapotot. Használd ezt a formátumot:

```markdown
### YYYY-MM-DD HH:MM — állapot

- Elvégzett munka:
- Bizonyíték / futtatott ellenőrzés:
- Talált adatminőségi vagy mapping-kérdés:
- Következő biztonságos lépés:
```

## Aktív koordináció — adatgyűjtő session ↔ fejlesztés

**Fejlesztői állapot (2026-07-29):** a `doorstar_test` sémában már létezik a
`DSMR-24181` minta `SURVEY_PENDING` DRAFT-ként (12 pozíció, 2
dokumentumhivatkozás). Ezt és más meglévő projektkulcsot az importáló ne írjon
felül; minden megrendelés új projekt.

**Az adatgyűjtő minden betöltés után ide írja:**

```markdown
### YYYY-MM-DD HH:MM — import eredmény

- Projektkulcs / munkaszám:
- ImportRun azonosító vagy preview artefakt:
- Betöltött pozíciók és dokumentumhivatkozások száma:
- Célállapot (`SALES_DRAFT` vagy `SURVEY_PENDING`):
- Megőrzött Excel/PDF források és ismert eltérések:
- Nyitott hiba/hiányjelzések, prioritással:
```

**Fejlesztői reakció:** a jelzett eltérésekből javítom a mappinget vagy a
felületet; a forrás Excel/PDF nem módosul. Éles/public séma, makrófuttatás,
jóváhagyás és gyártási kiadás továbbra sem része az adatgyűjtő munkának.

## Jelenlegi koordinátori megjegyzés

Az alkalmazásban már létezik Sales → dokumentumhivatkozás → felmérés → műszaki
előkészítés kapu. A dokumentum-importnak ehhez az `OrderDocument` modellhez
kell relatív hivatkozásokat szolgáltatnia. A koordinátor a felderítés eredménye
alapján illeszti majd a tényleges importot a rendelési API-hoz.

### 2026-07-29 12:41 — felderítés elkészült

- Elvégzett munka: elkészült az `IMPORT_DISCOVERY.md`, az
  `IMPORT_MAPPING.md`, valamint a `previewLegacyOrderImport.py` csak-preview
  eszköz és annak unit tesztje. A források végig olvasásra kerültek, makró-
  vagy adatbázisfuttatás nélkül.
- Bizonyíték / futtatott ellenőrzés: a preview 58 munkaszám/projektjelöltet,
  1 173 dokumentumjelöltet, 270 Excel-forrást, 278 `Ütemterv.xlsx`
  határidősort és 730 pozíciójelöltet adott. Backend build, OpenAPI
  ellenőrzés (51/51 route) és teljes backend teszt 71/71 zöld.
- Talált adatminőségi vagy mapping-kérdés: a 730 pozíciójelöltben nincs
  megbízható vastagság; a felület, falpanel/blende és üveg külön Excel-
  lapokon van, ezeket a felmérésnek kell hitelesítenie. Kilenc projekt-
  jelölthöz hiányos az ügyfél/név, 14-höz nincs `AlapAdat`
  pozíciójelölt, három határidősorban nincs felismerhető munkaszám.
- Következő biztonságos lépés: egyetlen, új munkaszám teljes Sales-csomagját
  kell emberileg kiválasztani és a felmérési mezőket lezárni. Ezután
  `doorstar_test` sémában, import-futás/provenance védelemmel lehet DRAFT
  próbabeírást tervezni; production/public séma változatlanul tiltott.

### 2026-07-29 13:06 — 24181-es teljes mintacsomag ellenőrizve

- Elvégzett munka: a `24181 - Aktív és Passzívház Kft.` archív csomagja, a
  Sales-dokumentumhivatkozások és a határidősorok alapján elkészült a
  `IMPORT_SAMPLE_24181.md` minta. A munkafüzet 12 ajtópozíciót tartalmaz,
  típussal, nyitással, felülettel és vasalati adatokkal.
- Bizonyíték / futtatott ellenőrzés: 19 dokumentumjelölt, 12 pozíció, 2
  határidősor; minden XLSM csak OOXML-cache olvasással, makrófuttatás nélkül
  került feldolgozásra. Az importfutás provenance-védelmének célzott tesztje
  3/3 zöld.
- Talált adatminőségi vagy mapping-kérdés: a munkafüzet méretmezői üresek,
  de a 2026-06-24-i Sales gyártásmegrendelés PDF-je minden pozíciónál
  tartalmazza a falnyílásméretet. A 2025-ös ütemezői dátumok ellentmondanak
  a PDF 2026. augusztus végi szállításának; egy eltérő munkaszámú felmérési
  segédfájl is ellenőrzést igényel.
- Következő biztonságos lépés: a PDF-méreteket DRAFT-ként előtölteni,
  felmérésben ellenőrizni a falkezelést és üvegezést, majd csak
  `SURVEY_PENDING` állapotban előkészíteni a `doorstar_test` sémában.

### 2026-07-29 13:22 — kontrollált DRAFT-import határ elkészült

- Elvégzett munka: megvalósult az előnézethez kötött, egyszer használható
  `apply-draft` API-határ. Egy `PREVIEWED` importfutásból kizárólag új Projekt,
  DRAFT revízió, pozíciók és dokumentum-metaadatok jöhetnek létre.
- Bizonyíték / futtatott ellenőrzés: a teljes backend tesztkészlet 17 fájlban
  74 teszttel zöld; a build és az OpenAPI route-drift ellenőrzése is zöld.
- Biztonsági korlát: a kapcsolatnak `doorstar_test` sémára kell mutatnia,
  az importfutás nem lehet már alkalmazott, és `public` kapcsolaton a route
  409-cel elutasítja a kérést.
- Következő biztonságos lépés: a 24181-es összerakott, felmérésre váró DRAFT
  payload emberi átnézése, majd a tesztsémás alkalmazása; jóváhagyásra vagy
  gyártási kiadásra ezután sem kerülhet automatikusan.

### 2026-07-29 13:31 — 24181 teszt-DRAFT betöltve

- Elvégzett munka: a `DSMR-24181` új Projektként bekerült a `doorstar_test`
  sémába, első DRAFT revízióval, 12 pozícióval és két hash-elt, relatív
  dokumentumhivatkozással. Az importfutás rögzítve és `APPLIED` állapotú.
- Bizonyíték / futtatott ellenőrzés: az API válasza `SURVEY_PENDING`, 12
  pozíciót és 2 dokumentumot igazolt vissza. A forrás Excel/PDF változatlanul
  a fájlrendszerben maradt; bináris másolás nem történt.
- Működési döntés: a fokozatos átállás alatt az Excel marad a forrás és a
  napi rögzítés eszköze. A rendszerbe kiolvasható DRAFT-adatok kerülnek,
  amelyekhez a felhasználók hiányt vagy hibát jelezhetnek vissza.
- Következő biztonságos lépés: a felmérő- és Sales-felület hiba/hiányjelzés
  funkcióját az importált DRAFT-okhoz kötni, majd a javításokat a mappingben
  visszavezetni.

### 2026-07-29 13:33 — visszajelzési API elkészült

- Elvégzett munka: az `OrderFeedback` modell és API rögzíti az adatminőségi,
  importmapping-, dokumentum- és workflow-problémákat. Sales, felmérő és
  beépítő is jelezhet; műszaki előkészítés nyugtázhatja vagy lezárhatja.
- Bizonyíték / futtatott ellenőrzés: az integrációs feedback- és OpenAPI-teszt
  zöld, a backend build zöld, a helyi backend egészségellenőrzése `ok`.
- Következő biztonságos lépés: az irodai rendelésadatlap felületére felvinni
  a visszajelzési listát és a jelzés űrlapot.

### 2026-07-29 13:24 — aktív Sales-csomagok projektellenőrzése

- Elvégzett munka: a 24181-es már dokumentált mintán kívüli, aktív Sales-
  csomagok (`25171`, `26141`, `26147`, `26148`, `26151`) PDF- és
  dokumentumszerkezete, valamint az `Ütemterv.xlsx` kapcsolódó sorai
  csak olvasással össze lettek vetve. Az XLSM-eket nem futtattuk. A `2026`
  archívban egyik munkaszámhoz sincs azonosítható projektmappa vagy
  Kalkulátor/XLSM-forrás, tehát ezeknél a Sales PDF az egyetlen jelenlegi
  pozícióforrás.
- Bizonyíték / futtatott ellenőrzés:
  - `25171`: hét PDF és egy DWG, de „előzetes mérések” csomag; végleges
    gyártásmegrendelés, tétellista és határidősor nem azonosítható.
  - `26141`: négy PDF; a gyártásmegrendelés öt pozíciót tartalmaz
    (750/950/950/750/800 × 2 150 mm), tapétaajtó/Raso90-alutok, RAL 1013
    kivitel és nyitásirány megadható. Falvastagság nincs kitöltve.
  - `26147`: három PDF és két DWG; a `DSMR 2.pdf` falpanelelemek
    újragyártását írja, „felmérés szerinti kialakításban és méretekben”,
    de importálható ajtópozíciót és méretet nem ad.
  - `26148`: egy PDF; két 840 × 2 150 mm-es, vastagság nélküli,
    falsíkban záródó tapétaajtó pozíció olvasható. A RAL/NCS szín
    kifejezetten pontosítandó; a többi sor kiegészítő/lábazati elem.
  - `26151`: egy „Előzetes” PDF; hét 2 100 mm magas pozíció olvasható,
    750/750/850/750/900/900/750 mm szélességgel, vastagság nélkül.
    A felületválasztás, marási minta és egyes magassági egyeztetések még
    nyitottak.
- Talált adatminőségi vagy mapping-kérdés:
  - `26141`-hez nincs azonos munkaszámú `Ütemterv` sor. Az `ADAT` lap 185.
    sora hibás kapcsolatjelölt: munkaszáma `26148`, de megrendelője az
    Aelan Beauty; ezt nem szabad egyik projekthez sem automatikusan kötni.
  - `26147`: Sales PDF szerint 2026. augusztusi várható szállítás, az
    `ADAT` lap 233. sora 2026-07-31-et tartalmaz.
  - `26148`: a PDF 2026. augusztus-szeptembert ír, a helyes `ADAT`-sor
    (234.) 2026-08-15-öt; ez időablak-eltérés. Ugyanitt a 185. hibás
    Aelan-sor külön karanténjelölt.
  - `26151`: PDF szerint 2026. szeptember eleje, az `ADAT` 235. sora
    2026-09-03; ez közel egyezik, de az alumínium tokok 08.03-i beépítési
    megjegyzése nem rendelési határidő. `SURVEY_PENDING` marad.
  - `25171`, `26147`, `26148` és `26151` esetén a teljes
    szélesség × magasság × vastagság hármas hiányzik; `26141`-nél is
    hiányzik a vastagság. Ezeket felmérés nélkül nem lehet véglegesíteni.
- Következő biztonságos lépés: a fenti öt projektből csak a `26141` és a
  `26148` indítható előkészített DRAFT-pozíciólistával, kizárólag a hiányzó
  falvastagság és felmérési műszaki mezők explicit review-jával. A `25171`,
  `26147` és `26151` maradjon dokumentum-/felmérés-váró karanténban. A két
  hibás vagy ütköző `Ütemterv`-kapcsolatot Salesnek kell javítania, mielőtt
  bármilyen `doorstar_test` próbaimport készül.

### 2026-07-29 13:32 — tárolási és webapp-hasznosítási terv

- Elvégzett munka: elkészült az `IMPORT_STORAGE_AND_APP_USAGE.md` terv a
  meglévő `Project` → `ProductionOrder` → `OrderRevision` →
  `OrderPosition`/`OrderDocument` modell, az új `ImportRun` provenance és a
  jelenlegi rendelés-/felmérés-oldalak alapján.
- Bizonyíték / futtatott ellenőrzés: a backendben már létezik a
  `PREVIEWED` → egyszer használható, kizárólag `doorstar_test`-re kötött
  DRAFT-import határ. A webappban már megvan a rendelésregiszter,
  dokumentumkapu és felmérési munkatér; import-inbox, határidő-eltérés és
  mezőszintű forrásbizonyíték felület még nincs.
- Talált adatminőségi vagy mapping-kérdés: a Sales PDF `Falnyílás méret`
  harmadik értéke falvastagság, ezért `openingDepthMm`, nem
  `doorThicknessMm`. A jelenlegi felmérési UI ezt a két fogalmat egyetlen
  dimenziócsoportban mutatja; import előtt külön falnyílás és ajtólap/termék
  mezőcsoport kell. A kétoldali felületet sem szabad egyetlen `surface`
  sztringbe elveszíteni.
- Következő biztonságos lépés: az import normál webapp-funkcióvá emelése
  előtt `ImportCandidate`, `OrderDeadlineObservation` és
  `OrderPositionEvidence` adattárolást, majd csak tesztsémás Import Inboxot
  kell készíteni. Csak a felmérés által igazolt érték mehet review/approval
  és később kalkuláció/tervezés felé.

### 2026-07-29 13:41 — kereshető forrásismeret iránya

- Elvégzett munka: a digitalizálás célja pontosítva lett: nem csak DRAFT
  rendelési adatot kell betölteni, hanem a PDF/XLSX/XLSM/DWG forrásokban lévő
  adatokat kereshető, hivatkozott tudásrétegben kell rendelkezésre bocsátani
  a webapp és a rendszerfejlesztés számára. Részletes terv:
  `SEARCHABLE_SOURCE_KNOWLEDGE.md`.
- Bizonyíték / futtatott ellenőrzés: ez illeszkedik a meglévő projektterv
  `SharePointDocumentVersion → Chunk → domain entities` GraphRAG-irányához.
  A jelenlegi `OrderDocument` és `ImportRun` megőrzi a rendelési hivatkozást
  és provenance-t, de önmagában nem ad sor-/oldalszintű keresést.
- Talált adatminőségi vagy mapping-kérdés: a keresési találat nem lehet
  jóváhagyott gyártási adat. Minden találatnak forrásverziót, PDF-oldalt vagy
  Excel-lap/sorszámot, kivonatot és `EXTRACTED`/`UNVERIFIED` állapotot kell
  adnia. XLSM-makró, formula vagy Power Query futtatása továbbra is tiltott.
- Következő biztonságos lépés: először a `01 - Megrendelés` és az
  `Ütemterv.xlsx` read-only forráskatalógusát, kivonatait és kulcsszavas
  keresőjét kell elkészíteni; a webapp projektoldalán Források panel,
  fejlesztői oldalon ACL-szűrt `knowledge/search` API vagy MCP retrieval
  szolgálja ki. A teljes 2026-archív és szemantikus keresés csak ezután jön.

### 2026-07-29 13:47 — adatfeltérképező → fejlesztői egyeztetési felajánlás

- Az adatfeltérképező vállalja a következő importokhoz a projektcsomagok
  read-only leltárát, a Sales PDF/XLSM mezők és pozíciók kinyerését,
  relatív dokumentumhivatkozások + SHA-256 bizonyítékok előállítását,
  `Ütemterv`-ellentmondások jelölését, valamint a preview JSON/CSV és a
  `ImportRun`-hoz szükséges forrás-ujjlenyomat elkészítését.
- A már betöltött `DSMR-24181`-et nem írja felül. Ahhoz kizárólag a
  `OrderFeedback`-on keresztül dokumentálható forrás-, mapping- vagy
  hiányjelzést készít.
- Kért fejlesztői visszajelzés a következő adatszelethez:
  1. milyen `OrderFeedback` kategória/kód legyen az import-eltérés,
     hiányzó felmérési mező és határidő-konfliktus számára;
  2. milyen API-válaszban érhető el importált rendeléshez az `importRunId`,
     a dokumentumhivatkozások és a nyitott feedback-lista;
  3. az `ImportCandidate` / `OrderDeadlineObservation` / forrásbizonyíték
     modell mely minimális szerződését kéri először a webapphoz; és
  4. melyik új, még nem létező munkaszám legyen a következő tesztsémás
     próbaimport jelöltje.
- Következő adatfeltérképező lépés a fejlesztői válasz után: a kiválasztott
  munkaszám teljes preview-ja és review-listája, majd csak a jóváhagyott
  DRAFT-payload átadása. Forrásfájl-módosítás, makrófuttatás, felülírás és
  automatikus jóváhagyás nem történik.

### 2026-07-29 13:52 — fejlesztői válasz az adatfeltárképezőnek

1. **Feedback besorolás:** a jelenlegi API-kategóriák és kötelező
   üzenet-előtagok:
   - `DATA_QUALITY` + `MISSING_SURVEY_MEASUREMENTS:` — hiányzó vastagság,
     méret, üveg- vagy falkezelési adat;
   - `IMPORT_MAPPING` + `SOURCE_VALUE_CONFLICT:` — PDF/XLSM vagy több forrás
     eltérő értéke;
   - `DOCUMENT_REFERENCE` + `SOURCE_LINK_AMBIGUOUS:` — hibás munkaszám,
     bizonytalan dokumentumkapcsolat;
   - `WORKFLOW` + `DEADLINE_CONFLICT:` — határidő- vagy beépítési adateltérés.
   A következő adatmodell-szeletben ezek külön, kereshető `code` mezővé
   válnak; addig az üzenet elején maradnak géppel olvashatóan.
2. **Jelenlegi API-szerződés:** `GET /production-orders/:projectKey` a
   revízión szereplő `importRunId`-t és a dokumentumhivatkozásokat is
   visszaadja. A nyitott jelzések külön érhetők el:
   `GET /production-orders/:projectKey/revisions/:revision/feedback`.
   Új jelzés: ugyanez `POST`; műszaki lezárás:
   `PATCH .../feedback/:feedbackId`.
3. **Első, minimális forrásbizonyíték-szerződés:** minden importált jelölthöz
   legyen `projectKey`, `sourceFingerprint`, `sourceFile`, `relativePath`,
   `sourceKind`, `extractionState` (`EXTRACTED`/`UNVERIFIED`), valamint
   `locator` (PDF-oldal vagy Excel-lap+sor) és rövid `excerpt`. A határidő
   megfigyeléshez ezen felül `observedValue`, `normalisedValue` és
   `conflictWith` kell. Ez kezdetben preview-artifaktban marad; a tartós
   Import Inbox modell csak ezután következik.
4. **Következő próbaimport jelölt:** `DSMR-26148`. Két pozíciója és a helyes
   `ADAT`-sor viszonylag kis, jól ellenőrizhető szelet. A két explicit nyitott
   jelzés: `MISSING_SURVEY_MEASUREMENTS` (vastagság) és
   `SOURCE_VALUE_CONFLICT` (RAL/NCS szín, illetve PDF-időablak vs. 2026-08-15
   ütemezési dátum). A 185. Aelan/26148 hibás kapcsolatát ne használja.

**Fejlesztői válasz kérése:** a fenti egyeztetés végén a fejlesztő írjon új
bejegyzést ebbe az `IMPORT_WORKER_HANDOFF.md` naplóba. A bejegyzés tartalmazza
az elkészült API-/UI-támogatást, a ténylegesen használható szerződést, valamint
az összes nyitott eltérést és blokkot. Az adatfeltérképező a következő preview-
és import-előkészítési lépést kizárólag erre a rögzített válaszra építi.

### 2026-07-29 14:00 — DSMR-26148 bizonyítékos preview átadva

- Elvégzett munka: elkészült a fejlesztő által kért minimális
  bizonyíték-szerződést tartalmazó, csak preview módú artefakt:
  `IMPORT_PREVIEW_DSMR_26148.json`. Tartalmazza a `projectKey`,
  `sourceFingerprint`, relatív forráshivatkozás, SHA-256, PDF-oldal/Excel-lap
  locator és rövid kivonat mezőket. A forrásfájlok változatlanok maradtak,
  makró nem futott, adatbázisba nem történt írás.
- Előkészíthető DRAFT: egy új `DSMR-26148` Projekt és első revízió, két
  egy-egy darabos pozíció — `Gardrób (férfi)` / `Bal ki`, illetve
  `Gardrób (női)` / `Jobb ki`; mindkettő `Tapéta (Falsíkban záródó) TUT`,
  falnyílás 840 × 2 150 mm. A hivatkozott Sales dokumentum egyetlen PDF;
  csak relatív útvonal és hash került az artefaktba.
- Határidő-bizonyíték: a Sales PDF 1. oldala `2026. augusztus-szeptember`
  időablakot ad, a helyes `Ütemterv.xlsx` `ADAT!D234` sora `2026-08-15`.
  A konkrét dátum az időablakon belül van, ezért ez nem automatikus naptári
  ütközés, de Salesnek kell kijelölnie a kötelező határidő forrását. Az
  `ADAT!A185:O185` azonos munkaszámú, de `Aealan Beauty Kft.` ügyfelű sor;
  explicit `QUARANTINE`/`EXCLUDE_FROM_PROJECT`, semmilyen importhoz nem
  kapcsolható automatikusan.
- Nyitott review / javasolt `OrderFeedback`: `MISSING_SURVEY_MEASUREMENTS`
  (mindkét pozíció ajtólap-vastagsága hiányzik), `SOURCE_VALUE_CONFLICT`
  (a RAL/NCS-kód kifejezetten pontosítandó), `DEADLINE_CONFLICT` (Sales
  időablak kontra Ütemterv konkrét dátum felelőse), és
  `SOURCE_LINK_AMBIGUOUS` (Aelan-sor). A `Falvastagság`/ajtólap-vastagságot
  nem szabad egymásból következtetni; itt a PDF harmadik méretmezője `---`.
- Ellenőrzés: a teljes, csak olvasó preview a Sales + határidő forrásokon
  `226` dokumentumjelöltet, `51` munkaszámot, `278` határidősort és `40`
  Excel-pozíciójelöltet adott; a 26148-hoz egy PDF, két Ütemterv-találat
  (egy jó és egy karantén) tartozik. A dátum-sorszám normalizálási javítására
  a célzott `legacyImportPreview.unit.test.ts` zöld; a `46249` cache-érték
  ellenőrzötten `2026-08-15`-re alakul.
- Következő biztonságos lépés: Sales/felmérő előbb lezárja a vastagságot,
  RAL/NCS-kódot, falkezelést és üvegezést, valamint kijelöli a határidő
  authoritative forrását. Csak ezután állítható elő az `ImportRun`-hoz
  használható, emberileg jóváhagyott DRAFT-payload és alkalmazható egyszer,
  kizárólag a `doorstar_test` sémában.

### 2026-07-29 14:15 — DSMR-26141 bizonyítékos preview átadva

- Elvégzett munka: elkészült az `IMPORT_PREVIEW_DSMR_26141.json` csak olvasó,
  bizonyítékos előnézet. A négy PDF-hez kizárólag relatív dokumentumhivatkozás
  és SHA-256 került; forrásmódosítás, makrófuttatás, bináris másolás és
  adatbázisírás nem történt.
- Előkészíthető DRAFT: új `DSMR-26141` Projekt, első revízió, öt pozíció és
  négy dokumentumhivatkozás (gyártásmegrendelés, felmérés, két alutokrajz).
  Pozíciók: `Tároló` 750 × 2 150, `Rendelő 1.` 950 × 2 150,
  `Rendelő 2.` 950 × 2 150, `Közlekedő` 750 × 2 150, `Vendég WC`
  800 × 2 150 mm; típusuk Tapétaajtó/Raso90 alu tok. A Sales-dokumentum
  pozícióin a harmadik méret `---`, ezért ajtólap-vastagság nem tölthető.
- Forráselsőbbség és nyitott műszaki review: a 2026-06-26-i
  gyártásmegrendelés RAL 1013-at, a korábbi felmérés pedig fehér/alapozott
  kivitelre utaló szöveget tartalmaz. A Sales csak DRAFT-adatot adhat; a
  felmérésnek kell hitelesítenie a végleges felületet, ajtólap-vastagságot,
  falkezelést és üvegezést. Az alutokrajzok nem kaptak automatikus
  geometriakinyerést, csak dokumentumhivatkozást.
- Határidő: a gyártásmegrendelés külön ütemként `alu tok: 2026. július` és
  `ajtólap: 2026. augusztus` adatot ad; a felmérés 2026. július-augusztus
  intervallumot említ. Pontos `DSMR-26141` sor az `Ütemterv.xlsx`-ben nincs,
  ezért egyetlen kötelező projekt-határidő sem vezethető le automatikusan.
  Az azonos ügyfélhez tartozó, de `26148` munkaszámú sor nem használható
  helyettesítő kapcsolatként.
- Javasolt feedback: `MISSING_SURVEY_MEASUREMENTS` (mind az öt vastagság),
  `SOURCE_VALUE_CONFLICT` (felület/RAL 1013 vs. felmérési fehér-alapozott
  szöveg), `DEADLINE_CONFLICT` (szakaszos Sales-határidő vs. felmérési
  intervallum), `SOURCE_LINK_AMBIGUOUS` (nincs munkaszám szerinti
  Ütemterv-kapcsolat).
- Ellenőrzés: a gépi preview a csomaghoz pontosan négy dokumentumhivatkozást
  és nulla pontos Ütemterv-határidősort adott; a célzott JSON smoke check
  igazolta az öt pozíciót, a 750/800/950 mm szélességeket, a hiányzó
  vastagságot és a `databaseWrite: false` korlátot.
- Következő biztonságos lépés: felmérői hitelesítés és Sales határidő-döntés
  után készülhet csak a `doorstar_test`-hez jóváhagyott DRAFT-payload. Addig
  nem szabad ImportRun-t létrehozni vagy gyártási állapotot váltani.

### 2026-07-29 14:30 — DSMR-26151 karanténos review-csomag átadva

- Elvégzett munka: elkészült az `IMPORT_REVIEW_DSMR_26151.json` géppel
  olvasható, csak preview módú karantén-csomag. A háromoldalas, kifejezetten
  `Előzetes` gyártásmegrendelésből hét pozíciót és a felmérési alaprajz
  dokumentumhivatkozását rögzíti; a forrásokhoz csak relatív útvonal és hash
  került, forrásmódosítás/makró/adatbázisírás nem történt.
- Kinyert, de nem betölthető műszaki jelöltek: 750/750/850/750/900/900/750 ×
  2 100 mm, RASO 90 tapéta/falsíkban záródó típus és nyitásirányok. Minden
  harmadik méretmező hiányzik. Az 1. pozíció sugárvédelmi, 2 × 0,5 mm
  ólombetétes ajtólapra és extra erős pántolásra utal, ezért külön felmérői
  hitelesítést igényel.
- Karantén oka: a Sales-PDF maga írja, hogy a Thermofilm felületet később
  választja az ügyfél, a marási minta még pontosítandó, a kifelé/befelé nyíló
  ajtók magasságait össze kell hozni, és a kilincs sem végleges. Ezeket nem
  lehet DRAFT-ként sem stabil termékadatnak tekinteni.
- Határidő: a PDF `2026. szeptember eleje` várható szállítást ír;
  `Ütemterv.xlsx` `ADAT!D235` = `2026-09-03`, ami közel egyezik. A 2026-08-03-i
  RASO-tok-beépítési megjegyzés telepítési részfeladat, nem projekt-határidő.
- Javasolt feedback: `MISSING_SURVEY_MEASUREMENTS` (vastagság + sugárvédelmi
  szerkezet), `SOURCE_VALUE_CONFLICT` (felület/szín/marás függőben),
  `DEADLINE_CONFLICT` (részfeladat kontra rendelési határidő), valamint
  `SOURCE_LINK_AMBIGUOUS` (alaprajz csak ellenőrző bizonyíték).
- Következő biztonságos lépés: a végleges felmérés, felület/marás/kilincs és
  sugárvédelmi specifikáció lezárása után új, már nem `Előzetes` Sales-csomag
  alapján kell teljes import preview-t előállítani. Addig `ImportRun` és
  `doorstar_test`-be írás tiltott.

### 2026-07-29 14:40 — DSMR-26147 dokumentum-karantén

- Elvégzett munka: a `DSMR 2.pdf`, két DWG-változat, egy gyártásiméret-kép és
  két üres `teriték.pdf` csak olvasó vizsgálata alapján elkészült az
  `IMPORT_REVIEW_DSMR_26147.json` döntési artefakt. A `.bak` állományok
  kizárva maradtak.
- Döntés: nincs importálható ajtópozíció. A Sales-PDF egyetlen tételként
  „Falpanel ELEMEK ÚJRAGYÁRTÁSA”-t és „Felmérés szerinti kialakításban és
  méretekben” utalást tartalmaz; szélesség, magasság, vastagság, típus,
  nyitás és végleges kivitel nem adatolható belőle.
- Nyitott: a PDF 2026. augusztust mond, de kötelező ütemterv-határidő és a
  hivatkozott felmérés hiányzik. Ezért a csomaghoz csak későbbi dokumentum-
  referencia kapcsolható, Projekt/OrderPosition/ImportRun nem hozható létre.

### 2026-07-29 14:50 — falpanel mint önálló gyártási tétel

- Üzleti pontosítás rögzítve: a falpanel nem csak az ajtó `wallTreatment`
  attribútuma. Önálló, kereshető, dokumentálható és később ütemezhető gyártási
  tétel, akár kapcsolódó ajtópozíció nélkül is.
- A `DSMR-26147` korábbi dokumentum-karanténja ezért átminősült
  `REVIEW_WALL_PANEL_WORK_WITHOUT_DOOR_POSITIONS` állapotúvá. A Sales-PDF-ből
  egy `WallPanelCandidate` került rögzítésre: `REMANUFACTURE`, mennyiség 1,
  `2009-211-SB1A / ZINK` felületjelölt; méret és végleges szerkezet a
  felmérésre vár. Ez nem ajtópozíció és nem is veszhet el szabad szöveges
  megjegyzésben.
- A mapping és tárolási terv `WallPanel` + `WallPanelEvidence` modellt javasol:
  saját mennyiség, szélesség × magasság × vastagság, felület, új/újragyártás
  jelleg, opcionális ajtókapcsolat, valamint PDF/DWG/kép/felmérés
  oldalszintű bizonyíték. Addig az előnézetben `ImportCandidate` payloadként
  marad, és nem kerül adatbázisba.
- Ellenőrzés: a módosított 26147 JSON smoke check zöld. A `.bak` fájlok továbbra
  is kizártak; a DWG és a gyártási méretkép csak relatív dokumentumhivatkozás
  és felmérési bizonyíték lehet.

### 2026-07-29 15:00 — bútorfrontok felvéve az importdomainbe

- Üzleti szabály rögzítve: a bútorfront (`front`, `fiókelő`, `bútorajtó`) is
  önálló gyártási tétel. Nem modellezhető `OrderPosition` ajtóként, mert nincs
  falnyílás/nyitásirány szemantikája, viszont saját mennyiség, szélesség ×
  magasság × vastagság, korpusz/helyiség kapcsolat, anyag, kétoldali felület,
  élzárás, fogantyú-/pántfurat és marás lehet rajta.
- Javasolt inkrementális tárolás: a meglévő ajtó-specifikus `OrderPosition`
  változatlan marad; új `ManufacturedItem` jön `WALL_PANEL` és
  `FURNITURE_FRONT` kinddal, saját `ManufacturedItemEvidence` provenance-szal.
  Bútorfronthoz külön felület-, él- és megmunkálás-részletek tartoznak.
- A keyword-alapú felismerés csak jelöltet képez. Frontadat kizárólag emberi
  review után válik gyártási adattá; a PDF/DWG/XLSM hivatkozás továbbra is
  relatív útvonal + hash + oldal/sor formában marad.
- Webapp-hasznosítás: egy Projektben a `Tételek` nézet külön szűrővel mutassa
  az ajtókat, falpaneleket és frontokat; a hatlépcsős gyártási táblán mindegyik
  saját munkadarab/mennyiség legyen. A dokumentum- és felmérésnézet ugyanazt
  a forrásbizonyítékot tudja megnyitni, de nem írja felül a hitelesített
  műszaki adatot.

### 2026-07-29 15:20 — DSMR-26148 kontrollált tesztfeltöltés

- Elvégzett munka: a felhasználói feltöltési engedély alapján a
  `IMPORT_PREVIEW_DSMR_26148.json` egyszer, tranzakcióban alkalmazva lett a
  helyi `doorstar_test` sémában. Import-futás azonosító:
  `cms61wetp0000j0h80few7xkr`; státusza `APPLIED`. A `public` séma használatát
  explicit kapcsolat-ellenőrzés blokkolta, így éles/public adatbázis nem
  érintett.
- Rögzített DRAFT: új `DSMR-26148` Projekt, első revízió `SURVEY_PENDING`
  állapotban, két 840 × 2 150 mm-es Tapéta/TUT pozíció (`Bal ki`, `Jobb ki`),
  egy hash-elt, relatív Sales-PDF hivatkozás. A forrás-PDF sem másolva, sem
  módosítva nem lett.
- Nyitott review a rendszerben: négy `OPEN` feedback készült —
  `MISSING_SURVEY_MEASUREMENTS` (vastagság), `SOURCE_VALUE_CONFLICT`
  (RAL/NCS nem végleges), `DEADLINE_CONFLICT` (Sales időablak vs.
  `ADAT!D234`), `SOURCE_LINK_AMBIGUOUS` (hibás Aelan/26148 sor).
- Visszaolvasási ellenőrzés: kizárólag `doorstar_test` kapcsolaton a Projekt,
  `SURVEY_PENDING` állapot, 2 pozíció, 1 dokumentum, 4 nyitott feedback és
  `APPLIED` importfutás együtt igazolva. Jóváhagyás, gyártási kiadás és
  forrásfájl-módosítás nem történt.

### 2026-07-29 15:35 — DSMR-25171 falpanel- és bútorfront-kutatás

- Elvégzett munka: az előzetes mérési csomag jellegrajzai alapján elkészült az
  `IMPORT_REVIEW_DSMR_25171.json`. Egyetlen falpanelrajz `FP/1`–`FP/35`
  azonosítóval összesen 35 falpanel-jelöltet ad, explicit szélesség × magasság
  mm-adatokkal. A dokumentum bútorfront-jelöléseket is tartalmaz.
- Adatminőség: a 35 panel szélessége/magassága rögzíthető review-jelöltként,
  de panelvastagság, anyag, végleges felület/marás, helyiségkapcsolat és a
  helyszíni végleges méret hiányzik. A bútorfrontokra nincs külön méretlista,
  ezért csak `FurnitureFrontObservation`, nem gyártási tétel készült.
- Döntés: `QUARANTINE_PRELIMINARY_MEASUREMENTS`. A csomag címe és a PDF-ek
  is előzetes mérésekre utalnak, ezért nincs `doorstar_test` feltöltés.
  A falpanel- és frontadat megmarad kereshető forrásjelöltként; a későbbi
  végleges felméréshez/rajzhoz kapcsolható.
- Ellenőrzés: a JSON smoke check 35 panelt igazolt (`FP/1` 641 × 520 mm,
  `FP/35` 683 × 106 mm), és `databaseWrite: false` maradt. A CAD `.bak`
  változat kizárt; a DWG csak relatív dokumentumhivatkozás lehet.

### 2026-07-29 15:40 — folyamatos felderítési sorrend rögzítve

- A `DSMR-25171` 35 falpanel- és bútorfront-megfigyelése rögzített,
  karanténos forrásjelölt; nem veszik el az ajtópozíció-központú importban.
- A további feldolgozás minden új Sales-csomagnál ezt a sorrendet követi:
  dokumentumleltár → ajtó/falpanel/bútorfront jelöltek → `Ütemterv`
  összevetés → forrásbizonyíték + feedback → csak a megfelelően zárt DRAFT
  feltöltése a `doorstar_test` sémába.

### 2026-07-29 15:50 — 2026-os Kalkulátor-sablonhatás feltárva

- A `2026` archív 219 XLSX/XLSM munkafüzetében megtalálható a `falpanel`
  és/vagy `bútorfront` kifejezés. Ez nem 219 tényleges tételt jelent: a közös
  Kalkulátor-sablon minden projektben tartalmazza ezeket a mezőket.
- Következmény a feldolgozó szabályhoz: a kulcsszavas munkafüzet-találat csak
  `schema_evidence`, nem `ManufacturedItemCandidate`. Falpanel/front jelöltet
  kizárólag nem üres mennyiség + méret, vagy konkrét PDF/DWG/rajzi hivatkozás
  alapján szabad létrehozni; egyébként `NO_DATA` marad.
- A szűrés makrómentes OOXML shared-string olvasással futott; VBA, formula,
  Power Query és Excel alkalmazás nem indult el. Következő kutatási kör: a
  Kalkulátor tényleges adatot hordozó sorainak mintaalapú azonosítása, majd a
  jelölt-projektekre alkalmazott, adatérték-alapú kivonás.

### 2026-07-29 16:05 — újrafuttatható panel/front-felderítő script

- A további kutatáshoz elkészült és a Doorstar repóban tárolódik a
  `src/production-service/scripts/scanLegacyManufacturedItems.py` eszköz.
  XLSX/XLSM cache-értékeket olvas, a VBA-t csak jelenlétként jegyzi fel,
  makrót/formulát/Power Queryt nem futtat, adatbázishoz nem kapcsolódik.
- Kimenete géppel olvasható JSON: `ManufacturedItemEvidence` és kizárólag
  review-köteles `ManufacturedItemCandidate`, relatív forrásútvonallal,
  SHA-256-tal, munkalappal, sorral és nyers cache-cellákkal. Egy puszta
  sablonkulcsszó nem gyártási tétel.
- Bizonyíték: `legacyManufacturedItemScan.unit.test.ts` zöld. A teszt egy
  XLSM konténeren bizonyítja, hogy falpanel- és bútorfront-jelöltet kinyer,
  miközben a `vbaProject.bin` teljesen figyelmen kívül marad és a
  `databaseWrite: false` megmarad.

### 2026-07-29 16:20 — valós archív-futtatás a panel/front scannerrel

- A scanner első, 2026 januári próbafuttatása feltárta, hogy a puszta
  „kulcsszó + szám” szabály sablon- és paraméterlapokból túl sok jelöltet
  ad. A script ezért szigorítva lett: review-jelölt csak tétel-/készméretlapról
  jöhet; a változó/paraméterlapok kizárólag schema evidence-ek.
- Az ismételt, csak olvasó futás 26 munkafüzetből 1 877 schema evidence-et és
  690 review-jelöltet adott, 24 XLSM makrókonténert változatlanul ignorálva,
  8 `.bak` fájl kizárásával. A jelöltek megoszlása: 256 `Készméret -
  Falpanel`, 234 `Készméret - Bútorfront`, 148 `Készméretek`, valamint 46
  szabászati/kiegészítő lap. Ez már célzott kivonási kiindulópont, nem
  automatikus gyártási vagy adatbázis-import.
- Ellenőrzés: a scanner egységtesztje a szigorítás után is zöld. A futási JSON
  ideiglenes helyen maradt; üzleti dokumentumbináris és teljes üzleti
  kivonat nem került a repóba.

### 2026-07-29 16:35 — teljes 2026 panel/front evidence-felderítés

- A tárolt scanner a teljes `2026` archívon 223 XLSX/XLSM munkafüzetet
  dolgozott fel, kizárólag cached OOXML-értékekkel. Eredmény: 13 324
  schema evidence, 4 944 review-jelölt, 215 figyelmen kívül hagyott
  makrókonténer, valamint 56 `.bak`, 3 `.dwl` és 3 `.dwl2` kizárás.
  Adatbázisírás nem történt.
- A review-jelöltek forrásbizonyítékok, nem deduplikált gyártási darabszámok:
  ugyanaz a tétel előfordulhat Kalkulátor-, készméret- és szabászati lapon.
  Következő fejlesztési/kutatási feladat a dokumentumon belüli és projekten
  belüli deduplikáció, valamint a konkrét mennyiség-/méretoszlopok mappingje.
- Prioritásra alkalmas csomagok a legtöbb panel/front bizonyítékkal:
  `25219 Swiss Luxury Kft.` (249), `24170 Koza Petra` (231; ebből 183 front),
  `25118 Propellant Kft.` (166), `25163 Megépít plusz Kft.` (143),
  `26137 In_Tuition Kft.` (137). Ezekből érdemes a következő, teljesen
  adatérték-alapú kivonási mintát kiválasztani.

### 2026-07-29 16:50 — DSMR-24170 front/panel értelmezési minta

- A `24170 – Koza Petra` gyártásmegrendelőben a tényleges tételszerkezet
  elkülöníthető: `Készméret - Bútorfront` lapon 57 kitöltött front-sor,
  ugyanennyi ismétlődik a Kalkulátorban és a Kiíróban. Ezek ugyanannak a
  forrássorozatnak nézetei, nem 171 külön front. A jövőbeli deduplikáció
  elsődleges forrása a gyártásmegrendelő, másodlagos ellenőrzése a Kalkulátor.
- A frontlap fejlécében a méret „cm-ben értendő”. Például az első sor cache
  értéke 39 × 77,5 cm, mennyiség 1, anyag EOL Mély MDF, vastagság 1,8 cm,
  fóliás felület és B-marás/R3 sarokkerekítés megjegyzés. Ez 390 × 775 × 18 mm
  *jelölt*, de mm-es termelési adattá csak explicit, naplózott konverzió után
  válhat.
- A `Készméret - Falpanel` lapon 40 kódolt falpanel-sor van, de a
  szélesség/hossz/darab cache-cellák üresek; ezek adatváró strukturális sorok,
  nem méret-importjelöltek. A Kiíró két szabászati lapján nyolc paneles
  hivatkozás található, de nincs a készméretlaphoz biztonságosan kapcsolható
  dimenziótábla.
- Scanner-fejlesztés: csak akkor képez `ManufacturedItemCandidate`-et, ha a
  tétel-/készméretlap explicit szélesség, hosszúság és darab mezőjében is van
  érték; az eredeti `cm`/`mm` mértékegységet `cachedMeasurementUnit` mezőben
  őrzi. Egységteszt zöld, a 24170-es célzott futás 171 forrásnézetet adott,
  amelyekből a jelenlegi értelmezés szerint 57 front-sor a valós elsődleges
  jelöltkészlet.

### 2026-07-29 17:00 — feldolgozási tapasztalatok és scriptek mentve

- Az ismételten használható tudás a `IMPORT_EXTRACTION_LESSONS.md` fájlban
  rögzítve: forrásbiztonság, egységkezelés, ajtó/panel/front szemantika,
  sablonhatás, duplikáció és a konkrét 24170/25171/26147/26151 példák.
- A repóban tartósan mentett scriptekhez külön `src/production-service/scripts/README.md`
  készült. Leírja a preview és panel/front scanner futtatását, kimenetét,
  biztonsági korlátait és a tesztparancsot.

### 2026-07-29 17:10 — import-discovery terminál tudástár

- Az adatfelderítő agent tartós működési tudása a
  `terminals/import-discovery/` mappában van: a `CLAUDE.md` a kötelező
  viselkedést és biztonsági határokat, a `memory.md` a megállapításokat és
  döntéseket, a `state.md` pedig a következő konkrét munkalépéseket rögzíti.
- Új adatfelderítési munkamenet elején ezt a három fájlt kell elolvasni, majd
  a releváns eredményt vissza kell vezetni ebbe a közös handoff naplóba.

### 2026-07-29 17:25 — DSMR-24170 deduplikált bútorfront-preview

- A 2026-os tényleges `24170 - Koza Petra` csomag öt munkafüzetének
  makrómentes cache-olvasása 898 bizonyítékot és 399 forrásnézetet adott. A
  négy XLSM makrókonténerként kimutatott, de VBA-futtatás nélkül maradt; egy
  `.bak`, egy `.dwl` és egy `.dwl2` állomány kizárásra került.
- A `Készméret - Bútorfront` a kijelölt elsődleges tétellista: 57 egyedi
  bútorfront-sor. A `IMPORT_PREVIEW_DSMR_24170.json` 57, kizárólag `REVIEW`
  rekordot tartalmaz; a Kalkulátor és a szabászati nézetek ismétléseit nem
  duplikálja gyártási tétellé.
- A preview címkézett cache-mezőket, relatív dokumentumhivatkozást,
  tartalomhash-t és `cm->mm` konverziót őriz. Első sor: 01-es front,
  EOL Mély MDF, 390 × 775 × 18 mm, 1 db, fóliás, B-marás/R3 megjegyzéssel.
  A 57 rekord csak emberi review után, egy konkrét DRAFT revízióhoz kötve
  küldhető a `ManufacturedItem` API-ba; a preview önmagában nem ír adatbázisba.

### 2026-07-29 — kereshető importbizonyíték API elkészült

- Az `ImportCandidate` és `OrderDeadlineObservation` már tartós, indexelt
  adatbázisrekord. A preview-fájl továbbra is megmarad változatlan
  forrásartefaktumként, de az alkalmazás a jelölteket és az ellentmondó
  határidőket külön is le tudja kérdezni.
- Biztonságos, kizárólag `doorstar_test` sémán engedélyezett író végpontok:
  `POST /api/production/import-runs/:importRunId/candidates` és
  `POST /api/production/import-runs/:importRunId/deadline-observations`.
  A feltöltött forrásútvonal relatív legyen; abszolút útvonal és `..` tiltott.
- Ellenőrző végpont:
  `GET /api/production/import-runs/:importRunId/evidence`. Az Import Inbox
  listája is mutatja a jelölt- és határidő-megfigyelés darabszámát.
- Egy határidő-megfigyelés soha nem módosítja automatikusan az
  `OrderRevision.expectedDelivery` értékét. Az eltérés `UNVERIFIED` vagy
  `REVIEW` állapotban marad, amíg ember nem oldja fel.
- Következő adatgyűjtési cél: `DSMR-26148`. Előbb a meglévő preview és
  forrás-hash alapján kell `ImportRun`-t regisztrálni, majd a soronkénti
  jelölteket és az `Ütemterv` dátumait ezen az API-n lehet rögzíteni. Az
  `apply-draft` csak külön emberi döntés után, egyszer és kizárólag a teszt
  sémában hívható.
- Ellenőrzés: teljes backend regresszió 19 tesztfájl / 76 teszt, backend és
  frontend production build zöld.

### 2026-07-29 — mezőszintű pozíció-bizonyíték elkészült

- Az `OrderPositionEvidence` egy konkrét ajtópozíció egy konkrét mezőjéhez
  tárolja a relatív forráshelyet, nyers értéket, normalizált jelöltet,
  bizonyosságot és review-állapotot. A jelölt soha nem írja át automatikusan
  a pozíció értékét.
- Létrehozás:
  `POST /api/production/production-orders/:projectKey/revisions/:revision/positions/:positionId/evidence`.
  Opcionálisan csak ugyanahhoz a revízióhoz tartozó `OrderDocument`
  kapcsolható. Új bizonyíték kizárólag DRAFT revízióhoz adható.
- Ellenőrzés:
  `PATCH /api/production/production-orders/:projectKey/revisions/:revision/positions/:positionId/evidence/:evidenceId`.
  Az `RESOLVED` és `REJECTED` állapothoz indoklás kötelező; jóváhagyott
  revízió bizonyítéka már nem módosítható.
- A felmérés mentése megőrzi a meglévő pozícióazonosítókat, ezért a korábban
  rögzített forrásbizonyíték nem vész el. Csak a ténylegesen eltávolított
  pozícióhoz tartozó bizonyíték törlődik kaszkáddal.
- Az irodai rendelési adatlap mezőnévvel, nyers → normalizált értékkel és
  forráshelyjel mutatja a bizonyítékokat; a műszaki szerepkör ugyanitt
  elfogadhatja vagy elutasíthatja őket.
- Ellenőrzés: 21 backend tesztfájl / 79 teszt, 2 frontend tesztfájl / 5
  teszt, frontend lint, backend és frontend build zöld. Az OpenAPI 62
  műveletet fed le drift nélkül. Világos/sötét asztali és 390 px-es mobil
  vizuális QA megtörtént.

### 2026-07-29 — falpanel és bútorfront önálló adatmodell

- A `ManufacturedItem` már külön kezeli a `WALL_PANEL` és
  `FURNITURE_FRONT` tételeket. Ezek nem `OrderPosition` rekordok, ezért nincs
  nyitásirányuk vagy falnyílás-méretük. Saját kód, név, darabszám,
  szélesség × magasság × vastagság, anyag, felület, szín, minta és
  munkajelleg tartozik hozzájuk.
- Létrehozás:
  `POST /api/production/production-orders/:projectKey/revisions/:revision/manufactured-items`.
  Legalább egy `ManufacturedItemEvidence` kötelező. Dokumentum, kapcsolt
  ajtópozíció és importjelölt csak ugyanahhoz a revízióhoz/importfutáshoz
  kapcsolható.
- Végleges review:
  `PATCH /api/production/production-orders/:projectKey/revisions/:revision/manufactured-items/:itemId/review`.
  A kimenet `VERIFIED` vagy `REJECTED`, kötelező indoklással; a végállapot
  nem nyitható vissza.
- Az ellenőrizetlen `CANDIDATE`/`REVIEW` tétel blokkolja a rendelés review
  kapuját. Az elfogadott és elutasított tétel is megmarad az auditban és
  bekerül a jóváhagyási hash-be; későbbi gyártási generálás csak a
  `VERIFIED` tételeket használhatja.
- A rendelési oldalon külön „Falpanelek és bútorfrontok” blokk mutatja a
  tételeket, méretet, anyagot, felületet, forrást és emberi döntést. Ez
  vizuálisan és szemantikailag elkülönül az ajtópozícióktól.
- A preview-kivonóból kikerült a már elavult
  `manufactured_item_api_not_implemented` hiba. A preview továbbra is csak
  `requires_human_review`, adatbázist és makrót nem futtat.
- Ellenőrzés: teljes backend regresszió 23 tesztfájl / 81 teszt; frontend
  2 tesztfájl / 5 teszt, lint és build zöld; OpenAPI 64 művelet teljes
  route-lefedettséggel. Asztali és 390 px-es mobil, világos/sötét vizuális QA
  zöld.

### 2026-07-29 17:45 — SharePoint `.iqy` dokumentum-metaadatok

- A `Fájlok_Módositás_dátuma.xlsx` SharePoint-lekérdezés `query` lapja hiteles
  szerveroldali `Módosítva`, `Módosította` és relatív SharePoint-útvonal mezőt
  ad. A helyi újraszinkronizálás fájlidejét nem használjuk.
- 9 297 forrássorból 2 974 `Mappa` és 468 kizárt `.bak/.dwl/.dwl2` sor után
  5 855 dokumentum-metadata rekord marad. 3 977 PDF/DWG/XLSX/XLSM potenciális
  import-dokumentum, az akkori egyszerű fájlnév-parserrel 292
  munkaszám-jelölttel. Ezt a későbbi, többes/gyenge számokat karanténozó
  felderítés váltotta le. A preview géppel olvasható:
  `IMPORT_PREVIEW_SHAREPOINT_DOCUMENT_METADATA.json`.
- A jelenlegi export nem tartalmaz `Létrehozva` vagy verziótörténet mezőt;
  ezért belőle csak utolsó dokumentummódosítás, nem rendelési vagy tényleges
  kiszállítási esemény képezhető. A `DSMR-24170` határidősorában a 2026-07-06
  kiadás és 2026-08-27 beütemezés 52 napos tervezési szakasz; a régi
  2024-12-01 vállalás halasztott projekt miatt nem átfutási mutató.

### 2026-07-29 18:05 — DSMR-25219 falpanel és kevert munkaszám-minta

- A `25219 - Swiss Luxury Kft` Sales gyártásmegrendelő `Készméret - Falpanel`
  lapja az elsődleges forrás: 56 deduplikált `FP_1`–`FP_56` falpanel-sor,
  cm-es szélesség/hosszúság/vastagság, darab, anyag, fóliás felület,
  Renolit Magnolia Supermatt Classic szín és rajz szerinti minta jelöléssel.
  A `IMPORT_PREVIEW_DSMR_25219_WALL_PANELS.json` mindet mm-re konvertált,
  relatív forrás- és hash-bizonyítékkal ellátott `REVIEW` rekordként őrzi.
- Az `Ütemterv` 25219-sora szerint gyártásra kiadva: 2026-03-30; tervezett és
  tényleges kiszállítás nincs kitöltve. A SharePoint-previewben 41 potenciális
  25219-dokumentum van, legutóbbi módosításuk 2026-03-31 10:14:44.
- A mappában 25159-es fájlok is vannak. A preview-szabály javítva: előbb a
  fájlnévben szereplő munkaszám, csak utána a mappa munkaszáma számít. Így a
  25159 külön új Project-jelölt marad; nem keveredik automatikusan 25219-be.
### 2026-07-29 18:20 — DSMR-25159 külön második ütem

- A 25219 mappájában talált, fájlnév szerint 25159-es dokumentumok külön
  megrendelést képeznek. A 25159 saját `Készméret - Falpanel` lapján 11
  strukturált falpanel-sor van; ezekből a
  `IMPORT_PREVIEW_DSMR_25159_WALL_PANELS.json` készült, kizárólag `REVIEW`
  rekordokkal.
- Az Ütemterv 25159-sora II. ütemként jelöli: gyártásra kiadás 2026-05-15,
  bútorfrontok leszállítása 2026-05-20 megjegyzésben, beütemezés 2026-06-09.
  A frontok leszállítása részszállítás, nem a két ajtó és falpanel teljes
  projektzárása. A jövőbeli `Delivery` rekordnak ezért részszállítási scope-ot
  és érintett gyártási tételeket kell tudnia tárolni.
### 2026-07-29 18:35 — ManufacturedItem API-szerződésre frissített preview-k

- A falpanel/bútorfront API és evidence-review folyamat elkészültéhez igazítva
  a három korábbi preview újragenerálva. `DSMR-24170`: 57 bútorfront;
  `DSMR-25219`: 56 falpanel; `DSMR-25159`: 11 falpanel. Mind a 124 rekord
  `apiReady`, `ManufacturedItemEvidence` listát tartalmaz és csak
  `requires_human_review` állapotban van.
- A preview-k továbbra sem írnak adatbázisba: nincs revízióazonosítójuk, ezért
  csak jóváhagyott DRAFT revízió mellett küldhetők a ManufacturedItem POST
  végpontra. A `manufactured_item_api_not_implemented` hiba megszűnt.
- Ellenőrzés: `manufacturedItemPreview.unit.test.ts` zöld; az újragenerált
  preview-kben 57/56/11 API-kész, 0 blokkolt rekord található.
### 2026-07-29 18:55 — DSMR-25118 Propellant adatminőségi karantén

- A 25118-as elsődleges gyártásmegrendelő makrót nem futtatva, cache-adatból
  olvasva ajtópozíció-bizonyítékot ad az `Alap adatok` lapon (például 06–08:
  falnyílás, típus, nyitásirány, falpanel/blende megjegyzések). A harmadik
  falnyílás-méret továbbra is falvastagság, nem ajtólap-vastagság.
- A fő `Készméret - Falpanel` és `Készméret - Bútorfront` lapokon a
  szélesség/hosszúság/darab cache-cellák üresek. A scanner 11 munkafüzetből
  168, főleg Kiíró- és archívismétlésből származó előfordulást lát, de ezekből
  nem jön létre API-kész gyártási tétel. A projekt panel/front importja
  `REVIEW` karanténban marad hiteles rajz vagy javított készméretlista nélkül.

### 2026-07-29 19:05 — Determinisztikus payload és böngészhető ImportRun

- Az explicit forráslapból készült gyártási tétel preview most már az aktuális
  ManufacturedItem POST-szerződés pontos `apiPayload` értékét adja. A
  `--work-kind` kötelező, ezért a rendszer nem találja ki a munka jellegét.
- A típus, kód, név, mennyiség és relatív forráshely kötelező. Hiányuk
  `apiReady: false` blokkot okoz; a teljes rekord mezőszintű evidence listája
  megmarad.
- Az Import Inbox futásai külön, read-only bizonyítékoldalon nyithatók meg:
  `/imports/:importRunId`. A mapping, fingerprint, jelölt payload, forráshely,
  hibák, határidő-megfigyelések és létrejött gyártási tétel kapcsolata látható.
- Nincs production cél, automatikus alkalmazás vagy tömeges elfogadás.
  Következő biztonságos lépés: idempotens uploader csak felülvizsgált READY
  jelöltekre és egy kiválasztott `doorstar_test` DRAFT revízióra.
- Ellenőrzés: backend 23/23 tesztfájl, 81/81 teszt; frontend 2/2 tesztfájl,
  5/5 teszt, lint és build; backend build; OpenAPI 64 művelet. A részletes
  oldalt asztali és 390 px-es mobil, világos és sötét módban ellenőriztük.

### 2026-07-29 19:35 — READY gyártási tételek kontrollált alkalmazása

- A `ManufacturedItemImportPreview` jelöltekhez elkészült az idempotens
  alkalmazási végpont és a felületi emberi kapu. A cél csak az ImportRunhoz
  tartozó `doorstar_test` DRAFT lehet.
- A kliens az exact fingerprintet és a felhasználó által egyenként kijelölt
  candidate ID-ket küldi. A szerver az eltárolt payloadot újravalidálja;
  REVIEW/BLOCKED/hibás/más típusú rekord miatt a teljes batch visszagördül.
- Ismételt kérés nem duplikál. A már kapcsolt ManufacturedItem `existing`
  eredményként tér vissza, az új tétel pedig `REVIEW` állapotú marad.
- A felület megerősítő szava `BETÖLTÖM`; nincs select-all, production cél,
  jóváhagyás, határidő-módosítás vagy gyártási feladatképzés.
- Következő adatgyűjtő/fejlesztő közös feladat: egy verziózott bulk
  regisztráló készítése, amely az elfogadott preview JSON rekordjait
  újraindíthatóan és fingerprint-azonosan rögzíti az Import Inboxba.
- Ellenőrzés: backend 23 fájl/82 teszt; frontend 3 fájl/6 teszt; lint és
  mindkét build; 65 OpenAPI művelet; szerepkörös, mobil és dark/light QA.
### 2026-07-29 19:20 — DSMR-25163 Megépít Plusz API-kész falpanel-minta

- A 25163 elsődleges `Készméret - Falpanel` lapja 24 kitöltött, deduplikált
  falpanel-sort tartalmaz. A `IMPORT_PREVIEW_DSMR_25163_WALL_PANELS.json`
  24 `apiReady`, de `REVIEW` rekordot ad evidence-szel, relatív forrásúttal,
  hash-sel és cm→mm konverzióval. Példa: 01-es panel 1200 × 2230 × 18 mm,
  EOL Mély MDF, fóliás, Stone Grey Suedette Matt, F6 minta.
- Ütemterv: korábbi vállalás 2026-02-28, gyártásmegrendelés 2026-04-17,
  gyártásra kiadás 2026-04-20, beütemezés 2026-07-21. A megjegyzés szerint
  már csak az íves falpanel hiányzik, minden más beépítve: ez részleges
  teljesítési állapot, nem teljes projektkiszállítás.
- SharePoint-metaadat: 44 potenciális dokumentum, legutóbbi módosítás
  2026-07-15 07:55:53. A 24 panel csak jóváhagyott DRAFT revízióhoz kötve
  hozható létre a ManufacturedItem API-ban; automatikus adatbázisírás nincs.

### 2026-07-29 19:35 — DSMR-26137 In_Tuition két tételcsoport és hiányzó ütemterv

- A fő `26137 - In_Tuition Kft - Gyartasmegrendelő.xlsm` csak cache-elt OOXML
  értékeiből, makrófuttatás nélkül került feldolgozásra. A primer készméretlapok
  18 falpanelt és 1 bútorfrontot tartalmaznak. Két külön preview készült:
  `IMPORT_PREVIEW_DSMR_26137_WALL_PANELS.json` (18) és
  `IMPORT_PREVIEW_DSMR_26137_FURNITURE_FRONTS.json` (1). Mindegyik `apiReady`,
  evidence-et, relatív forráshelyet, hash-t és cm→mm konverziót tartalmaz, de
  `REVIEW` marad: csak ember által jóváhagyott DRAFT revízióhoz küldhető.
- Példa: falpanel 01 = 105 × 2500 × 18 mm; a bútorfront = 409 × 2318 × 18 mm.
  A felület EOL Mély MDF / fóliás / Supermatt Kashmir; a rajzi és szerelési
  megjegyzés nem automatikus normalizált műszaki tény, hanem evidence.
- `Ütemterv.xlsx`-ben sem 26137 munkaszám, sem In_Tuition névváltozat nem
  található. Határidő, gyártásra kiadás, kiszállítás és beépítés ezért nincs
  importálva és nem következtethető ki.
- SharePoint lekérdezés: 16 potenciális `.pdf`/`.dwg`/`.xlsm` dokumentum;
  dokumentummódosítási tartomány 2026-06-01–2026-07-27, utóbbi a gyártásmegrendelő
  DWG. Ez kizárólag dokumentumverzió-bizonyíték, nem teljesítési dátum. Egy CAD
  `.bak` kizárva. Adatbázisírás nem történt.

### 2026-07-29 19:50 — DSMR-26145 Koroknai: sablonlista-karantén

- A fő `26145 - Koroknai Richárd - Gyartasmegrendelő.xlsm` makrómentesen,
  cache-elt értékekből olvasva két 40 soros készméret-sablont tartalmaz:
  `Egyedi Falpanel` és `Egyedi Bútorfront`. Azonosítható az EOL Mély MDF és
  18 mm sablonérték, de minden sorszámozott sorban üres a szélesség, hosszúság,
  darabszám, szín és felület. A Kiíróból látható 40+40 előfordulás ezek ismétlése,
  nem 80 igazolt gyártási tétel.
- `IMPORT_PREVIEW_DSMR_26145_EVIDENCE.json`: 4 munkafüzet, 395 schema-evidence,
  40 nem hitelesített tételjavaslat. Tétel-preview és adatbázisírás szándékosan
  nincs; hiteles készméretlista vagy rajz + emberi review kell.
- Ütemterv-sor: gyártásra kiadás 2026-06-29, beütemezés 2026-07-20, vállalt
  határidő 2026-07-31. A megjegyzés személyes átvételt és vevői saját beépítést
  mond, ezért ez nem tényleges teljes kiszállítás/beépítés esemény.
- SharePoint-metaadat: 14 potenciális PDF/XLSM dokumentum, módosítási tartomány
  2026-06-22–2026-06-29. Adatbázisírás nem történt.

### 2026-07-29 20:05 — DSMR-26135 Tormay: üres sablonok és határidő-ellentmondás

- A 26135 elsődleges gyártásmegrendelő XLSM cache-értékeiből (makrófuttatás
  nélkül) 40 falpanel-sablon és 39 bútorfront-sablon olvasható ki. Egyetlen sor
  sem tartalmaz együtt szélességet, hosszúságot és darabszámot. A scannerben
  megjelenő 80 jelölt két Kiíró-lap ismétlése; ezek nem bizonyítanak 80 gyártási
  tételt. `IMPORT_PREVIEW_DSMR_26135_EVIDENCE.json`: 4 munkafüzet, 438
  schema-evidence, 80 `UNVERIFIED` előfordulás; 1 CAD `.bak` kizárva.
- Tétel-preview és adatbázisírás nincs. Az EOL Mély MDF / 18 mm csak a sablon
  metaadata; hitelesített méretlista vagy rajz és emberi review nélkül nem
  hozható létre falpanel- vagy bútorfrontrekord.
- Ütemterv: gyártásmegrendelés 2026-06-03, gyártásra kiadás 2026-07-03,
  vállalt határidő 2026-07-15, beütemezés 2026-08-04. Az utóbbi 20 nappal későbbi:
  ezt határidő-ellentmondás / tervezési frissítésként kell review-zni, nem
  tényleges késésként vagy készrejelentésként.
- SharePoint-metaadat: 17 potenciális PDF/DWG/XLSM dokumentum, módosítási
  tartomány 2026-05-18–2026-07-03. Adatbázisírás nem történt.

### 2026-07-29 20:35 — GYÁRTÁSMEGRENDELÉS PDF elsődleges Sales-forrás

- Üzleti pontosítás: a `GYÁRTÁSMEGRENDELÉS` PDF a Sales → műhely átadási
  bizonylat. Ez minden csomag elsődleges beolvasási forrása; felmérés/CAD/XLSM
  csak utána ellenőrzi vagy véglegesíti a műszaki adatot.
- Új, újrahasználható `src/production-service/scripts/extractSalesOrderPdfPreview.py`:
  bundled Python `pdfplumber` PDF-táblázat-olvasást használ, csak preview JSON-t
  ír, sem makrót, sem API-t, sem adatbázist nem használ. Oldal/sor evidence,
  relatív útvonal és SHA-256 hash kerül a kimenetbe. Ellenőrző futás zöld:
  `databaseWrite:false`, `macroExecution:false`.
- 26135: a Sales-PDF 5 valódi ajtópozíciót ad, mindegyiknél falnyílás
  szélesség×magasság×falvastagság mm-re konvertálható, nyitásirány, típus,
  darabszám és tokoldali blende megtalálható. Harmadik méret = falvastagság,
  nem ajtólapvastagság. Két kiegészítő: 5 kilincsgarnitúra és 5 zártest.
- 26145: nincs ajtópozíció, de van 5 × 2,4 fm = 12 fm lábazati szegőléc,
  Thermofilm II / Supermatt Stone Grey, szállítás és beépítés nélkül. Nem
  falpanel/bútorfront; review-jelöltként megmarad.
- Nyitott fejlesztési eltérés: evidence-alapú `OrderSupplementaryItem` tároló
  kell kilincshez, zártesthez, lábazathoz, szegőléc- és más tartozékhoz. Addig
  ezek nem `OrderPosition` és nem `ManufacturedItem` rekordok.
### 2026-07-30 09:10 — Teljes Sales-PDF kötegelt index és módszertár

- Új `previewSalesOrderPdfBatch.py` az összes GYÁRTÁSMEGRENDELÉS PDF-et
  determinisztikusan, csak olvasással feldolgozza. Az eredmény:
  `IMPORT_PREVIEW_SALES_PDF_BATCH.json`.
- Lefedettség: 111 PDF (53 `01 - Megrendelés`, 58 `2026`), 604 ajtópozíció-
  jelölt, 244 kiegészítőtermék-jelölt, 0 olvasási hiba. A kimenet továbbra is
  `databaseWrite:false`, `macroExecution:false`; production/public adatbázis
  nem érintett.
- Dokumentumrendszerezés: 37 azonos SHA-256-tartalmú másolatcsoport és 50
  kanonikus numerikus munkaszám azonosítva. A szó szerinti munkaszámok száma 53.
- Review-kötelező változatcsoportok: `25163` / `25163 mód.`, `26119` /
  `26119 mód.`, `26125` / `26125 mód.`. A teljes forrásazonosító megmarad;
  a numerikus egyezés csak döntési jelzés, nem automatikus projekt- vagy
  revízió-összevonás.
- Új `IMPORT_METHODS.md`: Sales-PDF-first index, csak hibaeseti OCR, Sales ↔
  felmérés mezőszintű egyeztetés, készméret-sablon karantén, tartozék-lane,
  verzió/duplikátum klaszterezés, explicit eseményhatáridő és kontrollált
  `doorstar_test` import sorrendje.
### 2026-07-30 — Feldolgozási eljárás rögzítve

- Elkészült `IMPORT_PROCESS.md`: a források kötelező sorrendje, PDF-first
  Sales-feldolgozás, felmérési egyeztetés, készméret-karantén, tartozékok
  kezelése, verzió/duplikátum-review, határidő-szabályok, adatminőségi kapuk és
  kontrollált `doorstar_test` importlépések egy helyen szerepelnek.

### 2026-07-30 — Preview-validáció és CAD-metaadat teszt

- A teljes `IMPORT_PREVIEW_SALES_PDF_BATCH.json` validációja javítás után
  zöld: 0 hiba, 286 review-figyelmeztetés. A korábbi ellenőrzés 104 hiányzó
  pozíció-darabszámot hibának jelzett. A forrás megvizsgálása azt igazolta,
  hogy ezek valódi, hiányos Sales-PDF tételek, nem parserhiba. A validator
  ezért most `position_quantity_missing_or_unverified` review-figyelmeztetést
  ad; soha nem talál ki `1 db` értéket. Ugyanez vonatkozik a tartozék
  mennyiségére. Hiányzó név, hash, relatív hivatkozás vagy preview-biztonsági
  flag továbbra is blokkoló hiba.
- Elkészült a CAD-hivatkozások olvasási indexe:
  `IMPORT_PREVIEW_CAD_SALES_FOLDER.json`,
  `IMPORT_PREVIEW_CAD_LEGACY_2026.json` és az egyesített
  `IMPORT_PREVIEW_CAD_METADATA.json`. 83 rajz: 73 DWG, 10 DXF; 76
  fájlnév-alapú munkaszámjelölt, 73 ismert DWG-verzió, 3 azonos bináris
  tartalmú dokumentumcsoport. Mindegyik `REVIEW_REFERENCE`; adatbázisírás,
  makrófuttatás és geometria-kikövetkeztetés nem történt.
- Új, újrahasznosítható eszközök: `inspectCadReferences.py` (forrás-index)
  és `mergeCadReferencePreviews.py` (preview-összefűzés, duplikátum- és
  biztonsági ellenőrzés). A merge ellenőrzés Python-fordítással és valós
  kétforrásos futással sikeres volt.
- Teljes technikai ellenőrzés: `npm run build`, `npm run verify:openapi` és
  `npm test` sikeres. OpenAPI 3.1, 65 művelet, teljes route-lefedettség;
  24 tesztfájl / 86 teszt zöld. A tesztfutás futásonként elkülönített lokális
  `doorstar_test_vitest_*` sémát használt; `public`, production és a kézi
  import `doorstar_test` séma nem kapott importadatot.

### 2026-07-30 — DXF szöveges evidence próba

- Az új `previewDxfTextEvidence.py` a 10 2026-os DXF-et csak olvasta:
  291 TEXT/MTEXT/DIMENSION evidence, ebből 3 explicit DIMENSION érték. A
  kimenet `IMPORT_PREVIEW_DXF_TEXT_EVIDENCE.json`; minden rekord preview-only,
  relatív hivatkozású és emberi review-köteles.
- A 26116 üvegrajzban a DIMENSION entitások 2218, 373 és 5 értéket adnak, de
  nincs automatikusan bizonyított rajzi egység vagy termék-/pozíciókapcsolat.
  Ezek nem kerülnek méretmezőbe, amíg műszaki review nem igazolja őket.
- A `26114 - Gremlin_Club_Kft` mappában levő `21199_Keszi Zs_Mozgo oldal.dxf`
  fájlnév munkaszáma 21199, tehát a fájlnév és mappa ellentmond. Ez explicit
  dokumentum-link review, nem automatikus Project-hozzárendelés.
- A 26118-as DXF-ben a szöveg bizonyítékot ad a `DSMR 26118 bejárati ajtó
  panel`, `Titanium Metallic`, valamint 988/2085/2079 jelölésekre, de a
  szövegek rajzi kapcsolata és egysége nincs géppel igazolva. Csak egy
  felmérő/technikus által jóváhagyott entity-indexes kivonat lehet belőle
  végleges műszaki érték.

### 2026-07-30 — CAD-konverziós megőrzési szabály jóváhagyva

- A konverter az eredeti DWG/DXF-et kizárólag olvasható bemenetként kezeli.
  Nem írhatja felül, nem mentheti vissza, nem nevezheti át és nem mozgathatja a
  forrásállományt.
- A DXF-kimenet csak repositoryn és forrásmappákon kívüli ideiglenes
  munkamappába készülhet. Konverzió előtt és után az eredeti SHA-256 hash-t
  össze kell vetni; eltérés esetén a futás megáll.
- A repositoryban csak relatív hivatkozás, hash és review-evidence maradhat;
  eredeti üzleti CAD-bináris nem. Az ideiglenes DXF nem helyettesíti a forrást.

### 2026-07-30 — Sales-PDF → API DRAFT rögzítési előellenőrzés

- Új `preflightSalesPdfDraft.ts`: egy Sales-PDF preview-ból létrehozza a
  tényleges `apply-draft` API-payload preview-ját, majd a meglévő Zod
  szerződéssel ellenőrzi. Nem hoz létre `ImportRun`-t, nem hív API-t és nem
  kapcsolódik adatbázishoz.
- 26135 Tormay valós adatai: a kiválasztott Sales-PDF hash-e
  `20ff…79ad`; 5 pozícióval a payload `contractValid:true`. Két azonos
  tartalmú dokumentumhivatkozás van (Sales-folder + 2026-archív); a Sales
  forrás az elsődleges referencia. A kimenet:
  `IMPORT_PREVIEW_DSMR_26135_DRAFT_PREFLIGHT.json`.
- A szerződéses érvényesség ellenére az alkalmazás továbbra is tiltott:
  a várható szállítás csak `2026. július-augusztus` szabad szöveg, és mind az
  5 pozíció felmérési/műszaki review-t igényel. `databaseApplyAllowed:false`.
- Negatív teszt: 25129 esetén 3 különböző Sales-PDF SHA-256 van. A hash nélküli
  preflight helyesen elutasította a futást. Új szabály: eltérő tartalmú
  munkaszám-verzióból csak explicit, ember által kiválasztott
  `--document-sha256` után épülhet DRAFT preview.
- Evidence-rögzítési teszt: a 26135 5 pozíciójának mind az 50 mezőszintű
  Sales-evidence-e átment a Doorstar `createOrderPositionEvidenceSchema`
  ellenőrzésén (0 hiba). Lefedett mezők: kód, név, darabszám, típus,
  nyitásirány, falnyílás szélesség/magasság/falvastagság, blende és megjegyzés.
  Ezek a DRAFT létrehozása után, a visszakapott pozíció- és dokumentum-ID-val
  `REVIEW` állapotban rögzíthetők; automatikus műszaki jóváhagyás nincs.
- Utóellenőrzés: a teljes backend tesztcsomag zöld (25 tesztfájl, 88 teszt),
  beleértve az ImportRun, DRAFT, dokumentumhivatkozás, pozíció-evidence és
  önálló falpanel/bútorfront útvonalakat. A tesztfutás elkülönített
  `doorstar_test_vitest_*` sémát használt; üzleti import nem történt.

### 2026-07-30 — Felderítési visszacsatolás: PDF-layout és fejlécminőség

- A 26109 Luctor Sales-PDF vizuális és gépi összevetése parserhibát talált:
  a `pdfplumber` táblázatában a megnevezés után egy üres cella tolta el a
  mezőket. A dokumentum vizuálisan 80 × 216 × 11,5 cm, Bal be, Tokbanyíló,
  1 db; korábban ezek rossz mezőkbe kerültek. Az új szigorú
  `SHIFTED_AFTER_NAME` minta csak üres cella + három egymást követő számszerű
  falnyílásérték esetén tolja el a mappinget. A javított 26109 preview:
  800 × 2160 × 115 mm, Bal be, Tokbanyíló, 1 db; API DRAFT- és evidence-
  szerződés ellenőrzése zöld.
- A 26109 fejlécénél a gépi szövegösszefűzés ügyfélnév-, cím- és határidőhibát
  okozott. A biztonsági szabály most a szennyezett címet és a `Kelte` értéket
  `null`-on hagyja; nem tölt helyettesítő adatot. A telefonszám továbbra is
  hiányzó/review adat, noha a vizuális PDF-en látható.
- 26135 regressziós minta: 5 pozíció, minden falnyílásméret és mennyiség
  változatlanul helyes; `STANDARD` layout. A parserjavítás nem rontotta el a
  korábbi jó kivonatot.
- Teljes újraindex: 111 PDF, 604 pozíciójelölt, 244 tartozékjelölt, 0 olvasási
  hiba; 52 kanonikus munkaszámjelölt. 3 fájlnév-alapú munkaszám fallback és 3
  fejléc–útvonal konfliktus látszik, ezért review-kötelesek. A batch-validátor
  zöld: 0 blokkoló hiba, 256 review-figyelmeztetés (korábban 286).
- Új `rankSalesPdfImportReadiness.py` Sales-forrás-szintű queue: 15 technikai
  review-ra előkészíthető, 24 további review-t igénylő és 13 explicit
  PDF-revízióválasztást igénylő munkaszám. A legkisebb, Sales-PDF szempontból
  rendezett próbajelöltek: 25164 (2 pozíció), 26107 (3), 26135 (5). Ez nem
  importengedély: felmérés-, határidő- és CAD-egyeztetés kötelező marad.
- Nyitott eltérések: 25167-nél a PDF-fejléc `252167`, a fájlnév/mappa `25167`;
  26111-nél az ügyfélnévhez dokumentumazonosító került. Mindkettő blokkolja az
  automatikus törzsadatkapcsolást.

### 2026-07-30 — Frontend UI átadás

- A `terminals/frontend/inbox/2026-07-30-import-discovery-ui-handoff.md`
  rögzíti az Import Inbox, projektcsomag-review, dokumentumverzióválasztó,
  határidő-timeline, falpanel/front- és tartozék-lane, CAD-evidence és
  kontrollált `doorstar_test` DRAFT UX-javaslatát.
- Kiemelt viselkedési szabályok: új munkaszám = új Project; a `contractValid`
  nem jóváhagyás; bizonytalan érték `null` + review; relatív hivatkozás és
  evidence marad meg; `public`/production importválasztó nem jelenhet meg.

### 2026-07-30 — DSMR-25164 vizuális PDF-ellenőrzés és méretvédő korlát

- A Sales `GYÁRTÁSMEGRENDELÉS` első oldalának vizuális ellenőrzése szerint az
  Arador Kft. / Dr. Lukács László, DSMR-25164 dokumentumban két ajtópozíció
  van: `71 × 210 × 12,5 cm` és `76 × 210 × 12 cm`. A normalizált nyílásméretek
  rendre `710 × 2100 × 125 mm` és `760 × 2100 × 120 mm`.
- Feltárt parserjelenség: a `pdfplumber` az első szélesség celláját `7 1`
  értékként adta vissza. A parser kizárólag teljesen számjegyekből és
  szóközökből álló cellában fűzi újra a számjegyeket, ezért `7 1 → 71 cm`;
  tetszőleges szöveget vagy decimális értéket nem alakít át.
- Új, review-only minőségkapu: ajtónyílás szélesség 300–5000 mm, magasság
  1200–5000 mm, falvastagság 30–2000 mm. Tartományon kívüli érték warning és
  `REVIEW_REQUIRED`, nem technikai kész jelölt. Ez nem gyártási tűrés, csak
  import-előszűrés.
- Újraépített teljes Sales-preview: 111 PDF, 604 pozíciójelölt, 244
  kiegészítőtermék-jelölt, 0 olvasási hiba. Validáció: 0 blokkoló hiba, 288
  review-figyelmeztetés. A DSMR-25164 API-alakú DRAFT-preview-ja
  `contractValid:true` és `evidenceContractValid:true`, de
  `databaseApplyAllowed:false`; felmérés-, határidő- és CAD-egyeztetés továbbra
  is kötelező.
- Ellenőrző futások: két parser- és két readiness-unit teszt zöld. Sem
  production/public, sem `doorstar_test` üzleti import nem történt.

### 2026-07-30 — DSMR-25164 Ütemterv-egyeztetés

- Az új, cache-only `inspectDeadlineWorkNumber.py` a `03 - Határidők/
  Ütemterv.xlsx` `ADAT!151` sorát azonosította. A munkaszám Excelben nyers
  `25164` numerikus érték; az általános dátumkonverzió ezt hibásan
  `1968-11-22`-nek mutathatná. A munkaszám-oszlopban a diagnosztika ezért a
  nyers ötjegyű azonosítót őrzi meg.
- Rögzítendő deadline-megfigyelések: vállalt szállítási határidő `2025-12-01`,
  beütemezés `2025-12-08`, „gyártás-megrendelés feltéve” `2025-12-12`, valamint
  `december első fele` megjegyzés. A Sales PDF kelte `2025-10-20`, várható
  szállítás szövege csak `december`.
- A dátumok eltérő, részben egymásnak ellentmondó tervek/kommunikációs
  megfigyelések; nem igazolnak gyártási elkészülést, kiszállítást vagy
  beépítést. `OrderDeadlineObservation`-ként, saját forrásmezővel és
  `REVIEW` állapottal tárolandók; a revision `expectedDelivery` csak Sales
  döntése után tölthető.
- Preview: `IMPORT_REVIEW_DSMR_25164_DEADLINE_ROWS.json`. A három
  work-number-diagnosztikai unit teszt zöld; sem Excel, sem makró, sem
  adatbázis nem futott/íródott.

### 2026-07-30 — Záró ellenőrzés ezen felderítési körhöz

- `production-service` build zöld; OpenAPI 3.1 ellenőrzés: 68 művelet,
  teljes route-lefedettség; teljes backend Vitest: 27 fájl, 93 teszt zöld.
- A tesztfutás csak az egyszeri `doorstar_test_vitest_*` sémát használta. Nem
  történt `doorstar_test` üzleti import, és `public`/production séma sem volt
  importcél.

### 2026-07-30 — DSMR-26107 Pintér Mónika PDF- és határidő-ellenőrzés

- Vizuálisan ellenőrzött Sales-PDF: 3 ajtópozíció, rendre `750 × 2080 × 160`,
  `860 × 2100 × 130` és `860 × 2100 × 160 mm`; irány/típus/mennyiség az
  API-alakú DRAFT-preview-ban egyezik a lappal. `contractValid:true`,
  `evidenceContractValid:true`; továbbra is csak DRAFT/review, adatbázisírás
  nélkül.
- Dokumentumdátum-eltérés: a fejléc `2026-02-28`, a PDF-lábléc `2026-03-02`.
  A forrásként rögzített eltérést nem oldjuk fel géppel.
- `Ütemterv.xlsx` pontos kapcsolata `ADAT!147`, `WORK_NUMBER_EXACT`: vállalt
  `2026-04-30`, gyártásmegrendelés feltéve `2026-03-02`, beütemezve
  `2026-05-04`, megjegyzés „Fix az időpont. Jó lenne tartanunk.” A vállalt és
  az ütemezett nap között 4 nap van; ez tervezési/határidő-review, nem tényleges
  késés vagy teljesítés.
- Azonos ügyfélnév miatt `ADAT!64` és `Ütemterv!76` a régi 24158-as projektre
  mutat. Az optional szöveges fallback most `TEXT_FALLBACK` jelölést kap; csak
  `WORK_NUMBER_EXACT` lehet automatikus projektkapcsolat-jelölt.
- Új preview-k: `IMPORT_PREVIEW_DSMR_26107_DRAFT_PREFLIGHT.json` és
  `IMPORT_REVIEW_DSMR_26107_DEADLINE_ROWS.json`. A deadline-diagnosztika három
  unit tesztje zöld.

### 2026-07-30 — DSMR-26107 felmérés és XLSM-csomag egyeztetés

- A `Felmérés/Pintér_2026-02-27_Felmérés.jpg` vizuális ellenőrzése a három
  kézzel javított végleges falnyílást mutatja: `75 × 208 × 16`, `86 × 210 × 13`
  és `86 × 210 × 16 cm`. Ezek pontosan egyeznek a Sales PDF normalizált
  `750 × 2080 × 160`, `860 × 2100 × 130`, `860 × 2100 × 160 mm` értékeivel.
  A felmérés dátuma `2026-02-10`, várható szállítási szövege `2026. április`.
- A 26107-es 2026-csomag négy XLSM konténere csak cache-értékből futott át:
  437 falpanel/front schema-evidence (235 falpanel, 202 bútorfront kulcsszó),
  de 0 gyártási tételjelölt. Egyik sorban sincs a szükséges, felcímkézett
  szélesség + magasság + darabszám együtt; ezek Kiíró-sablonok, nem rendelési
  mennyiségek.
- Scanner-szigorítás: a kulcsszó vagy tetszőleges számszerű érték többé nem
  hoz létre `ManufacturedItemCandidate` rekordot. Csak egy strukturált
  méret/darabszám sor lehet review-jelölt. A célzott 2 teszt zöld.
- Preview: `IMPORT_PREVIEW_DSMR_26107_MANUFACTURED_ITEMS.json`; minden
  rekord preview-only, `databaseWrite:false`, `macroExecution:false`.

### 2026-07-30 — DSMR-26107 Gyártóilap műhelyspecifikáció

- A `Dokumentumok/26107 - 02 - Gyártóilap.pdf` 1. oldala három gyártási
  pozícióra bontott, vizuálisan ellenőrzött műhelylap. Az `FNY` méretek
  mindhárom esetben egyeznek a felmérés/Sales lánccal.
- Explicit `LAP` ajtólapméretek: 01 WC `683 × 2038 mm`; 02 Háló és 03 Fürdő
  `777 × 2050 mm`. Ezek a meglévő `OrderPosition.doorWidthMm` és
  `doorHeightMm` mezőkbe csak műszaki review után vihetők át; lapvastagságot a
  forrás nem címkéz egyértelműen, ezért `null` marad.
- BKM fix/mozgó és TOK komponensméretek is jelen vannak, de ezek nem
  falnyílás- és nem ajtólapmezők. A jelenlegi séma/evidence-enum nem tudja
  kereshetően, típusosan tárolni őket. Javasolt bővítés:
  `PositionManufacturingSpecification` (pozíció, komponenskulcs, dimenziók,
  forrásdokumentum/oldal, review állapot). Addig csak preview-evidence marad.
- Preview: `IMPORT_REVIEW_DSMR_26107_PRODUCTION_SHEET.json`, három pozíció,
  relatív hivatkozás, `databaseWrite:false`, `macroExecution:false`.

### 2026-07-30 — SharePoint metaadat-katalógus és mappaszimuláció

- A `Fájlok_Módositás_dátuma.xlsx` csak olvasható `.iqy`-exportjából újraépült
  a géppel olvasható, makrómentes metaadat-katalógus: 5 855 dokumentumrekord,
  2 974 exportált mappasor + 14 hiányzó levezetett ős, összesen 2 988 virtuális
  mappa és 3 977 potenciálisan releváns dokumentum. A gyenge ötjegyű
  termék/dekor/hash találatok karanténja után 271 erős DSMR/projektmappa
  csomagjelölt marad. A
  mapparekordok kereshető struktúraelemek, nem dokumentumimport-jelöltek.
- A szimuláció kizárólag relatív `sites/...` útvonalból állítja elő a virtuális
  folder/document/project-package rekordokat; `databaseWrite:false`,
  `macroExecution:false`, sem SharePoint-, sem üzleti dokumentumbináris-, sem
  adatbázis-művelet nincs benne. Kimenet:
  `IMPORT_PREVIEW_SHAREPOINT_CATALOG_SIMULATION.json`.
- 105 fájlnál egyetlen fájlnév-/útvonal-munkaszám ütközik, további 4 rekord
  több különböző számot tartalmaz. Együtt 109 `PROJECT_LINK_REVIEW`, ebből 76
  PDF/DWG/XLSX/XLSM. Összesen 1 512 egyértelmű azonosítás csak
  mappaútvonalból jön, ebből 515 releváns típusú; ez jelölt lehet, nem
  projekt-igazság.
- Élő integráció csak a forrásazonosítók (site/drive/item/parent ID,
  created/modified, user, eTag vagy verzió, folder/file facet), kijelölt
  olvasási jogosultság és emberi link-review után indulhat. A javasolt
  `SourceCatalog` / `SourceCatalogSyncRun` / `SourceCatalogCursor` /
  `SourceCatalogFolder` / `SourceCatalogDocument` /
  `SourceCatalogDocumentVersion` / `SourceCatalogProjectLink` modell elkülönül
  az elfogadott rendelési `OrderDocument`-től. Részletek:
  `SHAREPOINT_INTEGRATION_CONDITIONS.md`.
- QUALITY.md szerinti készítő–ellenőr kör után a preview fail-closed a csendes
  sorlevágásra, abszolút/traversal vagy duplikált dokumentumútra és a bemenet
  felülírására. A golden fingerprint
  `cc4c13d962a29dbcdc27651dd2b7ef0512e5a1489e3e32852055f900a6fea30f`,
  source snapshot key `spsnapshot_43e46abbdf1872e530dc`, transzformációs run
  key `spcatalog_974bb607bd9c693017d1`.
- Újrafelhasználható QA-kapu:
  `validateSharePointMetadataCatalog.py`; eredménye
  `IMPORT_REVIEW_SHAREPOINT_CATALOG_VALIDATION.json`, `errorCount:0`. A Python
  import-tool tesztek bekerültek a teljes Vitest regresszióba.
- P0 élő-integrációs blokk: a jelenlegi `X-Role` nem hitelesítés. Entra/OIDC,
  szerveroldali RBAC, tenant-admin által kijelölt read-only library scope és
  megnevezett üzleti reviewer nélkül nem indul Graph connector vagy katalógus
  API. ADR: `ADR-2026-07-30-sharepoint-readonly-source-catalog.md`.

### 2026-07-30 — DSMR-26107 átadás-átvételi forrás minősítése

- A `Dokumentumok/26107 - Beszerelés - Átadásátvételi.pdf` 2026-03-05-i
  előkészített sablon. Megrendelő és munkaszám van rajta, de a beépítési hely,
  tételmennyiségek, átvevő, dátum és átvételi aláírás üres.
- A nyomtatott „Kilincsezés / Finombeállítás / Vasalattakarózás / Takarítás:
  Kész” sorok önmagukban nem bizonyítanak beépítést vagy átvételt. Nincs belőle
  `DELIVERED`, `INSTALLED` vagy `COMPLETED` importesemény; a teljesítési
  státusz `UNKNOWN` marad, a dokumentum csak `OTHER` referenciaként kapcsolható.

### 2026-07-30 — SharePoint katalógus végső QUALITY/QA kapu

- A készítő–ellenőr kör maradék szerződésrését javítottuk:
  `sharePointMetadataRules.py` lett a közös, tiszta szabálykönyvtár. A preview
  és a szimulátor ugyanebből számolja a relevanciát, munkaszámfeloldást és erős
  csomagbizonyítékot; a szimulátor a nyers fájlnév/kiterjesztés/szülőút alapján
  újraszámol és eltérésnél fail-closed.
- Adverszáriális regresszió fedi a hamis JPG-relevanciát, a DSMR marker nélküli
  `FILENAME_DSMR` címkét és a nem kanonikus útvonalra adott `PROJECT_FOLDER`
  címkét. Az explicit DSMR fájlnév útvonal-konfliktusban is erős Sales-csomag
  evidence marad, de a projektkapcsolat kötelező `CONFLICT` review; puszta
  folder evidence konfliktusban nem csomagolható.
- A teljes forrásból megismételt három artifact byte-pontosan egyezik a
  goldennel; `spcatalog_974bb607bd9c693017d1`, validáció `errorCount:0`,
  a forráshash olvasás előtt/után egyezik. A tesztfuttatás izolált
  `doorstar_test_vitest_*` sémát használt és eltakarította.
- Záró bizonyíték: backend build zöld; OpenAPI 3.1, 78 művelet, teljes
  route-lefedettség; teljes backend Vitest 32 fájl / 98 teszt zöld. Nem történt
  SharePoint-írás, üzleti adatbázis-import, `public`/production sémaérintés vagy
  deploy.
- Nyitott P0 változatlan: élő connector/API csak valódi Entra/OIDC +
  szerveroldali RBAC, tenant-admin által kijelölt read-only library scope,
  perzisztens cursor/tombstone modell és megnevezett üzleti reviewer után.

### 2026-07-30 — Frontend exact-revision Kalkulátor source-contract fogadva

- Feldolgozott üzenet:
  `terminals/import-discovery/inbox/2026-07-30_007_frontend-component-workspace-source-contract.md`.
  A kész frontend munkatér:
  `/orders/:projectKey/revisions/:revision/calculator`.
- Az import és a frontend közös határa: a komponens `source` csak lineage.
  `ORDER_POSITION`, valamint csak `VERIFIED` `MANUFACTURED_ITEM` vagy
  `SUPPLEMENTARY_ITEM` hivatkozható; mennyiség, ajtó-/falnyílásméret, anyag,
  felület, szabászati méret vagy Excel/PDF képlet nem másolható át.
- A tárolási terv terminológiai driftje javítva: a stabil fizikai oldal
  `SIDE_A/SIDE_B`; a jelen lévő tokborítás profilfüggő szerepe külön
  `FIXED/ADJUSTABLE/OTHER/UNRESOLVED`. Egyikből sem következik a másik,
  pánt-/zároldal vagy handing.
- A jövőbeli RAG/profilrajz-javaslat kötelező lineage-e: pontos
  dokumentumverzió és relatív út, page/sheet/row/rajzi lokátor, nyers és
  normalizált érték, komponenskulcs-jelölt, calculator/BOM rule key + version,
  termékprofil + fingerprint, review state és resolution.
- Nyitott P0 pontosítva: a supplementary-item review már megköveteli minden
  evidence explicit `RESOLVED` állapotát, a manufactured-item review végpont
  viszont jelenleg evidence-összesítés nélkül is beállíthat `VERIFIED`
  állapotot. Import ezt nem tekintheti komponens-authoritynek a backend kapu és
  adverszáriális teszt elkészültéig. Jóváhagyott, verziózott Doorstar profil
  nélkül a RAG/profilrajz eredménye read-only candidate; `ComponentSnapshot`
  materializálását az exact-revision irodai review és a backend végzi.

### 2026-07-30 — Frontend komponens-evidence kapu visszaigazolva

- A frontend Kalkulátor most csak `VERIFIED` + legalább egy evidence + minden
  evidence `RESOLVED` feltétellel enged `MANUFACTURED_ITEM` forrást.
  `SOURCE_REVIEW` supplementary esetén ugyanez a nem üres/all-`RESOLVED`
  feltétel érvényes; kézi supplementary tételnél a `VERIFIED` állapot marad a
  kliensfeltétel.
- A küldő task jelentése szerint a teljes frontend suite 18 fájl / 52 teszt,
  lint és build zöld. Import-discovery célzottan újrafuttatta a
  `componentWorkspace.unit.test.ts` fájlt: 8/8 teszt zöld.
- Ez kliensoldali fail-closed védelem, nem backend authority. A manufactured
  review végpont P0-ja továbbra is nyitott: közvetlen API-kérés sem kerülheti
  meg az evidence-összesítést. A pontos blokk a backend inbox
  `2026-07-30_011_import-discovery-manufactured-evidence-gate.md` üzenetében
  szerepel.

### 2026-07-30 — Source-evidence teljes lánc és manufactured P0 lezárva

- Backend handoff feldolgozva:
  `terminals/import-discovery/inbox/2026-07-30_008_backend-manufactured-evidence-gate-closed.md`.
  Elkészült a role-protected, egyszeri manufactured evidence-review PATCH;
  final `RESOLVED/REJECTED`, resolution, reviewer és timestamp auditálódik.
- Manufactured parent csak legalább egy és minden soron teljes auditú
  `RESOLVED` evidence mellett lehet `VERIFIED`. A komponens-snapshot ezt
  külön újraellenőrzi, így közvetlen DB-művelettel hamisított `VERIFIED`
  forrás sem kerülhet át. Import-discovery célzott backend futása: 10/10 zöld.
- Frontend handoff feldolgozva:
  `terminals/import-discovery/inbox/2026-07-30_009_frontend-source-evidence-review-adoption.md`.
  Minden manufactured/supplementary evidence külön, egyszeri döntési UI-t kap;
  raw/normalized érték és locator read-only. Hiányos `RESOLVED` audit
  fail-closed marad a parent review, readiness és Component Workspace kapuban.
- Import-discovery célzott frontend futása: 6 fájl / 19 teszt zöld. A küldő
  task teljes eredménye: 21 fájl / 61 teszt, lint és build zöld. A backend
  handoff teljes eredménye: 34 fájl / 113 teszt, build és 80 műveletes OpenAPI
  zöld.
- Authority-határ: import/RAG rögzíthet relatív locatorral raw/normalizált
  candidate evidence-et és nyitott állapotot, de final state-et, resolutiont,
  reviewert vagy review-időpontot nem. Ezek kizárólag az auditált backend
  review műveletből származhatnak.
- A korábbi `MSG-DOORSTAR-BACKEND-011` P0 üzenet `RESOLVED`; ez a komponens-
  source evidence blokk lezárt állapota. A SharePoint Entra/OIDC P0 ettől
  függetlenül továbbra is nyitott.

### 2026-07-30 — Frontend teljes-revíziós source gate végleges átvétele

- A Kalkulátor readiness már a rendelési revízió teljes
  `manufacturedItems` és `supplementaryItems` parent-listájából készül, nem a
  kiválasztott vagy a komponens-payloadba került sorokból. Emiatt egy nyitott,
  de a payloadból kihagyott forrástétel is blokkolja a materializálást.
- Manufactured és `SOURCE_REVIEW` supplementary lineage csak backend által
  auditált, teljes `RESOLVED` evidence-döntéssel ready. Az import/RAG mezőiből
  továbbra sem képezhető final review-state, reviewer/idő metaadat vagy
  komponens-default.
- Import-discovery független teljes frontend ellenőrzése: Vitest 22 fájl /
  68 teszt zöld, TypeScript lint zöld, production build zöld. A külön
  QA-agent 5 releváns fájl / 19 teszttel nem talált P0/P1 logikai rést.
- Nyitott P2 tesztmélységi eltérés: nincs külön `ComponentWorkspacePage`
  DOM/API integrációs teszt, amely aggregált parent-blocker mellett a snapshot
  POST elmaradását bizonyítja. A tiszta kapufüggvény és a backend független
  újraellenőrzése miatt ez nem jelenlegi authority-megkerülés, és nem nyit új
  importoldali követelményt.
- Forrásdokumentum, adatbázis és deploy nem érintett; a SharePoint
  Entra/OIDC P0 továbbra is külön, nyitott kapu.

### 2026-07-30 — Frontend P2 route-/mutation-regresszió lezárva

- A korábbi `ComponentWorkspacePage` tesztmélységi eltérést az új, valós
  `/orders/:projectKey/revisions/:revision/calculator` route-on futó regresszió
  lezárta. A tesztben van használható `ORDER_POSITION`, érvényes approval hash,
  aktív profil és minden technikai függőség kész.
- Egy `VERIFIED` manufactured parent nyitott `REVIEW` evidence-e ennek ellenére
  aggregate blockert képez. A DOM `Gyártott 0/1` számlálót és a műszaki
  forrásaudit-linket mutatja, miközben a komponensszerkesztő és a
  materializáló gomb hiányzik; a create-mutation hívásszáma nulla.
- Import-discovery független teljes futása: Vitest 23 fájl / 69 teszt zöld,
  TypeScript lint zöld, production build zöld. A P2 lezárva, P0/P1
  komponens-source rés nincs, új importoldali kérés nem keletkezett.
- Külön, csak olvasó QA célzottan 1 fájl / 1 tesztet futtatott zölden; P0–P2
  funkcionális rés nem maradt. Nem blokkoló P3 teszt-robosztussági követés:
  a regresszió kézzel ismétli az App route-mintát, és nem assertálja külön,
  hogy az evidence az egyetlen blocker. A jelenlegi fixture/kód ezt teljesíti,
  az import-authority határt nem gyengíti.
- Forrásdokumentum, adatbázis és deploy nem érintett. A SharePoint
  Entra/OIDC P0 ettől függetlenül továbbra is nyitott.

### 2026-07-31 — Kontrollált Nexus RAG dry-run csomag review-ra átadva

- Elkészült a `docs/projects/doorstar-nexus-rag/` csomag. A
  `SOURCE_INVENTORY.json` 45 repository-forrást osztályoz: 30 `PROCESS`,
  9 `HUMAN_REVIEW`, 6 `EXCLUDE`; további 11 kizárt nyers/bináris/preview
  forrásosztályt rögzít. A leltár egésze `ragIndexable:false`.
- A kereshető jelölt réteg 6 kanonikus, ügyfél-, személy- és rendelésadat-
  mentes dokumentum: szerepkör/authority; rendeléstől gyártásig tartó folyamat;
  Doorstar-belső és faipari terminológia; dokumentumtípusok és forrásmezők;
  import/evidence/review; gyártási stage-, állapot- és dátumszemantika.
- Minden claim `VERIFIED`, `INFERENCE` vagy `OPEN` minősítésű, és inventory
  source ID + teljes SHA-256 + lokátor hivatkozást tartalmaz. Összesen 98
  claim, ebből 88 verified, 1 inference és 9 open.
- A verziózott `doorstar-rag-manifest.v1.json` kizárólag `doorstar` targetet,
  `dry-run` módot, `nexusWrite:false` és `chromaWrite:false` értéket enged. A
  dokumentumkulcs id + verzió + kanonikus hash + chunk-policy verzió SHA-256;
  azonos id/verzió eltérő tartalommal blokkol.
- A `RAG_EVAL_QUESTIONS.json` 35, forrás- és claim-elvárással ellátott
  ellenőrző kérdést tartalmaz. A determinisztikus chunk-policy H1–H3 és
  bekezdés alapú, legfeljebb 1600 karakterrel és átfedés nélkül.
- Újrahasználható offline ellenőrző:
  `scripts/prepareDoorstarNexusRag.py`; célzott Python unit teszt 12/12 zöld.
  A dry-run 6 dokumentum / 98 claim / 41 chunk / 35 eval, 0 hiba és 0 warning;
  ismételt futás bájtszinten azonos reportot adott.
- A validátor delimiter-, repository-root-, érzékeny-forrás-, output-overwrite-,
  hardlink/symlink- és eval-forrásparitási kapukat alkalmaz. Független
  adverszáriális QA: PASS, P0/P1 nincs; a locator szemantikai létezése emberi
  review marad.
- Teljes QA: backend build zöld; OpenAPI 3.1, 83 művelet, teljes
  route-lefedettség; teljes backend Vitest 39 fájl / 127 teszt, izolált
  `doorstar_test_vitest_*` sémával zöld.
- Nyitott review: Entra/OIDC és ACL authority; jóváhagyott DWG–DXF lánc; élő
  SharePoint connector; `Egyéb` állomás; teljes dátumtaxonómia runtime mezői;
  BKM/TOK profiljelentés; blende-osztályozás; nyitásirány-konvenció.
- **Leállási kapu:** `HUMAN_APPROVAL_REQUIRED — STOP`. Nexus-, ChromaDB-,
  production/public adatbázis- vagy deploymódosítás nem történt. A csomag
  betöltése csak külön emberi jóváhagyás és változatlan hash-ek mellett indulhat.

### 2026-07-31 — Faipari szakzsargon-audit és importalias-szótár

- Elkészült a kanonikus emberi és gépi terminológiai baseline:
  `docs/knowledge/domain/DOORSTAR_FAIPARI_TERMINOLOGIAI_SZOTAR_2026-07-31.md`
  és `docs/knowledge/domain/doorstar-faipari-terminology.v1.json`.
- A Doorstar üzleti adatút szakmailag megfelelő alapokra épül, de a faipari,
  belső, szoftveres és legacy szavakat külön kell kezelni. A JSON ezért
  `CANONICAL`, `DOORSTAR_LOCAL`, `SYSTEM_TERM`, `REVIEW`, `DEPRECATED`,
  valamint `ALLOW`, `ALIAS_ONLY`, `REVIEW_REQUIRED`, `FORBIDDEN` minősítést
  ad az import és keresés számára.
- Automatikusan kereshető alias maradhat többek között a DSMR, FNY, LAP,
  „mozgó borítás”, ajtószárny, front/frontlap és falpanel. A nyers érték,
  relatív forrásút és lokátor minden esetben megmarad.
- `BKM_FIX`, `BKM_MOVING`, `TOK`, `FixOldal`, `MozgoOldal` és `blende` pontos
  célmezője profil-/BOM-bizonyíték nélkül nem állapítható meg. Ezekből nem
  készül automatikusan tok-, oldal-, felület- vagy komponensadat.
- A fix/állítható tokborítási szerep nem azonos `SIDE_A/SIDE_B` fizikai
  oldallal, pánt-/zároldallal vagy handinggel. A `surface` nem teríthető szét
  automatikusan ajtólapra, tokra és borításokra.
- A falpanel és bútorfront külön gyártandó tétel; a `wallTreatment=WALL_PANEL`
  csak kapcsolódó igényjelzés. A blende külön, tisztázandó kiegészítő elem.
- A hatlépcsős modell Doorstar-makrofolyamat. A fúrás megmunkálás, a csiszolás
  jellemzően felület-előkészítés; a `KISZALLITASRA_MEGJELOLES` készre jelentés,
  nem tényleges kiszállítás/beépítés/teljesítés.
- Nyitott P1-ek a valós adat kiadása előtt: vállalt kontra várható dátum külön
  mező/szemantika; backend felmérési teljesség és UI egyezése; kétoldali
  ajtószerkezet backend-szerződése; falpanel-igény kontra gyártott panel;
  Sales átadódokumentum kontra gyártási kiadás; stage–állomás–művelet
  határának konszolidálása.
- Read-only MCP-bizonyíték erősíti a falnyílás-, tokmag-/állítható borítás-,
  falborítás-, bútorfront-, dokumentációs és műveletterv-fogalmakat. A blende
  és a BKM/TOK helyi jelentésére nem volt elégséges szakirodalmi találat, ezért
  a rendszer nem talál ki feloldást.
- Forrásdokumentum, adatbázis, éles/public séma és deploy nem érintett.

### 2026-07-30 — Frontend P3 közös route-szerződés lezárva

- A `src/uzemi-tabla-web/src/lib/componentWorkspaceRoute.ts` adja a
  Kalkulátor route-mintáját és URL-builderét. Az App route-regisztrációja, az
  OrderDetailPage, a ProjectProcessOverview és a ComponentWorkspacePage
  regresszió ezt használja; más calculator route-literal nincs a frontend
  forrásban.
- A page-regresszió a névvel azonosított blocker-régióban pontosan egy
  listaelemet követel, és az egyetlen elem az evidence-audit hiányát nevezi
  meg. Ezzel külön bizonyított, hogy a revízió, approval hash, profil,
  jogosultság és technikai függőségek készek.
- Import-discovery független teljes futása: Vitest 23 fájl / 69 teszt zöld,
  TypeScript lint zöld, production build zöld. P0–P3 rés nem maradt; új
  importoldali kérés nem keletkezett. Külön, csak olvasó QA célzott futása
  1 fájl / 1 teszt zöld; a teljes frontend forráskeresés sem talált
  calculator route-duplikációt a közös helperen kívül.
- Forrásdokumentum, adatbázis és deploy nem érintett. A SharePoint
  Entra/OIDC P0 ettől függetlenül továbbra is nyitott.

### 2026-08-01 — Kanonikus Doorstar RAG v1 alkalmazva, retrieval-v1.1 nyitva

- A projektgazda explicit engedélyével a változatlan
  `doorstar-controlled-knowledge-rag@1.0.0` csomag bekerült a kizárólagos
  `doorstar` / `doorstar-knowledge` célba. Exact csere: 41 új kanonikus chunk,
  23 előre azonosított legacy chunk törlése; count `1998 → 2039 → 2016`.
- A 1975 nem célzott rekord teljes fingerprintje változatlan. Repositoryn
  kívüli, 0600 jogosultságú rollback-backup készült; az ismételt terv
  `SKIP_IDENTICAL`. Alkalmazásadatbázis, production/public séma és Doorstar-
  deploy nem változott.
- A Doorstar Knowledge Service újraindítás után `health=ok`, 2016 dokumentumot
  lát. A hat elkülönített Doorstar Nexus-principal read-only smoke-ja 6/6 PASS,
  és mind visszaadta az új Project, illetve Sales/felmérés authority lényegét.
- Nyitott minőségi eltérés: a live 35 kérdéses, szűretlen top-10 eval csak
  13 dokumentum- és 1 teljes claim-egyezést adott. A v1 1600/0 mechanikus
  chunkolása 17/98 claim-sort kettévágott; 5 esetben az ID elszakadt az
  állítás szövegétől. A vegyes, 2016 rekordos korpusz további rangsorolási
  hígítást okoz.
- A v1.0 alkalmazási integritása PASS, ezért nem gördült vissza és nem írható
  át helyben. A javítás külön `1.1.0` dry-run: állítássor-határt őrző claim-
  chunkok, exact claim→chunk megfeleltetés, package-filterelt retrieval-eval,
  valamint külön szűretlen island/MCP smoke.
- A v1.1 package hash, report és exact migrációs ID-halmaz új emberi review és
  jóváhagyás nélkül nem kerülhet Nexusba vagy ChromaDB-be.
- Tartalommentes audit:
  `docs/projects/doorstar-nexus-rag-execution/LIVE_APPLY_2026-08-01.json`,
  `LIVE_EVAL_2026-08-01.json`, `LIVE_SMOKE_2026-08-01.json`.

### 2026-08-01 — RAG v1.1 claim-lineage dry-run és quality hold

- A v1.0 négy befagyasztott pinje változatlan. Külön v1.1 manifest, inventory,
  eval és dry-run report készült; package hash
  `237dcdf5be94131ae9d5be0dc9062d757896b7b11693c37198323db43db68e16`.
- A `markdown_claim_rows/v2` policy 98 teljes, egyedi claim chunkot és 6
  claim-táblát nem tartalmazó overview chunkot képez. Claim-sor nem darabolható,
  1600 karakter felett fail-closed. A report 6 dokumentum / 98 claim / 104
  chunk / 35 explicit ALL/ANY eval, 0 hiba és 0 warning.
- Az élő v1 apply-receipthez kötött baseline exact 6 dokumentum / 41 chunk. A
  tartalommentes planner exact 41→104 cserét mutat, broad delete és DELETE
  action nélkül; payload nincs, minden write-proof hamis, státusz
  `HUMAN_APPROVAL_REQUIRED`.
- Offline, auditált MiniLM package-only mérés: @5 dokumentum recall 29/36 és
  claim recall 25/61; @10 32/36 és 30/61; @20 34/36 és 34/61. A szigorú,
  all-or-nothing teljes claim-match rendre 14/35, 17/35 és 18/35. A
  claim→chunk/citation mapping 98/98, az elvárt forrás-lineage 35/35.
- Döntés: `HOLD_FOR_RETRIEVAL_TUNING`. A v1.1 strukturális javítása jó, de a
  flat retrieval még nem elég megbízható több-claim kérdésekhez. Következő
  jelölt a dokumentum-/témaszintű első retrieval és a claim-szintű második
  retrieval, előre jóváhagyott @5/@10/@20 küszöbbel; eval-overfitting tilos.
- A független QA három P2 hardeninget talált és a javítás után újra auditált:
  write-enabled manifest elutasítása; live baseline nyers report-hash pin;
  duplikált JSON-kulcsok fail-closed kezelése. Re-audit PASS, P0–P2 nem maradt,
  a releváns Python fókusztesztek 67/67, a Nexus evaluator 9/9 zöld.
- Review-artefaktumok:
  `docs/projects/doorstar-nexus-rag/RAG_REVIEW_REPORT.v1.1.md`,
  `CANDIDATE_EVAL_SUMMARY.v1.1.0.json`,
  `DRY_RUN_REPORT.v1.1.0.json`, valamint
  `docs/projects/doorstar-nexus-rag-execution/PACKAGE_BASELINE.live-v1.0.json`.
- Nexus-, ChromaDB-, alkalmazásadatbázis-, production/public séma- vagy
  deploymódosítás nem történt. Új élő írás csak külön, explicit emberi
  jóváhagyással kezdhető.
