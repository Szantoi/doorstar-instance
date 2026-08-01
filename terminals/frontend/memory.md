# Frontend memória

## Projektmunkatér UX — 2026-07-30

- A `/projects` nem második projektállapotgépet tárol: a meglévő
  `ProjectCard` és `ProductionOrderCard` rekordokból, `projectKey` alapján
  levezeti a figyelmet kérő, tervezésre váró, gyártás alatt lévő,
  kiszállítható és munkamenet nélküli nézetet.
- A kiemelt akció adatkapu-első: `SURVEY_PENDING` projekt a felméréshez megy,
  a `TECHNICAL_PREPARATION` projekt a saját műszaki munkatérhez, a
  jóváhagyott, terv nélküli projekt pedig a folyamatcockpithez. Ez a
  `src/uzemi-tabla-web/src/lib/projectWorkspace.ts` tiszta, unit tesztelt
  modellben él.
- Projekt-munkamenetet átmenetileg `production_planner`, `administrator` és
  kompatibilitási okból `vezeto` szerkeszthet. Ez csak a jelenlegi kliensoldali
  UX-védőháló; a jövőbeli valós autentikáció szerveroldali enforcementje
  továbbra is szükséges.
- A projektlista 390 px szélességen vizuálisan ellenőrzött. Az élő API nélküli
  helyi ellenőrzésnél a betöltési/hibaállapot látszott; élő, importált
  projektkártyát nem hoztunk létre tesztadatként.
- Legutóbbi ellenőrzés: `npm run test` (21 teszt), `npm run lint`,
  `npm run build` zöld.

## Import review kézfogás — 2026-07-30

- Backend és import-discovery ajánlások alapján az Import Inbox kommunikációja
  explicit: a `READY` jelölt csak review után jelölhető ki teszt-DRAFT-hoz;
  nem jelent jóváhagyást, kiadást vagy éles importot.
- A frontend azonnal megjeleníti a meglévő ImportRun-fingerprintet,
  mapping-verziót, jelölt- és határidőmegfigyelés-számot, kapcsolt DRAFT-ot
  és evidence drill-downt. Tesztséma-határ: kizárólag `doorstar_test`.
- A backendnek elküldött későbbi szerződésigények: munkaszám-alapú, lapozható
  review-projekció explicit állapotokkal; mezőszintű Sales–felmérés–határidő–CAD
  evidence; `OrderSupplementaryItem` szerződés. A frontend ezeket nem találja
  ki és nem vezeti le fájlmetaadatból.

## Felmérési munkatér — 2026-07-30

- A felmérés bal oldali, pozíciószintű navigációt és egyetlen részletes
  szerkesztőt kapott, ezért több ajtópozíciónál nem kell egy hosszú űrlapon
  keresni.
- A kötelező adatok hiánya tiszta, unit tesztelt szabályból jön. Hiányzó
  értékhez nincs kliensoldali alapérték vagy automatikus forrás-átvétel.
- A kiválasztott pozíció alatt megjelenik a meglévő evidence: mező, nyers
  érték, relatív dokumentumhivatkozás, page/sheet/row és review-állapot.

## Jóváhagyás előtti review — 2026-07-30

- A REVIEW állapotban lévő munkalap külön, látható ellenőrzési összesítőt
  kap. Ez a dokumentumok, ajtópozíciók, visszajelzések, mezőszintű evidence
  és gyártási tétel-review aktuális állapotát mutatja, nem hoz létre új
  workflow-állapotot.
- A jóváhagyás gomb addig zárolt, amíg bármelyik explicit teendő nyitott,
  illetve amíg a visszajelzések listája nem tölthető be. A szerveroldali
  jóváhagyási kapu ettől függetlenül továbbra is az authority.
- A számlálás tiszta, unit tesztelt modellben:
  `src/uzemi-tabla-web/src/lib/orderReviewReadiness.ts`.

## Irodai / üzemi UI-határ javítása — 2026-07-30

- A `/projects/:key` most kizárólag irodai projektcockpit: törzsadat,
  rendelési revízió, a teljes Doorstar-folyamat kapui, blokkolók és a
  következő munkatér. Nem tartalmaz epik/task kiadási szerkesztőt.
- A régi epik/task- és mennyiségi szerkesztő külön
  `/projects/:key/work-session` útvonalon maradt, „örökölt munkalap” és
  „nem kiadási forrás” jelöléssel. A közvetlen kiadás fail-closed, amíg nincs
  immutable `IssuedWorkPackage` backend-authority.
- A filctábla saját vizuális nyelve kizárólag a `/board`, `/kanban` és
  `/load` üzemi útvonalakon marad.

## Műszaki előkészítés és tartozék-sáv — 2026-07-30

- Új `/orders/:projectKey/technical-preparation` munkatér választja el a
  felmért tényadatokat az anyag-, vasalat-, megmunkálás- és műszaki
  döntésektől. A felmérési snapshot itt csak olvasható.
- Az `OrderSupplementaryItem` külön sáv: Sales kézi tartozékot rögzíthet a
  sales piszkozatban, műszaki szerepkör review-zhatja, a jóváhagyó pedig
  read-only módon látja a tételeket, forrásokat és döntést.
- Forrásos tartozék elfogadása kliensoldalon is zárolt, amíg minden evidence
  nem `RESOLVED`. A backend ugyanilyen enforcement-igénye bekerült a
  `terminals/backend/inbox/2026-07-30_003_frontend-doorstar-workflow-contract.md`
  átadásba.
- A teljes revízió-`PUT` helper megőrzi a Sales fejlécet és a pozíció
  `notes` mezőjét. A query-refetch nem írja felül a még nem mentett műszaki
  szerkesztést. A párhuzamos böngészők lost-update védelméhez továbbra is
  backend ETag/verziótoken szükséges.

## Kattintható folyamat- és tételrészletek — 2026-07-30

- A projektcockpit hét kapuja valódi, billentyűzetről is elérhető gomb. Egy
  kapu megnyitja a felelőst, adatforrást, bizalmi szintet, szükséges adatokat
  és az adatgazda munkaterére vezető akciót; egyszerre egy részletező nyitott.
- A legacy műveleti sorok külön inspectorban mutatják az állomást, napot,
  mennyiséget, egységidőt, becsült terhelést, task- és problémaállapotot.
  Minden ilyen sor explicit segédprojekció, nem autoritatív műveleti terv.
- A frontend élőben fogyasztja a ComponentSnapshot listát és
  kalkulátorprofil-konfigurációt. VERIFIED csak approval-hash-, séma- és
  aktívprofil-egyezéssel jelent kész kaput.
- A rendelési adatlapon külön ComponentSnapshot panel mutatja a
  requirements-sorokat, kész- és szabászati méreteket, anyag/felületet és
  lineage-hasheket. REVIEW állapot nem kiadható; csak jóváhagyó/tervező/admin
  szerep dönthet, kötelező indoklással.
- Backend drilldown handoff:
  `terminals/backend/inbox/2026-07-30_004_frontend-process-drilldown-contract.md`.
- Legutóbbi ellenőrzés: 10 tesztfájl / 25 teszt, TypeScript lint és production
  build zöld; a projekt- és rendelési részletező futó böngészőben is
  ellenőrzött.

## Pozíció 360° és dokumentumverziók — 2026-07-30

- A rendelési revízió pozíciólistája master–detail irodai munkatér lett:
  széles nézetben bal oldali, görgethető regiszter és jobb oldali
  részletpanel, 1100 px alatt egymás alá rendezve. A részlet egy helyen
  kapcsolja össze a felmért tényeket, műszaki katalógusdöntéseket,
  mező-evidence-et, dokumentumverziókat, gyártási tételeket és
  `ComponentRequirement` származékokat.
- A részletező csak olvasási projekció. Szerkesztéshez a felmérési vagy
  műszaki adatgazda munkaterére vezet, és nem küld teljes pozíció-`PUT`
  műveletet.
- A dokumentumok `documentFamilyKey` szerint verziócsaládokba rendeződnek.
  Az előzménylánc, verzióazonosító, SHA-256, relatív útvonal, kapcsolt
  pozíciók és korábbi release-hivatkozások olvashatók. Új változat csak
  append-only `supersedesDocumentId` kapcsolattal készül.
- A közvetlen dokumentum–pozíció kapcsolat külön megerősítést kér, mert a
  jelenlegi backendhez nincs unlink végpont. Dokumentumkiadási gomb nincs:
  autoritatív `IssuedWorkPackage` nélkül ez továbbra is fail-closed.
- A projektlista és projektcockpit a rendeléslista/rendelésrészlet
  lekérdezési hibáját már nem értelmezi „nincs rendelés” állapotként. Csak a
  sikeres `200 null` válasz vagy a valódi 404 jelölhet rendelés nélküli
  kivételes útvonalat; 5xx vagy hálózati hiba fail-closed.
- Legutóbbi ellenőrzés: 12 tesztfájl / 27 teszt, TypeScript lint és production
  build zöld. A pozícióváltás, a keskeny master–detail töréspont, a
  dokumentumcsalád-nyitás és az új verzió űrlapja futó böngészőben is
  ellenőrzött.

## Felmérési piszkozatbiztonság — 2026-07-30

- A felmérés külön helyi dirty állapotot és pozíciónkénti „Nincs mentve”
  jelzést kapott. A pozícióváltás továbbra is azonnali és nem indít
  automatikus teljes revízió-`PUT` műveletet.
- A „Piszkozat mentése” csak a DRAFT revíziót írja; nem léptet adatkaput. A
  „Felmérés véglegesítése” előbb ment, majd külön kéréssel léptet
  `SURVEY_COMPLETED` állapotba. Ha a második kérés hibázik, a felület
  egyértelműen jelzi, hogy a piszkozat már megmaradt.
- Azonos `revision.id` háttér-refetch nem inicializálhatja újra a lokális
  pozíciókat. Új revízió továbbra is tiszta munkamenetet nyit.
- A `useUnsavedChangesGuard` data-routeres belső navigációt és
  `beforeunload` eseményt is véd. Sikeres véglegesítés explicit bypass után
  navigál.
- A Pozíció 360° adatgazda-linkje `?position=<id>` mélylinket használ; a
  felmérési és műszaki munkatér a lista betöltése után stabilan kiválasztja
  ezt a pozíciót.
- Legutóbbi ellenőrzés: 13 tesztfájl / 29 teszt, TypeScript lint és
  production build zöld. Élő böngészőben ellenőrizve: mélylink, dirty
  jelzés, maradás/elvetés navigációs ág és az elvetett adat szerveroldali
  változatlansága.

## Kétoldali ajtószerkezet és felületkiosztás — 2026-07-30

- A fizikai oldalak kanonikus kulcsa `SIDE_A` / `SIDE_B`. A felmérési,
  műszaki és Pozíció 360° nézet ezeket mutatja stabil oldalazonosítóként;
  helyiségkapcsolat, ajtólapfelület, tokborítás-jelenlét és -szerep jelenleg
  feloldatlan.
- A legacy `fix:` / `mozgó:` értékek kiosztatlan, szerepcímkés
  forrásjelöltek. Nem kerülnek automatikusan fizikai oldalhoz, ajtólaphoz,
  tokszerkezethez vagy tokborításhoz. A UI-kanonikus név
  **Állítható borítás**, a „mozgó” csak forrásalias.
- Az öt külön appearance-döntés — két ajtólapfelület, látható tokszerkezeti
  felület, fix borítás és állítható borítás — csak az igazolt, mindkét
  borítással rendelkező állítható átfogó tokprofilra érvényes. Más
  tokrendszernél egy borítás hiányozhat vagy más szerepű lehet. A tokmag külön
  gyártási komponens; hogy mely felülete látható, profilrajzos ellenőrzést
  igényel.
- A panel ezért két mindig alkalmazandó ajtólapfelületet, egyetlen absztrakt
  látható tokszerkezeti felületet és két feltételes tokborítás-célt mutat.
  Mindkét tokborítás `Jelenlét feloldatlan`, amíg a profil/evidence nem
  igazolja a `PRESENT` vagy `NOT_APPLICABLE` állapotot.
- A legacy `surface` parser kizárólag explicit `fix:`/`mozgó:` címkét választ
  szét szerepjelöltként; felismeri a `mobil` és `állítható` aliasokat is.
  Egyoldali értéknél nem találja ki a másik szerepet vagy fizikai oldalt,
  generikus értéket pedig egyik komponensre sem oszt ki.
- A korábbi `finishKey` választó read-only átmeneti mező lett. A Survey és
  Technical teljes revíziómentési payload szándékosan kihagyja a
  `finishKey`-t, mert a backend catalog projectionje különben felülírná az
  összevont `fix: ...; mozgó: ...` source értéket. Ezt külön unit teszt védi.
- A falnyílás most minden irodai nézetben csak szélesség × magasság. Az
  egyetlen `openingDepthMm` külön `Kész falvastagság · örökölt mérés`, és nem
  tokbeállítási tartomány. Az `openingDirection` felirata
  `Örökölt nyitásmegadás`; nem helyettesíti a handing, pántoldal és
  `opensIntoSide` strukturált mezőket.
- Műszaki review addig fail-closed, amíg nincs szerver-authoritatív
  `DoorStructureSpec`, effektív appearance lineage, ADJUSTABLE kompenzáció és
  readiness. A pontosított backend kézfogás:
  `terminals/backend/inbox/2026-07-30_008_frontend-door-axis-ui-adoption.md`.
- Az import-discovery külön mezőtérképet és tiltott automapping-listát kapott:
  `terminals/import-discovery/inbox/2026-07-30_005_frontend-door-axis-ui-adoption.md`.
  Az architekturális döntés:
  `docs/decisions/ADR-2026-07-30-two-sided-door-structure-appearance.md`.
- Legutóbbi ellenőrzés: 16 tesztfájl / 39 teszt, TypeScript lint és production
  build zöld. Futó böngészőben ellenőrizve a rendelési, felmérési és műszaki
  nézet, a pozícióváltás, a fail-closed review-blokkoló, a 390 px mobil
  elrendezés és a vízszintes túlcsordulás hiánya; konzolhiba nem volt.

## Utólag szerelhető ajtótok terminológiai baseline — 2026-07-30

- Elsődleges magyar, lengyel és német gyártói műszaki források, valamint az
  ISO/EN/DIN szabványhorgonyok alapján igazolt a tipikus szerkezet:
  `tokmag/tokbélés + fix tokborítás + horonyba illesztett állítható
  tokborítás`. A „mozgó” örökölt Doorstar-alias; UI-kanonikus név:
  **Állítható borítás**.
- Két stabil fizikai oldalt kell kezelni (`SIDE_A` / `SIDE_B`), opcionális
  helyiségreferenciával. Az ajtólap A/B felülete 1:1-ben ehhez a két oldalhoz
  kötődik. A borítás jelenléti állapota
  `UNRESOLVED/NOT_APPLICABLE/PRESENT`; csak a jelen lévő borítás kaphat
  `UNRESOLVED`, `FIXED`, `ADJUSTABLE` vagy más profilspecifikus szerepet. A
  pánt-/záróoszlop, a jobbos/balos oldalasság, a nyitási tér és a falckialakítás
  külön fogalom. `FIXED = HINGE_JAMB` nem globális szabály, csak verziózott
  termékprofil-validáció lehet.
- `Tokmag` külön gyártási komponens, nem a teljes `Tok` szinonimája.
  `Tokborítás` fizikai alkatrész; nem azonos a felületképzéssel. Falnyílás,
  tokmag külméret, szabad átjárás, falvastagsági tartomány és
  borításszélesség szintén külön fogalmak.
- Tartós baseline:
  `docs/knowledge/domain/DOORSTAR_ADJUSTABLE_INTERIOR_DOOR_TERMINOLOGY_2026-07-30.md`.
  Backend-pontosítás:
  `terminals/backend/inbox/2026-07-30_007_frontend-door-terminology-axis-contract.md`.
  Import-pontosítás:
  `terminals/import-discovery/inbox/2026-07-30_004_frontend-door-terminology-axis-evidence.md`.
- A baseline tudatosan nem általánosít gyártói milliméter-, habozási vagy
  rögzítési szabályt. A készülő szakirodalmi RAG fő feladata a Doorstar
  profilrajzok, BOM-határok, méretképletek, toleranciák és speciális
  tokrendszerek verziózott igazolása.

## Munkaszám-alapú Import Inbox — 2026-07-30

- Az `/imports` a backend `import-inbox` projekcióját használja, ezért egy
  kártya egy pontos `importRunId + workNumber` bizonyítékcsomag. A korábbi
  futásszintű oldal kompatibilitásként megmaradt.
- A listán minden backend-state, ready/review/blocked számláló, relatív
  forrásút, mappingprofil és fingerprint látszik. Az összesített
  candidate-számok explicit az aktuális oldalra vonatkoznak.
- Az `APPLIED_TO_TEST` kanonikus UI-felirata `Teszt-DRAFT létrejött`.
  Soha nem jelent kész, jóváhagyott vagy éles importot; a nyitott review és
  blocker mellette továbbra is látható.
- Az új `/imports/:importRunId/:workNumber` read-only oldal külön mutatja a
  normalizált mezőket, hibákat, forrásgyökeret, relatív útvonalat,
  sheet/page/row koordinátát és határidő-megfigyeléseket. Összetett payload
  lenyitható, így a teljes bizonyíték elérhető marad, de nem uralja a
  kártyát.
- `UNASSIGNED` route-sentinel megmarad; emberi felirata
  `Munkaszám nélkül`. A frontend nem vezet le üzleti állapotot
  fájlmetaadatból vagy evidence-ből.
- Backend handoff:
  `terminals/backend/inbox/2026-07-30_009_frontend-import-inbox-ui-adoption.md`.
  Import-discovery handoff:
  `terminals/import-discovery/inbox/2026-07-30_006_frontend-work-number-import-inbox-adoption.md`.
- Legutóbbi ellenőrzés: 17 tesztfájl / 44 teszt, TypeScript lint és
  production build zöld. A 26148 és 24181 élő csomagok, a csomagnavigáció,
  a strukturált részletek lenyitása, a 390 px mobil nézet és a vízszintes
  túlcsordulás hiánya böngészőben ellenőrzött; konzolhiba nem volt.

## Exact-revision komponens-/szabászati Kalkulátor — 2026-07-30

- Új route:
  `/orders/:projectKey/revisions/:revision/calculator`. A projektfolyamat
  `COMPONENTS` kapuja és az APPROVED rendelési adatlap erre a konkrét
  revízióra navigál.
- A munkatér három állapota: `BLOCKED`, helyi explicit sorösszeállítás és
  immutábilis snapshot-review. A szerkesztő csak legfrissebb, APPROVED,
  hash-igazolt revízió, aktív profil, elérhető függőségek és jogosult szerep
  mellett kerül a DOM-ba.
- Egy új komponenssor kizárólag lineage-kapcsolatot örököl. Név,
  source/component key, mennyiség, egység, anyag, felület, készméret és
  szabászati méret üres; a kliens nem másol forrásértéket és nem futtat
  képletet/defaultot.
- Külön gyártott tétel csak `VERIFIED` + legalább egy evidence + minden sor
  `RESOLVED` állapotban lehet forrás. `SOURCE_REVIEW` tartozéknál ugyanez az
  evidence-kapu érvényes. Ez kliensoldali fail-closed védelem a backend által
  már jelzett P0 evidence-rések mellett.
- `CUT_PART` sorhoz anyag és mindkét W×H×T mérethármas kötelező.
  `PURCHASED_PART` mérete opcionális, de részlegesen nem adható meg.
- A materializálás explicit megerősítést és review-megjegyzést kér.
  Ugyanazon profilverzió snapshotja nem írható felül vagy tölthető vissza
  szerkesztésre. Az új snapshot `REVIEW`, nem üzemi kiadás.
- Elavult REVIEW snapshot elfogadása zárolt, de jogosult reviewer a backend
  szerződésének megfelelően elutasítással lezárhatja.
- Backend handoff:
  `terminals/backend/inbox/2026-07-30_010_frontend-component-workspace-adoption.md`.
  Import handoff:
  `terminals/import-discovery/inbox/2026-07-30_007_frontend-component-workspace-source-contract.md`.
- Legutóbbi ellenőrzés: 18 tesztfájl / 52 teszt, TypeScript lint és
  production build zöld. Élő DSMR-24181 R1 DRAFT állapotban a fail-closed
  blokkolás, exact-revision projektlink, világos/sötét desktop és 390 px
  mobil elrendezés ellenőrzött; nincs vízszintes túlcsordulás vagy
  konzolhiba.

## Source-evidence döntési kapu — 2026-07-30

- A manufactured és supplementary source-evidence önálló, egyszer lezárható
  műszaki döntési felületet kapott. A forrásérték és locator nem írható; csak
  `RESOLVED` vagy `REJECTED` döntés és 3–2000 karakteres indok küldhető.
- A közös klienskapu teljes auditot követel:
  `reviewState === RESOLVED` + nem üres `resolution` + `reviewedByRole` +
  `reviewedAt`, továbbá a reviewer szerepe pontosan
  `technical_preparation | order_approver | administrator | vezeto`.
  A puszta RESOLVED címke, más szerep vagy hiányos legacy audit fail-closed
  marad.
- Manufactured parent csak legalább egy és minden soron teljes auditú
  evidence mellett lehet VERIFIED. SOURCE_REVIEW tartozéknál ugyanez;
  MANUAL tartozéknál nincs evidence-követelmény. A parent REJECTED ág
  nyitott evidence mellett is használható.
- A teljes audit-invariánst ugyanaz a helper használja a tételpaneleken,
  rendelési review-readinessben és a Component Workspace forráskapujában.
  A teljes revíziós komponenskapu a payloadból kihagyott manufactured és
  supplementary parent itemeket is számolja. `REJECTED` parent ready;
  a számlálás parent-item, nem evidence-sor alapú.
- A Kalkulátor a szerkesztő előtt mutatja a manufactured/supplementary
  kész/összes számlálót, lezáratlan tételnél blokkol és a műszaki
  előkészítés forrásauditjához vezet. A `REJECTED` snapshot-döntés továbbra
  is elérhető.
- A backend snapshot `component_source_evidence_unresolved` hibájának
  row-level és aggregate `details` alakja is opcionálisan, extra mezőkre
  toleránsan kap emberi magyarázatot. Mutation után a production-order
  read model siker és hiba esetén is frissül.
- A végleges evidence read-only auditnézete mutatja az indokot, létrehozó és
  reviewer szerepet, illetve az időpontot. Mobilon a döntési gombok 44 px
  érintési célok, a hosszú locatorok törhetnek.
- `OrderRevisionAudit` read model: `orderRevisionId`, verziózott
  `contentHashSchemaVersion`, valamint `SUPERSEDED` action. Az adatlap és a
  Kalkulátor `Hash vN` formában láthatóvá teszi a sémaverziót.
- Backend visszaigazolás:
  `terminals/backend/inbox/2026-07-30_012_frontend-source-evidence-gate-adoption.md`.
  Aggregate átvétel:
  `terminals/backend/inbox/2026-07-30_013_frontend-aggregate-component-source-gate-adoption.md`.
  A `_010` handoff snapshot-review művelete `POST` helyett `PATCH`-re
  javítva.
- A backend a `_013` két követését is lezárta: a conflict `details` ötágú
  OpenAPI `oneOf`, és külön integrációs ágpár igazolja ugyanazon karanténos
  APPROVED revízión a `VERIFIED → 409`, majd `REJECTED → 200` viselkedést.
  Célzott backend QA: 2 fájl / 11 teszt, build és OpenAPI 80 művelet zöld.
  A source-evidence backend–frontend kézfogás teljes.
- Az import-agent független QA-jának P2 tesztmélységi észrevételét külön
  `ComponentWorkspacePage` regresszió zárja: érvényes pozíció és minden más
  kész kapu mellett egy `VERIFIED`, de nyitott evidence-sorú manufactured
  parent megjeleníti az aggregate blockert, kizárja a szerkesztőt és a
  materializáló gombot a DOM-ból, a snapshot-mutation pedig nem indul.
- A kapcsolódó P3 robosztussági követés is lezárt: az App, a rendelési
  adatlap, a projektfolyamat és a teszt közös Kalkulátor-route
  mintát/path buildert használ. A teszt a blocker régió pontosan egy
  listaelemét is ellenőrzi, így bizonyítottan az evidence-audit az egyetlen
  zárolási ok.
- Legutóbbi ellenőrzés: 23 tesztfájl / 69 teszt, TypeScript lint és
  production build zöld. A lokális API 200-at ad, az asztali műszaki oldal
  dokumentumszinten nem csordul túl. A jelenlegi tesztrendelésekben nincs
  manufactured/supplementary evidence; ezért az új interakciót mesterséges
  adatmutáció nélkül célzott komponens-, kapu- és readiness-tesztek
  igazolják. A DSMR-24181 Kalkulátor új ötelemű kapusávja és blokkolt
  állapota desktopon és 390 px mobilnézetben is ellenőrzött; nincs
  dokumentumszintű vízszintes túlcsordulás vagy konzolhiba.

## Exact-revision Műveletterv handoff UI — 2026-07-31

- Új irodai route:
  `/orders/:projectKey/revisions/:revision/operations`. A Kalkulátor footer
  és a projektcockpit `OPERATIONS` kapuja ezt a közös path buildert használja.
  A `PLANNING` kapu többé nem navigál az örökölt munkalapra.
- A forráskapu csak legfrissebb APPROVED revízió, érvényes approval hash,
  aktuális snapshot-séma, aktív kalkulátorprofil, profil-fingerprint és
  műszaki katalógus-fingerprint mellett kész. REVIEW, REJECTED, stale
  hash/profil/séma/fingerprint és lekérdezési hiba fail-closed. A jelenlegi
  profil API még nem adja a két szükséges aktuális fingerprintet, ezért a UI
  ezek nélkül tudatosan zárva marad; a backendigény a `_014` handoffban van.
- A munkatér kattintható alkatrészbemenetet és teljes snapshot-lineage-et
  mutat. A csoportosítás kizárólag az explicit `requirementKind`; névből,
  anyagból vagy faipari RAG-találatból nem vezet le ajtóalkatrész-hierarchiát.
- A faipari korpusz alapján a terv külön kezeli a technológiai megmunkálást,
  a nem technológiai mozgatást/tárolást/ellenőrzést és a természeti
  kötést/száradást. Az időmodell külön tételbeállítási időt, darabidőt, nem
  technológiai munkaidőt, természeti folyamatidőt és normaforrást kér.
- A munkautasítás és minőség-ellenőrzési terv kontrollált tervbemenet; nem
  keveredik a későbbi mérési eredménnyel, végrehajtási evidence-szel vagy
  nemmegfelelőségi döntéssel. A vásárolt alkatrészek külön ellátási ágat
  kapnak: beszerzés, beérkező ellenőrzés, tárolás/kittelés, szerelési átadás.
- A felület nem gyárt műveletet, standardot, gépet, normaidőt vagy
  függőséget. A létrehozó gomb látható, `aria-disabled`, és közérthetően
  magyarázza a hiányzó szerverfunkciót. A méretek Sz × M × V tengelyjelölést
  kaptak, az alacsony kontrasztú 7–10 px mikrotipográfia helyett legalább
  10–11.5 px-es, erősebb másodlagos szöveg fut.
- Az örökölt `Project.epics/EpicStep` külön összecsukható, read-only
  összevetés. Station, unitHours, planDate és kapcsolt task nem válhat
  autoritatív műveletté, tervvé vagy kiadássá.
- A nyers faipari korpusz a szerkezeti mezőket és az alkatrészenkénti,
  összevezetési pontokat tartalmazó route-ot igazolta. OCR/RAG miatt számszerű
  szabály vagy automatikus döntés nem készült belőle.
- A `G:\Saját meghajtó\Tudástár\Faipar\Tudástár` 735 nyers fájlt tartalmaz;
  a Nexus-dev `doorstar-knowledge` kollekcióban 1998 chunk már indexelt.
  A Doorstar Codex MCP-kliens 2026-07-31 óta külön tokennel a `doorstar`
  szigetre kötött. Ez fejlesztői RAG-képesség; runtime RAG-hívás továbbra sem
  került a böngésző UI-ba.
- ADR:
  `docs/decisions/ADR-2026-07-31-operation-workspace-handoff.md`.
  Backend handoff:
  `terminals/backend/inbox/2026-07-31_014_frontend-operation-workspace-contract.md`.
- Ellenőrzési végállapot: 25 tesztfájl / 75 teszt, TypeScript lint és
  production build zöld; diff-check tiszta. Böngészőben a DSMR-24181 R1
  DRAFT revízió helyesen piros/zárt kaput és tételes blokkolókat mutat. A
  projektcockpit `PLANNING` kapuja `Backend-szerződés szükséges` / `Zárolt
  adatkapu`, legacy link nélkül. 1440×1000 és 390×844 nézetben nincs
  dokumentumszintű vízszintes túlcsordulás; mobilon a kapusáv kétoszlopos.

## Nexus faipari RAG bekötés — 2026-07-31

- A Nexus szerveroldali `doorstar-codex` identitása kizárólag a `doorstar`
  szigetet választja; a kliens nem adhat meg islandet vagy kollekciót.
- A megosztott 3466-os végpont legacy HTTP JSON-RPC átvitele miatt a Codex
  közvetlen Streamable HTTP konfigurációja nem kompatibilis. Külön, standard
  STDIO bridge készült a `src/doorstar-production-mcp` csomagban.
- A `doorstar_knowledge` MCP pontosan egy, csak olvasható `search_knowledge`
  toolt tesz elérhetővé. Token kizárólag felhasználói környezeti változóból
  öröklődik; a projektben és a naplókban nincs secret.
- A bridge fix upstreamre küld, tiltja a redirectet, méret- és időkorlátos,
  strict JSON-RPC/payload ellenőrzést és kötelező `island=doorstar` kaput
  alkalmaz. A RAG-találat nem válhat automatikus gyártási döntéssé.
- Valódi Codex-próba a repó gyökeréből és a frontend terminálmappából is
  találatot adott a `doorstar-knowledge` faipari forrásaiból. QA: 18/18 MCP
  teszt, build és dependency audit zöld; no-token 401, hibás token 403.
- Nyitott P1 defense-in-depth: a Nexus legacy globális tool-RBAC-ját külön
  `knowledge-only` identitásprofilra kell szűkíteni. A helyi bridge ettől
  függetlenül csak az egyetlen olvasási műveletet exponálja.
- ADR:
  `docs/decisions/ADR-2026-07-31-doorstar-nexus-knowledge-mcp.md`.
- A Codex desktop UI újraindítása egy már futó task háttérhostját és
  tool-inventoryját nem feltétlenül cseréli le. A bridge ezért Windows alatt
  az abszolút System32 `reg.exe` útvonalon a user-szintű `HKCU\\Environment`
  értéket tekinti autoritatívnak, és csak annak hiányában használ örökölt
  env-et; az új MCP-definíció betöltéséhez új task szükséges.

## Közvetlen legacy Task projekció és műveletterv-hardening — 2026-07-31

- A projektfolyamat az epikhez nem tartozó `Task` rekordokat külön,
  `(epik nélkül)` nevű read-only sávban mutatja. A backend `week`, `day`,
  `status`, `problem`, mennyiség és idő mezői változtatás nélkül látszanak;
  hibás napindexnél sincs kitalált dátum vagy napnév.
- A közvetlen Task pontosan egyszer számít bele a projekt kiadott és kész
  összesítéseibe. Nem válik `OperationPlan`, `PlanningProposal` vagy
  `IssuedWorkPackage` rekorddá, és a részletezőből csak az örökölt üzemi
  táblára vezető olvasási út érhető el.
- A projektcockpit és az exact-revision Műveletterv ugyanazt az aktív profil-,
  katalógus- és snapshot-fingerprint predikátumot használja. Hiányzó vagy
  eltérő lenyomat esetén mindkét felület fail-closed marad.
- A rendelés-, feedback-, profil-, katalógus- és snapshot-cache
  háttérfrissítése alatt a jóváhagyás, a materializálás és mindkét
  snapshot-review művelet zárva marad. Stabil authority mellett a stale
  snapshot továbbra is elutasítható, de nem fogadható el.
- A műszaki előkészítés `Review-ra küldés` kapuja order- vagy feedback-refetch
  alatt szintén tiltott; a gomb és a handler ugyanazt a fail-closed readiness
  feltételt használja.
- A hosszú komponenskulcsok mobilon a konténerben maradnak, a kiválasztás és a
  billentyűzetes fókusz vizuálisan külön jelzést kapott.
- Az autoritatív műveletterv, tervezés és üzemi kiadás továbbra is a DSORD-06
  és DSORD-09 backend-szerződéseire vár. Ehhez a frontend szelethez nem készült
  kliensoldali gyártási döntés, mutation vagy deploy.
- Felhasználói authority-szabály: faipari háttértudáshoz kizárólag a szerep
  saját `doorstar_knowledge_frontend` Nexus toolja használható, a forrás és a
  bizonytalanság megőrzésével. A jelen szelet query- és UI-authority hardening
  volt, ezért nem igényelt faipari Nexus-állítást.
- Ellenőrzés: 28/28 tesztfájl és 92/92 teszt, TypeScript lint, production build,
  Codex-agent contract és diff-check zöld. A DSMR-24181 projekt- és R01
  Műveletterv-oldal 1440 px és 390 px szélességen nem csordul túl
  dokumentumszinten; a zárt forráskapu látható, koholt műveleti munkatér és
  böngészőkonzol-hiba nincs. Az élő demóprojekt közvetlen Taskot nem tartalmaz,
  ezért az új sáv konkrét sorait a fókusz-, kinyitás-, nyers mező- és authority
  DOM-regressziótesztek igazolják.

## Kezdőoldali következőteendő-munkasor — 2026-07-31

- A HomePage nem tárol új állapotot: a `useProjects` és
  `useProductionOrders` eredményét ugyanazzal a `buildProjectWorkspaceRows`
  projekcióval kapcsolja össze, mint a projektregiszter.
- A rövid munkasor figyelem → tervezés → munkamenet-hiány → gyártás → kész
  sorrendben legfeljebb négy projektet mutat. Minden kártyán a projekt
  állapota, a hiányzó adatkapu magyarázata és a projekció által kijelölt
  adatgazda-munkatérre vezető valós link látszik.
- Nem tervező szerepnél az üres projekt örökölt segédmunkalapja
  `megtekintése` szöveget kap; a kliens nem sugall szerkesztési authorityt.
- A projekt- vagy rendeléslekérdezés kezdeti betöltése és minden
  cache-refetch alatt a munkasor zárva van. Bármely lekérdezési hiba esetén
  nincs kártya vagy célakció, így a hiányzó rendeléskapcsolat nem jelenhet meg
  hamis `Nincs kapcsolt rendelés` tényként.
- Új backend-state, mutation, importigény vagy üzemi Whiteboard-stílus nem
  készült. A szelet nem igényelt faipari Nexus-döntést.
- Monitor review után a scope-olt világos Home `--ds-muted` token `#625e53`.
  WCAG relatív luminancia szerint a kontraszt `#fbf9f4` papíron 6,1499:1,
  `#e4dfd2` vásznon 4,8638:1. A változatlan dark `#b8b09e` token kontrasztja
  7,3018:1 a `#24231e` papíron és 8,4916:1 a `#151511` vásznon. A négy pontos
  számítást unit teszt őrzi.
- A DOM-regresszió külön paraméterezve ellenőrzi mind a projekt-, mind a
  rendelésquery `isLoading`, `isFetching` és `isError` fail-closed ágát. Az öt
  projekciós state valós route/akció mátrixa, a négykártyás limit és pontos
  maradékszám, valamint az azonos prioritású projektek forrássorrendje is
  tesztelt.
- Ellenőrzés: 16/16 HomePage DOM + 4/4 kontrasztteszt; teljes frontend 30/30
  tesztfájl és 114/114 teszt, TypeScript lint, production build és diff-check
  zöld. Root böngészős QA igazolta a 1440/390 px light/dark nézetet:
  `scrollWidth === clientWidth`, két élő kártya, 343 px-es mobilkártyák és
  44 px-es akciók, tiszta konzol, helyes valós felmérési route. A natív link
  fókuszba került és 2,4 px-es `focus-visible` outline-t kapott. Független
  monitor re-review: PASS, P0-P3 nyitott termékhiba nincs.

## Kétoldali felületkezelési összefoglaló — 2026-07-31

- A rendelési adatlap elsődleges felületkezelési blokkja két, azonos súlyú
  `A oldal (SIDE_A)` / `B oldal (SIDE_B)` kártyát mutat. Az örökölt `fix:` és
  `mozgó:` / `állítható:` értékek külön forráskártyák, és soha nem kerülnek
  automatikusan fizikai oldalra vagy komponensre.
- A forrásjelöltek azonos/eltérő állapota látható. Összevont, FIX-only és
  ÁLLÍTHATÓ-only forrásnál sincs kitalált ellenoldal. A műszaki ötcélos bontás
  és a nyers forrás külön, alapból zárt natív `details` elem.
- A monitor által jelzett mobil a11y-rés javítva: a `thead` nem tűnik el, a
  négy oszlopfejléc `scope="col"`, a sorfejlécek `scope="row"` értéket tartanak
  meg. A 600 px-es tábla megnevezett, `tabIndex=0` belső régióban görgethető,
  látható fókuszkerettel; dokumentumszintű overflow nincs.
- Faipari háttérhez kizárólag a `doorstar_knowledge_frontend` keresés futott.
  Forrás: *Épületasztalos szakrajz (szega.hu #134)*,
  `szega_book_134_oldal_008.jpg`, 8. oldal (`0,5971`) és
  `szega_book_134_oldal_124.jpg`, 124. oldal (`0,5497`). A találatok a
  tokborítás/tokmag/falvastagság elkülönítését támogatják, de a
  FIX/ÁLLÍTHATÓ szerep és a fizikai A/B oldal pontos viszonyát nem igazolják.
  Emiatt a UI az állítást kifejezetten a Doorstar örökölt forrására szűkíti;
  az authority az `ADR-2026-07-30-two-sided-door-structure-appearance.md`.
- Ellenőrzés: célzott 2 fájl / 9 teszt, teljes frontend 30/30 tesztfájl és
  114/114 teszt, TypeScript lint, production build és független monitor utó-QA
  zöld. Böngészőben 1440×1000
  light és 390×844 dark nézetben nincs dokumentum-overflow; a mobil belső
  táblázat-scroll 325/600 px, a konzol warning/error lista üres. Deploy nem
  történt.

## Tartós UX-termékirány — faipari irodai projektmunkatér — 2026-07-31

### Irány és authority

- **Felhasználói termékirány (`DOORSTAR_LOCAL`, elsődleges):** a Doorstar
  irodai/projektkezelő UI legyen kényelmes, pozíció- és bizonyíték-központú
  munkatér faipari projektekhez. Elsődleges fókusz az utólag beépíthető beltéri
  ajtó, mellette a falpanel; a blende nem elírás vagy bizonytalan alias.
- **Blende (`DOORSTAR_LOCAL`, elsődleges):** az ajtó felső vízszintes
  takarásának meghosszabbítása, fix mérettel vagy a plafonig. A projekt-UI-ban
  ezért külön, opcionális szerkezeti adatcsoportként kezelendő: jelenlét,
  kiterjesztési mód (`FIXED_HEIGHT` / `TO_CEILING` jelleg), szükséges méret,
  valamint önálló felület/szín. Ez termékadat-igény, nem gyártási képlet vagy
  automatikus méretmeghatározás.
- A termékirány az **irodai projektfolyamatra** vonatkozik; nem terjeszti ki a
  filctábla vizuális nyelvét, és nem hoz létre kliensoldali gyártási,
  jóváhagyási vagy kiadási authorityt. A `SIDE_A/SIDE_B` fizikai oldal és a
  `FIXED/ADJUSTABLE` borításszerep továbbra is külön tengely.
- A Nexus-találatok az alábbi UX-igényeket csak tanácsadó domain evidence-ként
  támogatják. OCR-kivonatból, hasonlósági pontszámból vagy tankönyvi példából
  nem készül automatikus default, méretképlet, validáció vagy gyártási döntés.

### Forrás-grounded UX-következtetések és bizonytalanság

- **Ajtópozíció mérési nézete — közepes bizonyosság.** Az *Épületasztalos
  szakrajz* külön fogalomként sorolja a tokborítás külméretét, falnyílást,
  névleges méretet, tokmag külméretét, szabad átjárást, ajtószárny külméretét,
  kész falvastagságot és elhelyezési hézagot. UX-következmény: ezek külön
  címkézett, forrás- és állapotjelölt mezők legyenek, ne egyetlen „ajtóméret”.
  Forrás: `szega_book_134_oldal_008.jpg`, 8. oldal, score `0,5420`.
  Bizonytalanság: általános szakrajzi fogalmak; a Doorstar profilmezőit és
  kötelezőséget nem igazolják.
- **Profilfüggő méretösszefüggések — közepes/alacsony bizonyosság.** Ugyanez a
  mű a falvastagságot kész rétegrenddel kezeli, és tankönyvi példát ad a
  névleges tokméret és tokmag kapcsolatára. UX-következmény: a UI mutassa a
  nyers mérést, a kiválasztott profil/verziót és a számított eredmény
  lineage-ét külön. Forrás: `szega_book_134_oldal_111.jpg`, 111. oldal, score
  `0,5427`. Bizonytalanság: a közölt milliméteres szabály nem válhat Doorstar
  defaulttá profilrajz és backend-authority nélkül.
- **Tervezési és gyártási dokumentumok szétválasztása — közepes bizonyosság.**
  A *Faipari műszaki dokumentáció* külön gyártmány- és gyártásdokumentációt
  nevez meg, a tervrajzot a gyártástervezés előfeltételeként kezeli, továbbá
  műszaki leírás, alkatrész-/szabás-/szerelvényjegyzék, ütemterv és részletes
  műveletterv rétegeket sorol. UX-következmény: termékpozíciónként legyen
  elkülönített, revíziózott „felmért tény → műszaki döntés → jóváhagyott
  gyártmányadat → gyártástervezési átadás” nézet, dokumentumonkénti
  készültséggel és felelőssel. Források:
  `szega_book_230_oldal_007.jpg`, 7. oldal, score `0,5947`;
  `szega_book_230_oldal_020.jpg`, 20. oldal, score `0,5809–0,6192`;
  `szega_book_230_oldal_036.jpg`, 36. oldal, score `0,6012`.
  Bizonytalanság: a lista tömörfa bútorpéldából származik, ezért nem minden
  dokumentumtípus kötelező minden Doorstar termékhez.
- **Falpanel zóna és csomópontok — alacsony/közepes bizonyosság.** Az
  *Épületasztalos szakrajz* a fal- és mennyezetborításokat külön fejezetben,
  lezáró lécekkel és egy függőleges deszkázat több csomópontjával mutatja.
  UX-hipotézis: a falpanel ne ajtópozícióként legyen erőltetve; saját
  fal-/mennyezetzónát, határokat, lezárásokat és csomópont-referenciákat
  igényel, rajzi/fotó evidence-szel. Források:
  `szega_book_134_oldal_215.jpg`, 215. oldal, score `0,5209–0,5783` és
  `szega_book_134_oldal_219.jpg`, 219. oldal, score `0,5597–0,5623`.
  Bizonytalanság: a találatok nem igazolják a Doorstar paneltípusokat,
  kiosztási szabályokat, kivágásmezőket vagy szerelési technológiát; ezekhez
  ügyfélpélda és szerződés szükséges.
- **Blende RAG-korlát — magas bizonyosság a hiányra.** A célzott Nexus-keresés
  nem adott releváns blende-találatot (a legjobb találat score `0,5968`, de
  lépcsőméretezésről szólt). Emiatt a blende fogalma és UX-adatcsoportja
  kizárólag a fenti `DOORSTAR_LOCAL` meghatározásra támaszkodik; a pontos
  komponenshatár, méretértelmezés és gyártási kapcsolat nyitott.

### UX north star

Forrás: `UX_PRODUCT_HYPOTHESIS`, a felhasználói „kényelmes faipari
projektkezelő” irány, a már működő Doorstar evidence/revízió kapuk és a fenti
Nexus-audit szintézise. Bizonyosság: közepes; valódi Doorstar-projekteken és
szerepkörökkel használhatósági validáció szükséges.

- Egy projekt egy áttekinthető regiszterben kapcsolja össze a helyiséget/
  falzónát, termékpozíciót, felmérési evidence-et, műszaki revíziót,
  komponenseket, dokumentumokat, blokkolókat és a következő felelős akciót.
- A gyakori többpozíciós munka legyen gyors: ismételhető, explicit forrásból
  másolható adatok, tömeges kijelölés előnézettel, billentyűzetes használat,
  44 px-es mobil célok, látható fókusz és elvesző piszkozat elleni védelem.
  Másolás nem jelent automatikus szakmai megfeleltetést; eltérés és forrás
  pozíciónként látható marad.
- A terméktípus-specifikus részletek csak a megfelelő nézetben jelenjenek meg:
  ajtónál a kétoldali szerkezet és tokprofil, blendénél a felső kiterjesztés,
  falpanelnél a zóna/határ/csomópont. A közös projektmag — azonosító,
  határidő, felelős, revízió, dokumentum, evidence és blocker — marad egységes.
- Hiányzó vagy frissülő authority-adatnál az ajánlott akció és minden
  jóváhagyó/kiadási művelet fail-closed. A RAG nem kerül runtime döntési
  motorba, és nem tölthet ki szakmai mezőt felhasználói review nélkül.

## Projektcockpit és örökölt munkamenet resilience — 2026-07-31

- A `/projects/:key` szerkeszthető címmezője mellett is pontosan egy,
  projektnevű `h1` marad az akadálymentes címszerkezetben. A cím- és
  törzsadatmezők látható `focus-visible` keretet kaptak.
- A projekt törzsadatainak frissítése és archiválása query-refetch, query-hiba,
  update vagy delete pending alatt egyszerre DOM- és handler-szinten tiltott.
  Az aszinkron archiválási megerősítés után a handler újraolvassa az aktuális
  guardot; cached projekt hiba esetén látható, de read-only marad.
- A `/projects/:key/work-session` kliensoldali dirty/refetch, stabil ID és
  confirm/prompt fingerprint-védelme önmagában nem elég. A teljes-fa
  `PUT /projects/:key/epics` revízió/ETag nélkül a megerősítés vagy az utolsó
  refetch után beérkező párhuzamos epik-, lépés- vagy Task-változást még mindig
  törölheti, illetve elárvult lineage-et hagyhat. Ez szerveroldali TOCTOU, amelyet
  a böngésző nem tud atomikusan lezárni.
- A végleges frontend kapu ezért `worksheetWriteAuthorityAvailable = false`.
  Managerként is tiltott minden meta-, epik-, lépés-, sablon-, mentés-, törlés-,
  kiadás-, TaskDetailModal- és segédlap-írás; a handlerref ugyanezt védi. A lap
  read-only megtekintése, a nyomtatás és a projekt-navigáció aktív, a zárolás oka
  külön `role="status"` üzenetben látszik.
- A feloldáshoz kért backend contract:
  `terminals/backend/inbox/2026-07-31_016_frontend-work-session-concurrency-contract.md`.
  Minimum: monoton `worksheetRevision` vagy erős ETag, kötelező `If-Match`,
  tranzakciós compare-and-swap, stabil 409, feltételes per-epik törlés és valódi
  PostgreSQL versenytesztek. A dirty piszkozat csak e szerződés kliensoldali
  bevezetésével együtt engedhető újra mentésre.
- A `releaseAuthorityAvailable = false` változatlan. A frontend nem hozott
  létre `OperationPlan`, `IssuedWorkPackage`, gyártási vagy kiadási authorityt;
  az autoritatív folytatás továbbra is a DSORD-06 backend-szerződésre vár.
- A szelet kizárólag technikai UI/query hardening, ezért nem tartalmaz faipari
  háttérállítást. A felhasználói szabály szerint ilyen állításhoz kizárólag a
  `doorstar_knowledge_frontend` használható forrás- és bizonytalanságmegőrzéssel;
  ebben a szeletben Nexus-lekérdezésre nem volt szükség.
- Ellenőrzés: a projektcockpit célzott 5/5, a végső munkamenet authority-kapu
  2/2 DOM-tesztje, a teljes frontend 33/33 tesztfájlja és 130/130 tesztje,
  TypeScript lint, production build és diff-check zöld. A build ismert, nem új
  blokkoló jelzése a 691,16 kB-os Vite
  chunk. A DSMR-24181 projekt és örökölt munkamenet 1280 px desktop, illetve
  390×844 mobil nézetben egyetlen projektnevű főcímet és nulla dokumentum-
  overflowt mutat; mobilon a munkamenet `main` eleme alatt nulla engedélyezett
  formmező, a kiadási gomb tiltott, a böngésző warning/error naplója üres.
  Független végső review: PASS, író mutation/bypass nincs. Deploy nem történt.

## Faipari termékfókusz és szerződéshatár — 2026-07-31

- Tartós termékirány: az irodai munkatér elsősorban utólag beépíthető beltéri
  ajtókat, továbbá falpanel-zónákat és ajtóhoz tartozó blendéket kezeljen.
- A blende elsődleges `DOORSTAR_LOCAL` definíciója: a felső vízszintes takarás
  meghosszabbítása fix magasságig vagy plafonig. Saját surface/colour döntése
  lehet; RAG-találat, implicit öröklés vagy kliensoldali képlet nem authority.
- Nexus advisory evidence: ajtóméret `book134` p.8 (`0,5420`), profil-/
  falvastagság-összefüggés p.111 (`0,5427`), dokumentációs rétegek `book230`
  p.7/p.20/p.36 (`0,5809–0,6192`), falpanel csomópontok `book134` p.215/p.219
  (`0,5209–0,5783`). A konkrét Doorstar mezők és szabályok emberi/szerver-
  contract validációig hipotézisek.
- Backend contract: `2026-07-31_015_frontend-door-blende-wall-panel-contract.md`.
  Import contract: `2026-07-31_010_import-discovery-blende-wall-panel-mapping-request.md`.
  A végső monitor re-review PASS, P0–P3 finding nincs.

## DSMR-26148 forrásszemantika és felmérési előkapu — 2026-07-31

- A Pozíció 360° általános adatcíme `Rögzített forrásadatok`; Salesből vagy
  importból betöltött méretet nem nevez automatikusan felmért fizikai ténynek.
  Az állapot source-aware: hiányzó SURVEY dokumentumkapcsolat blokkoló,
  kapcsolt SURVEY + nulla evidence semleges, látható lineage-jelzés, nyitott
  vagy hiányosan auditált evidence külön blokkoló.
- Az `OrderDocument` továbbra is metadata-only hivatkozás. A dokumentumpanel a
  Sales-, felmérési és rajzi rekordokat forrásként címkézi, és kimondja, hogy a
  verzió, hash vagy pozíciótagság nem mezőszintű tartalom-ellenőrzés.
- A `buildSurveyCompletionReadiness` kizárólag a szerver read modelből képez
  fail-closed UI-előkaput. Feltétele: legalább egy pozíció, minden kötelező mező,
  legalább egy `SURVEY` dokumentum, minden pozíció közvetlen kapcsolata ilyen
  dokumentumhoz, valamint minden meglévő evidence `RESOLVED` állapota, nem üres
  indoka, principalja, engedélyezett reviewer-szerepe és review-időpontja.
  Nulla evidence önmagában nem blokkol, ha a többi feltétel teljesül.
- A reviewer-allowlist nem duplikált: a survey helper a közös
  `sourceEvidenceReviewerRoleAllowed` konfigurációt használja. A frontend
  `OrderPositionEvidence` szerződés nullable/átmenetileg opcionális auditmezői
  hiány esetén blokkolnak; a backend marad a végső workflow-authority.
- Forrás: elfogadott Doorstar Sales→felmérés workflow, dokumentumverzió ADR és
  backend position-evidence hash-v3 handoff. Bizonytalanság: nincs faipari
  állítás; Nexus-lekérdezés ezért nem futott.
- Ellenőrzés: célzott 5 tesztfájl / 18 teszt, teljes frontend 33/33 fájl és
  130/130 teszt, TypeScript lint és production build zöld. A 691,16 kB-os Vite
  chunk-warning ismert. A worker környezetben nem volt elérhető browser backend;
  az élő DSMR-26148 desktop/mobil QA a root tasknak átadva. Deploy nem történt.

## Exact-revision projektlánc és readiness cockpit — 2026-07-31

### Nexus advisory audit

- A lekérdezés kizárólag a `doorstar_knowledge_frontend` role-servert és a
  `doorstar-frontend-codex` audit principalt használta. A találatok tanácsadó
  faipari evidence-ek; sem kapusorrendet, sem kötelezőséget, sem következő
  műveletet nem hoznak létre.
- **Utólag beépíthető beltéri ajtó projektprogresszió:** a célzott keresés nem
  adott Doorstar-specifikus felmérés → műszaki előkészítés → gyártás-előkészítés
  folyamatszerződést. A legerősebb használható találatok általános műszaki
  dokumentációk: `szega_book_230_oldal_007.jpg`, 7. oldal, score `0,6351`;
  `szega_book_230_oldal_020.jpg`, 20. oldal, score `0,6380`;
  `szega_book_230_oldal_036.jpg`, 36. oldal, score `0,6424`. Bizonytalanság:
  közepes/alacsony; a könyv tömörfa bútorpéldája nem Doorstar workflow-authority.
- **Műszaki dokumentáció/readiness:** a tervrajz gyártásdokumentáció előtti
  függőségét a `szega_book_230_oldal_007.jpg`, 7. oldal, score `0,6540` adta;
  a műszaki leírás `szega_book_230_oldal_020.jpg`, 20. oldal, `0,6457`, az
  alkatrészjegyzék p.22 `0,6324`, a szabásjegyzék p.24 `0,6410`, az összesítő
  dokumentumlista p.26 `0,6465`, a szerelvényjegyzék p.30 `0,6349`, a vonalas
  folyamatábra p.36 `0,6296`. Bizonytalanság: közepes; a rétegek elkülönítését
  támogatják, de egyik dokumentumtípust sem teszik automatikusan kötelezővé
  minden Doorstar ajtó-, falpanel- vagy blendeprojektnél.
- **Falpanel-zónák:** `szega_book_134_oldal_215.jpg`, 215. oldal, score
  `0,6311` külön fal-/mennyezetborítást és lezárólécet; p.219 `0,6366` négy
  csomópontot; p.223 `0,5739` felső/közbülső/alsó/sarok/síkbeli csatlakozást;
  p.216 `0,5568` alaprajzi, nézeti és metszeti megjelenítést mutat.
  Bizonytalanság: alacsony/közepes; zóna- és csomópont-UX-et támogat, Doorstar
  panelkiosztást, kivágási szabályt vagy szerelési technológiát nem igazol.
- **Blende:** a célzott keresés továbbra sem adott releváns találatot. A top
  eredmény `szega_book_134_oldal_078.jpg`, 78. oldal, score `0,5732`, de
  erkélyajtó felső tok-/szárnyelemről szólt; a p.20 `0,5576` csak általános
  műszaki leírás, a p.216 `0,5568` falburkolati rajz. Bizonytalanság: magas
  bizonyosság a RAG-hiányra. A blende továbbra is `DOORSTAR_LOCAL`: az ajtó
  felső vízszintes takarásának fix magasságig vagy plafonig tartó opcionális
  meghosszabbítása, önálló felület-/színadattal; kliensoldali képlet nincs.

### Frontend szerződés és UX

- A `/projects/:key` az exact
  `GET /production-orders/:projectKey/revisions/:revision/readiness` és a
  `GET /projects/:projectKey/workflow` read modelt együtt fogyasztja. A
  `doorstar.order-revision-readiness/v1` kilenc kapuja részletes auditként, a
  `doorstar.project-workflow/v1` hét projektkapuja fő láncként jelenik meg.
- Runtime validator ellenőrzi a sémaverziót, stabil kapusorrendet, enumokat,
  canonical role-okat, strukturált blocker-detailt, allowed actiont, exact
  project/revision azonosságot és mindkét `isLatest` flaget. Minden workflow-
  kapu forrása exact `ORDER_REVISION`: az id és revision a workflow-revízióval,
  a contentHash a readiness-hashsel egyezik. A `currentGate`, a kapukból
  aggregált `allowedActions` és a top-level `nextAction` szerkezete is
  keresztellenőrzött. Az ORDER/COMPONENTS/OPERATIONS workflow-kapu rendre az
  ORDER_REVIEW/COMPONENT_SNAPSHOT/OPERATION_PLAN readiness-kapu state,
  ownerRole, detailsHref, blockers és allowedActions értékének exact tükre.
  Mindkét DTO top-level blockerlistája a gate-ekből a backend első-előfordulást
  megtartó `code + entity.kind + entity.id` unique szabályával vezethető le.
  Az összetett értékek összevetése property-order-független. Hiányos, kevert
  vagy stale válasz mellett nincs korábbi cache-akció vagy link.
- A fő lánc a backend explicit `currentGate` értékét használja: `READY` → Kész,
  aktuális `BLOCKED` kapu → Itt tart, más `BLOCKED` → Blokkolt. A
  `NOT_AVAILABLE`/`CONTRACT_REQUIRED` mindig Nem elérhető marad akkor is, ha a
  backend `currentGate` arra mutat. A blocker `message` és
  `ownerRole` lokalizált, a gépi kód látható; az objektum `detail` nem kerül
  nyers szövegként a DOM-ba.
- POST/PATCH API-href sosem válik navigációvá. Csak az `App.tsx`-ben valóban
  létező office/board route mehet át az allowlisten; ORDER/COMPONENTS/OPERATIONS
  kapuhoz az ismert adatgazda-munkatér adható részletező linkként. Null next
  href nem kattintható. A panel maga nem hajt végre mutationt.
- A kliensoldali `nextWorkspace` és a kliensből levezetett
  `ProjectProcessOverview` kikerült a cockpit fő authority-helyéről. Az
  örökölt munkalap külön segédlink maradt; az office papír/grafit UI nem veszi
  át az üzemi filctábla nyelvét.
- A szelet nem jelenít meg ajtóoldal-/tokborítás-kiosztást, ezért nem mossa
  össze a `SIDE_A/SIDE_B` fizikai oldalt a `FIXED/ADJUSTABLE` szereppel. A
  falpanel és a blende terminológiai különbsége változatlan.
- Ellenőrzés: célzott 3 fájl / 27 teszt; teljes frontend 36/36 fájl és 154/154
  teszt; TypeScript lint és production build zöld. A szerveroldali
  `QA-READINESS-20260731` projekción a 1440/390 px dark/light browser-QA is
  zöld: egy projektnevű `h1`, nulla dokumentum-overflow, tiszta végső konzol,
  Enterrel kiválasztható Alkatrészképzés kapu, frissülő `aria-pressed` és
  lokalizált blocker-/felelős-részlet. Deploy nem történt.

## Route-szintű kódfelosztás — 2026-07-31

- Az `AppShell` és a `ProductShell` eager maradt, mind a 17 leaf oldal pedig
  explicit, named-exportot megőrző `React.lazy` importtal töltődik. A route-ok,
  az API-k és az authority-határok nem változtak.
- A `Suspense` csak a leaf tartalmat fedi. Betöltés közben a shell és a
  navigáció látható marad; a magyar fallback `role="status"` és
  `aria-live="polite"` attribútummal jelzi az állapotot.
- Két külön deferred route-modult használó DOM-teszt bizonyítja, hogy az
  irodai és az üzemi shell a fallback alatt is jelen van, majd a lazy oldal
  feloldás után megjelenik. A független audit minden route/export párost,
  boundaryt és authority-határt ellenőrzött: PASS, P0–P3 finding nélkül.
- Ellenőrzés: 36/36 tesztfájl és 143/143 teszt, TypeScript lint, production
  build, diff-check és agent-contract validáció zöld. A fő JS chunk 691,16
  kB-ról 370,06 kB-ra csökkent (gzip 114,04 kB), a Vite 500 kB-os warning
  megszűnt; a legnagyobb további JS chunk 39,99 kB.
- Élő route-QA: a `/`, `/board` és a mély projekt-munkamenet útvonal desktopon
  betöltötte a megfelelő shellt és leaf oldalt; a `/` 390×844 nézetben
  390 px dokumentumszélességgel, overflow nélkül jelent meg. A helyi backend
  a teszt egy részében 500-at adott, amelyet a frontend forráshű, fail-closed
  állapottal kezelt; teljes adatgazdag böngészős bizonyítéknak ez nem számít.
- A szelet tisztán technikai performance/accessibility munka, faipari
  háttérállítást nem tartalmazott. A felhasználói szabály szerint ilyen
  állításhoz kizárólag a `doorstar_knowledge_frontend` használható; ebben a
  szeletben Nexus-lekérdezésre nem volt szükség. Deploy nem történt.

## Adatgazdag revíziófókusz — 2026-08-01

- A rendelési adatlap ne renderelje egymás alatt minden revízió teljes
  részletfáját. Az operatív alapértelmezés a legfrissebb revízió, a történeti
  változat URL-ben címezhető és mindig read-only. Hibás revízióparaméternél a
  látható fallback nem adhat írási authorityt. Mivel a natív select ilyenkor
  már a legfrissebb értéket mutatja és ugyanaz az option nem küld `change`
  eseményt, külön query-törlő helyreállító link szükséges.
- Az irodai projektmunkatér-navigáció csak útvonalválasztó. A szerveroldali
  workflow/readiness állapotot nem szabad a linkek elérhetőségéből levezetni;
  a státusz és következő teendő autoritatív helye a projektcockpit.
- A referenciafixture stabil kulcsa `UX-REFERENCE-RETROFIT-001`. R01 leváltott,
  R02 jóváhagyott; a legfrissebb revízió 3 pozíciót, 3 dokumentumot, 1 külön
  gyártott tételt, 1 tartozékot és egy 7 soros verified alkatrészsnapshotot ad.
  A fixture nem valós ügyféladat és kizárólag helyi QA-célú.
- A `doorstar_knowledge_frontend` tanácsadó keresése a felmérés, műszaki leírás,
  alkatrészjegyzék, szabásjegyzék és műveleti dokumentáció elkülönítéséhez adott
  közepes/alacsony bizonyosságú támpontot: `szega_book_230_oldal_022.jpg` p.22
  (0,6077), p.24 (0,6069), p.30 (0,6026), p.36 (0,5999) és p.26 (0,5971).
  Ezek tömörfa-bútor dokumentációs példák, nem Doorstar workflow-authority;
  sem UI-default, sem gyártási képlet, sem jóváhagyási döntés nem származott
  belőlük.
- A mobil saját projektmunkatér-rács 390 px-en nem scrolloz vízszintesen. A
  globális office fejléc külön vízszintes navja swipe- és billentyűzet-
  görgethető maradt, de a header már nem zsugorodik a gyermekei alá és a
  vizuális scrollbar nem fedi a tartalmat.
- A DB-ben lévő VERIFIED operation snapshot read-only frontend adoptionja
  elkészült. Create/review/kiadási művelet nem nyílt meg, és a linkekből nem
  származik readiness-authority.

## Mobil office shell fejléc — 2026-08-01

- A `.doorstar-product-shell` rögzített viewport-magasságú flexoszlop. A benne
  lévő, mobilon több sorba törő `.doorstar-product-header` nem maradhat az
  alapértelmezett `flex-shrink: 1` állapotban, mert a saját dobozmagassága a
  gyermekek alá zsugorodhat, miközben a kilógó nav és tools ráfest a tartalomra.
  Tartós invariant: a header `flex: none`.
- A mobil témakapcsoló célmagassága legalább 44 px. A széles office nav maradhat
  kontrollált `overflow-x: auto`; swipe és linkfókusz megmarad, a vizuális
  scrollbar `scrollbar-width: none` és WebKit scrollbar-szabállyal rejthető.
- Ez shell-layout javítás, nem workflow- vagy faipari döntés; Nexus-keresés és
  új backend-contract nem szükséges.

## Exact műveletterv-megjelenítés — 2026-08-01

- A műveletterv-oldal authorityja az exact revíziós backend snapshot. A kliens
  nem állíthat elő helyettesítő sort komponensnévből, sorrendből, legacy
  munkalapból vagy Nexus/RAG-találatból; csak az explicit `operations` tömb és
  annak `sequence` értéke jelenhet meg.
- A VERIFIED snapshot is csak read-only gyártás-előkészítési adat. Nem bizonyít
  PlanningProposal-t, immutable IssuedWorkPackage-et, 6-stage kiadást vagy
  végrehajtási jogosultságot; `PRODUCTION_RELEASE=NOT_AVAILABLE` mellett nincs
  mutation.
- Tartós negatív kapu: loading, query-hiba, üres eredmény, exact lineage-
  eltérés vagy nem READY snapshot esetén nincs korábbi cache-ből műveletsor,
  nincs create/review/release gomb, a blokkolás oka viszont látható.

## Kompakt Sales-átadás progresszív részletekkel — 2026-08-01

- A rendelési adatlap tartós alapelve: először az átadási döntési minimum
  jelenjen meg (azonosító, ügyfél, vállalt idő, exact revízió/állapot,
  következő teendő, kritikus hiány, pozíciósorok). A hash-, evidence-,
  dokumentum- és műszaki audit megőrzendő, de alapból zárt részlet.
- A Sales dokumentum forrás, nem production release és nem approval
  authority. Background refetch, történeti revízió és invalid query esetén a
  rövid összefoglaló szövege is fail-closed legyen, ne csak a handler.
- Egy felső következőteendő-CTA meglévő helyi kaput megnyithat és fókuszálhat,
  de új backend actiont nem szimulálhat. REVIEW + approver ezért a már létező
  approval formhoz navigál; az APPROVED ág exact alkatrészmunkatérre mutat.
- A DSMR 24181 PDF-ből a nyers hónapvégi határidő, kelte/készítő, részletes
  vasalat/furat, lap- és tokoldali szín/minta, tokborítás és profilgeometria
  jelenleg nem tárolható veszteségmentesen az order-detail DTO-ban. Ezeket nem
  szabad singular `surface`, generikus note, `SIDE_A/B`, casing role vagy
  handing értékké lapítani; teljes strukturálásig dokumentumevidence maradnak.
- A köztes 620–940 px szélességet külön tesztelni kell: a mobil és desktop
  szélsőérték közötti header is tud dokumentumszintű overflow-t okozni.
- Ez a szelet nem használt új Nexus-claimet vagy faipari inferenciát. A RAG
  retrieval minősége ezért nem workflow- vagy UI-authority.

## Reszponzív office UX tartós szabályai — 2026-08-01

- Az irodai alkalmazás három külön interakciós módja: telefon `<=620 px`,
  tablet `621–1023 px`, PC `>=1024 px`. A breakpoint csak elrendezést és
  információsűrűséget változtat; ugyanaz az exact-revíziós detail komponens és
  ugyanaz a backend-authority marad.
- Telefonon az első képernyő információs költségvetése szűk: projekt/revízió,
  következő teendő, kritikus eltérés és rövid pozíciósorok. A teljes részlet
  csak tételválasztás után látszik, egyszerre egy pozícióval. Kritikus,
  pending, invalid vagy authority-hiányos üzenetet reszponzív CSS nem rejthet
  el és nem rövidíthet puszta jelvénnyé.
- Az egykezes telefonos alapmintázat: alsó elsődleges navigáció, hüvelykujjal
  elérhető fix Vissza gomb, minimum 44–48 px érintési cél, Escape/kattintás
  utáni fókusz-visszaadás és safe-area hely. A ritkább route-ok, téma és szerep
  a `Továbbiak` panelbe kerülnek, de az aktív route-nak mindig pontosan egy
  `aria-current` jelölése van.
- Tableten a lista és részlet együtt használható, de a részlet olvashatósága
  elsőbbséget élvez a sűrűséggel szemben. A `SIDE_A` és `SIDE_B` külön fizikai
  oldal marad; a `FIXED`/`ADJUSTABLE` tokborítás-szerepből továbbra sem
  következik oldal, pánt vagy nyitásirány.
- Pozíciós szerkesztési affordance csak latest, valid, nyugalmi queryállapotú,
  jogosult `DRAFT` revízión jelenhet meg. REVIEW, APPROVED, historical,
  invalid és read-only szerep fail-closed; ezt a hívóoldali propot renderelő
  tesztmockkal kell regressziósan védeni.
- A helyi `UX-REFERENCE-RETROFIT-001` a három mód állandó UX-próbája. A benne
  levő 7 alkatrész- és 4 műveletsor explicit fixture-adat, nem formula, RAG-
  következtetés vagy gyártási kiadás. A szélesebb mobil helyszíni feladatból a
  fotó/dokumentum-hozzárendelés és dirty-state helyreállítás továbbra is nyitott.

## Mobil detail-grid invariant — 2026-08-01

- Ha telefonon a lista `display:none` lesz detail módban, a szülő gridet is
  kötelező egyetlen `minmax(0, 1fr)` oszlopra állítani. A rejtett grid-elem
  önmagában nem írja felül a desktop/tablet kétoszlopos template-et; enélkül a
  részlet az első minimumoszlop szélességén marad és üres helyet hagy.
- A regressziós mérés nem csak dokumentum-overflow: a detail és workspace
  bounding widthjének is egyeznie kell 320–620 px között. 621 px-től a tablet
  lista+részlet elrendezése szándékosan kétoszlopos.

## Fejlesztői konzol és statikus ikon — 2026-08-01

- A React DevTools ajánlása dev-mode `info`, nem warning/error és nem szabad
  alkalmazáskóddal elnyomni. A minőségi kapu a tényleges warning/error
  bejegyzésekre és hibás hálózati erőforrásokra vonatkozik.
- A favicon mindig explicit, repositoryban verziózott Vite public asset legyen.
  Browser-kapu: friss lap, deklarált `rel=icon`, 200 válasz, helyes MIME és
  nulla warning/error; build-kapu: a public és dist asset hashazonos.

## Sales-forrás és gyártási dokumentumlánc — 2026-08-01

- A Sales intake, a műszaki/komponens eredmény, a műveletterv, a generált
  dokumentumcsomag és az immutable gyártási kiadás öt külön provenance- és
  authority-réteg. Az egyik elkészülte nem lépteti automatikusan a következőt.
- A 26133 közvetlen evidence szerint `01–06` az exact ajtópozíció-lineage; a
  lábazat és accessory nem ajtópozíció, a Mennyiségek és Munkamenet pedig
  projektaggregátum. Pozíciókód revízión belül kanonikusan egyedi legyen.
- Hónap-pontosságú Sales-határidőből nem készülhet kitalált nap. Tartós cél a
  `DAY | MONTH | UNRESOLVED` union nyers szöveggel; a legacy DateTime csak DAY
  projection lehet.
- Kliensoldali cm→mm konverzió megőrizheti a numerikus értéket, de nem teljes
  source-lineage. Production cél: raw érték+egység, backend-normalizált egész
  mm és verziózott conversion rule az approval hashben.
- Az egyetlen örökölt `surface` csak közös nyers forrásszöveg. Eltérő ajtólap-
  oldal, tok, `FIXED`/`ADJUSTABLE` tokborítás és blende felület nem lapítható
  bele; a `SIDE_A/B` és casing role külön tengely marad, inference nélkül.
- A jelenlegi `X-Role`/`X-Principal` nem hitelesítés. Production Sales PII POST
  csak OIDC principal, szerver-RBAC, idempotency és stabil concurrency után
  nyitható meg. A production frontend addig statikusan és handler-szinten zárt.
- A 26133 outputok legacy artifact-evidence-ek, nem source `OrderDocument`,
  VERIFIED snapshot vagy production release. Preview/review/package/content
  külön DSORD-17 contract és auditált hozzáférés tárgya.
- Ez a döntés közvetlen projekt-PDF evidence-ből származik. RAG nem adott
  workflow-, méret-, template-, side-, handing- vagy jóváhagyási authorityt.
