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
  import-dokumentum, 292 munkaszám-jelölttel. A preview géppel olvasható:
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
