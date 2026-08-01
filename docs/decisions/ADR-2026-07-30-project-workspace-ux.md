# ADR — Projektmunkatér UX és állapotlevezetés

**Dátum:** 2026-07-30  
**Státusz:** elfogadott  
**Érintett terület:** Doorstar frontend, projekt- és munkamenet-kezelés

**Design alap:** `docs/Doorstar-design-system-standalone.html` — a
papír/grafit felületek, IBM Plex/Source Serif tipográfia, műszaki kék és
szemantikus `ok` / `warn` / `danger` állapotszínek ennek a dokumentumnak a
tokenjeit használják.

## Döntés

## UI-határ

Az alkalmazás két tudatosan különböző felületet tart fenn:

| Felület | Felhasználó és feladat | Vizuális nyelv |
| --- | --- | --- |
| Irodai adatkezelés | Sales, felmérés, műszaki előkészítés, rendelési revízió, import, projektregiszter és tervezési segédlap | A `Doorstar-design-system-standalone.html` dokumentum papír/grafit, adatlap-központú rendszere |
| Üzemi tábla | Állomáskezelő napi végrehajtása, heti tábla, kanban és terhelés | A meglévő marker-board: kézírás, erős állomásjelzések, sötét króm |

Ez nem két témaválasztó ugyanarra az oldalra. Az útvonal és a feladat határozza
meg a felületet: az irodai `ProductShell` nem örökli az üzemi táblás esztétikát,
az `AppShell`-es Board/Kanban/Terhelés pedig nem kap irodai adatlap-UI-t.

Az irodai projektfolyamat a dokumentált Doorstar-láncot követi:

`Sales → dokumentumátadás → felmérés → műszaki előkészítés → review/approval → alkatrészképzés → műveleti terv → tervezés → kiadás → 6 üzemi stage → kiszállítás/beépítés`.

A `/projects/:key` útvonal kizárólag projektcockpit: törzsadat, folyamatkapuk,
blokkolók, forráskapcsolatok és következő engedélyezett munkatér. A korábbi
epik/task- és mennyiségi szerkesztő külön
`/projects/:key/work-session` útvonalra került, „örökölt munkalap” jelöléssel.
Ez megakadályozza, hogy a kézi táblafeladat-kezelés a hivatalos rendelési
folyamat részeként jelenjen meg.

A projektlista nem kap külön, frontend-oldali projektállapotgépet. A
projektmunkatér a már létező `ProjectCard` gyártási összesítését és az aktuális
`ProductionOrderCard` revíziót fűzi össze stabil `projectKey` alapján. Ebből
egy megjelenítési állapot és egyetlen elsődleges következő lépés vezethető le:

| Megjelenítési állapot | Forrás | Elsődleges cél |
| --- | --- | --- |
| Figyelmet kér | DRAFT / REVIEW rendelési revízió | rendelés vagy felmérés |
| Tervezésre vár | jóváhagyott rendelés, hiányzó verziózott terv | projektcockpit |
| Gyártás alatt | van nyitott korábbi gyártási lépés | elkülönített munkalap |
| Kiszállításra kész | minden kiadott lépés kész vagy `SHIPPING_READY` | projekt részletei |
| Munkamenet hiányzik | rendelés nélküli üres projekt | elkülönített munkalap |

Az elsődleges lépés előbb az adatminőségi/rendelési kaput oldja fel, és csak
utána vezeti a felhasználót a gyártási munkalapra. Emiatt egy
`SURVEY_PENDING` projekt nem kaphat félrevezető „munkamenet kiadása” akciót.

Az üres projekt létrehozása megmarad a termeléstervezési kivételes útnak; az
új ügyfélmunka kezdőpontja a Sales rendelésfelvétel. A felület ezt explicit
szöveggel jelzi.

## Jogosultság

A projekt munkamenetének szerkesztését a meglévő szerepkörmátrix alapján a
`production_planner`, `administrator` és átmenetileg a kompatibilis `vezeto`
szerep végezheti. Ez kliensoldali UX-védőháló a jelenlegi `X-Role` átmenetben;
nem helyettesít szerveroldali jogosultság-ellenőrzést.

## Következmények és ellenőrzés

- Nem keletkezik párhuzamos tárolt projektállapot vagy kliensoldali ütemezés.
- A keresés munkaszámra, projektkulcsra, projektnévre és megrendelőre is
  működik; az állapotszűrő csak a levezetett nézetet szűri.
- A levezetési és jogosultsági szabályok tiszta, unit tesztelt modellben
  (`src/uzemi-tabla-web/src/lib/projectWorkspace.ts`) élnek.
- A korábbi közvetlen munkamenet- és lépéskiadás fail-closed marad. Üzemi
  feladat csak jóváhagyott rendeléshez, verziózott alkatrész- és műveleti
  tervhez, valamint változatlan `IssuedWorkPackage` rekordhoz kötött
  backend-szerződés után engedélyezhető.
- A felmérési tényadat és a műszaki katalógusdöntés külön útvonalon él:
  `/survey` nem szerkeszt anyagot/vasalatot/megmunkálást, ezek a
  `/technical-preparation` munkatér feladatai.
- A folyamatkapuk és műveleti sorok kattintható részletezők, de a szerkesztés
  mindig az adatot birtokló munkatérre vezet. A cockpit nem duplikál
  rendelési, felmérési vagy műszaki űrlapot.
- A ComponentSnapshot rekordok kivételt képeznek annyiban, hogy az immutable
  requirements és lineage helyben is olvasható, valamint a backend által
  engedélyezett reviewer ugyanitt adhat `VERIFIED` vagy `REJECTED` döntést.
  Ez review, nem kiadás; a felület nem kínál release-akciót.
- A rendelési pozíciók kattintásra egy Pozíció 360° master–detail nézetben
  nyílnak meg. Ez a felmért tény, műszaki döntés, evidence,
  dokumentumverzió, gyártási tétel és komponensszármazék közös olvasási
  projekciója; írni továbbra is csak az adatgazda felmérési vagy műszaki
  munkaterén lehet.
- A dokumentumrekordok megváltoztathatatlan verziócsaládként jelennek meg.
  Új rekord a korábbi verziót `supersedesDocumentId` kapcsolattal követi; a
  közvetlen pozíciókapcsolás append-only és külön megerősítést kér. Unlink
  vagy dokumentum-release művelet addig nem kerül a felületre, amíg nincs
  hozzá explicit backend-szerződés és autoritatív kiadási aggregátum.
- A projekt és rendelés összekapcsolásánál egy lekérdezési hiba nem
  helyettesíthető üres eredménnyel. A kliens fail-closed hibaállapotot mutat;
  csak a sikeres `null` válasz vagy az explicit 404 jelenti azt, hogy a
  projekthez valóban nincs rendelés.
- A COMPONENTS kapu csak approval content hash, snapshot-séma és aktív
  kalkulátorprofil egyezésekor `DONE`. A legacy műveleti dátum nem
  `PlanningProposal`, a legacy task nem `IssuedWorkPackage`, a
  `SHIPPING_READY` pedig nem átadás-átvételi csomag.
