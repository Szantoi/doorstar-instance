# Doorstar faipari terminológiai audit és megfeleltetési szótár

**Verzió:** 1.0  
**Dátum:** 2026-07-31  
**Hatókör:** Sales → felmérés → műszaki előkészítés → kalkuláció →
gyártás → csomagolás → kiszállítás/beépítés, valamint legacy import, API és UI  
**Állapot:** bevezethető terminológiai baseline; a `REVIEW` tételekhez
Doorstar-szakmai döntés vagy profil-/BOM-bizonyíték szükséges  
**Gépi, import-/UI-kritikus részhalmaza:**
`doorstar-faipari-terminology.v1.json`

## Vezetői összefoglaló

A Doorstar működési logikája nagyrészt követi az egyedi épületasztalos
gyártás természetes adatútját: az ügyféligényből és Sales-dokumentumcsomagból
felmérés, majd gyártmány- és gyártás-előkészítés, alkatrész- és műveleti terv,
üzemi végrehajtás, csomagolás és logisztikai átadás lesz. A rendszer külön
kezeli a falnyílás- és ajtólapméreteket, a revíziókat és a forrásbizonyítékot;
ez szakmailag és adatkezelésileg jó irány.

A szóhasználat viszont jelenleg négy nyelvi réteget kever:

| Réteg | Értékelés | Példa |
| --- | --- | --- |
| Faipari szaknyelv | Többnyire megfelelő | ajtólap, falnyílás, alkatrészjegyzék, szabásjegyzék, megmunkálás |
| Doorstar-belső szaknyelv | Használható, ha definíció és alias tartozik hozzá | DSMR, Gyártásmegrendelés, Kiíró, FNY, LAP |
| Szoftveres domainnyelv | Szükséges, de nem mindig jó műhely-UI felirat | Project, OrderRevision, ImportRun, ComponentSnapshot |
| Örökölt vagy kétértelmű nyelv | Javítandó / review-köteles | mozgó oldal, borítás, felület, falkezelés, Epic, Task, BKM, TOK |

### Legfontosabb következtetések

1. A hatlépcsős modell **Doorstar makrofolyamat**, nem a teljes faipari
   technológia egyetemes felosztása. Az egyes műveletek és állomások ezen
   belül külön műveleti tervet igényelnek.
2. A régi domainleírásban a csiszolás tévesen a megmunkálás, a fúrás pedig
   tévesen a felületkezelés példája volt. A csiszolás jellemzően
   felület-előkészítés; a fúrás forgácsoló megmunkálás.
3. A **kiszállításra kész** csak készültségi állapot. Nem bizonyítja a
   kiszállítást, beépítést, átadás-átvételt vagy a munka teljesítését.
4. A **falpanel** és a **bútorfront** valós, külön gyártandó terméktétel lehet;
   nem ajtópozícióra írt egyszerű „falkezelés”. A szakirodalmi gyűjtőfogalom
   a falborítás, a Doorstar-termékosztály maradhat falpanel.
5. A **fix/állítható tokborítási szerep** nem azonos a fizikai A/B oldallal,
   a pánt-/zároldallal vagy a jobbos/balos oldalassággal. Az örökölt „mozgó”
   kereshető alias, de feliratként az **állítható** használandó.
6. A `BKM_FIX`, `BKM_MOVING` és `TOK` gyártási méretjelölések pontos
   alkatrész-határa helyi profilrajz vagy jóváhagyott BOM nélkül nem oldható
   fel biztonságosan. Kereshető nyers adatként megőrzendők, automatikus
   célmező-megfeleltetésük tilos.
7. A régi C# `ProductionJob`/eseményes domainleírás célmodell, miközben a
   jelenlegi futó backend TypeScript + Express + Prisma. A dokumentációban
   ezt külön jelölni kell, mert egy régi eseménynév nem bizonyít aktuális
   runtime működést.

## Minősítések

| Kód | Jelentés | Rendszerbeli szabály |
| --- | --- | --- |
| `CANONICAL` | Elfogadott szakmai Doorstar-fogalom | UI-ban és dokumentációban elsődleges |
| `DOORSTAR_LOCAL` | Érvényes, definiált belső kifejezés | Alias és magyarázat mellett használható |
| `SYSTEM_TERM` | Szoftveres/DDD fogalom | Kódban maradhat; emberi UI-ban magyar címke kell |
| `REVIEW` | Jelentése forrás- vagy termékfüggő | Nyers érték őrzendő; automatikus következtetés tilos |
| `DEPRECATED` | Örökölt vagy félrevezető felirat | Csak keresési/import alias; új adatban ne keletkezzen |

## 1. Üzleti, dokumentációs és rendszerfogalmak

| Jelenlegi/örökölt kifejezés | Kanonikus Doorstar-fogalom | Angol vagy kódbeli híd | Minősítés | Pontos használat és határ |
| --- | --- | --- | --- | --- |
| Projekt | Projekt | `Project` | `SYSTEM_TERM` | Egy új ügyféligény/megrendelés mindig új projekt, akkor is, ha a megrendelő azonos. Nem azonos az ügyféllel és nem újrahasznosítható korábbi beépítéshez. |
| Megrendelés | Ügyfélmegrendelés; rendszerben rendelés-/revíziókonténer | `ProductionOrder` | `REVIEW` | A jelenlegi kódnév nem jelent gyártásra kiadást. A vevői igényt, a Sales átadódokumentumot és a későbbi auditált gyártási kiadást külön kell nevezni. |
| Gyártásmegrendelés, GYÁRTÁSMEGRENDELÉS | Sales gyártásmegrendelés | Sales-to-workshop handoff | `DOORSTAR_LOCAL` | A Sales műhelynek átadott elsődleges dokumentuma. Kiinduló forrás, nem automatikusan végleges gyártásdokumentáció; a felmérés felülvizsgálhatja a műszaki értékeket. |
| Gyártásmegrendelő.xlsm | Gyártásmegrendelő munkafüzet | legacy intake workbook | `DOORSTAR_LOCAL` | Projekt- és rendelési kiinduló adatok legacy rögzítési felülete. Makró futtatása importkor tilos. |
| Felmérés | Helyszíni felmérés | site survey | `CANONICAL` | A beépítési környezet és a műszaki adatok ellenőrzése/véglegesítése; nem dokumentumátvételi adminisztráció. |
| Műszaki előkészítés | Műszaki előkészítés | technical preparation | `CANONICAL` | A jóváhagyható gyártmány- és gyártási adatok kialakítása, forrásokkal és revízióval. |
| Gyártmánydokumentáció | Gyártmánydokumentáció | product documentation | `CANONICAL` | A termék meghatározása: műszaki leírás, rajz, szerkezet, méretek és kapcsolódó jegyzékek. |
| Gyártásdokumentáció | Gyártásdokumentáció | manufacturing documentation | `CANONICAL` | Az előállítás végrehajtási adatai: anyagok, technológia, alkatrész-/szabás-/műveleti adatok és kiadások. Nem azonos egyetlen Sales PDF-fel. |
| Műszaki leírás | Műszaki leírás | technical description | `CANONICAL` | A termék fő tulajdonságainak, befoglaló méretének, anyagának, felületének és szerkezeti felépítésének tömör leírása. |
| Alkatrészlista | Alkatrészjegyzék | bill/parts list | `CANONICAL` | A gyártandó alkatrészek azonosított, mennyiségi és méretadatait tartalmazó jegyzéke. BOM lehet tágabb rendszerfogalom. |
| Szabászati lista | Szabásjegyzék | cutting list | `CANONICAL` | A szabászathoz kiadott alap-/szabászati méretek és mennyiségek; nem azonos az alkatrész készméretével. |
| Műveletsor, folyamat | Műveleti terv | routing / operation plan | `CANONICAL` | A végrehajtandó műveletek sorrendje, erőforrása, normája és függősége. Nem azonos a hat makroállapottal. |
| Munkamenet | Gyártási folyamat; illetve munkamenet csak UI-session értelemben | production process / work session | `REVIEW` | Ne jelentsen egyszerre 17 műveletet, 6 makroszakaszt és egy felhasználói munkaszakaszt. A kontextus szerint pontos címke kell. |
| Kalkulátor | Alkatrész- és méretkalkuláció | calculator | `DOORSTAR_LOCAL` | A termékkonfigurációból alkatrészigényt, kész- és szabászati méretet képező réteg; nem ütemező és nem forrás-authority. |
| Folyamatok | Gyártástervezési/művelettervezési munkafüzet | planning workbook | `DOORSTAR_LOCAL` | Műveleteket, normaidőt, függőséget és erőforrásigényt készít elő. A fájlnév nem általános domainfogalom. |
| Kiíró | Üzemi kiadás | issued work package | `DOORSTAR_LOCAL` | A jóváhagyott gyártási információ műhelynek történő, verziózott kiadása. Nem újratervezés. |
| Rendelésverzió | Rendelésrevízió | `OrderRevision` | `SYSTEM_TERM` | Egy rendelés változatlan történeti állapota. UI-ban a „revízió” szakmailag pontosabb a puszta verziónál. |
| Pozíció | Rendelési pozíció / ajtópozíció | `OrderPosition` | `SYSTEM_TERM` | Egy azonosítható ajtóhely/ajtóegység adatsora. Nem általános térbeli koordináta. |
| Dokumentum | Dokumentumhivatkozás és dokumentumverzió | `OrderDocument` | `SYSTEM_TERM` | Relatív forráshivatkozás és verzió/provenance; nem bináris másolat és nem helyi abszolút út. |
| Bizonyíték | Forrásbizonyíték | `Evidence` | `SYSTEM_TERM` | Lokátorral, nyers és normalizált értékkel rögzített állítás; önmagában nem jóváhagyott műszaki adat. |
| Epic | Gyártási tétel vagy alkatrészcsoport | `FlowEpic` | `SYSTEM_TERM` | Kernel/kódban maradhat. Műhely-UI-ban az „epic” agilis jelentése miatt félrevezető; a tényleges csoport szerepe szerinti magyar címke kell. |
| Task | Műveletpéldány vagy munkakártya | `Task` | `SYSTEM_TERM` | Kódban maradhat. UI-ban a végrehajtott műveletet vagy kiadott munkakártyát nevezze meg, ne általános „feladat” legyen. |
| Gyártóilap | Gyártói/gyártási adatlap | reviewed manufacturing derivation | `DOORSTAR_LOCAL` | Felülvizsgált származtatott gyártási forrás; nem írhatja felül bizonyíték nélkül a Sales- vagy felmérési authorityt. |

## 2. Ajtó-, tok- és kapcsolódó termékfogalmak

| Jelenlegi/örökölt kifejezés | Kanonikus Doorstar-fogalom | Angol híd | Minősítés | Pontos használat és kerülendő összemosás |
| --- | --- | --- | --- | --- |
| Ajtó | Ajtóegység, ajtólap vagy ajtótípus — a jelentés szerint | doorset / door leaf | `REVIEW` | Alkatrész- vagy méretszinten a puszta „ajtó” nem elég pontos. |
| Ajtóegység | Ajtóegység | doorset | `CANONICAL` | Az együtt kezelt ajtólap, tokszerkezet és szükséges vasalatok/tömítések. |
| Ajtószárny | Ajtólap | door leaf | `CANONICAL` | Az ajtó nyílást lezáró mozgó eleme. Az „ajtószárny” elfogadott alias; rendszermezőként az ajtólap legyen elsődleges. |
| Tok | Ajtótok / tokszerkezet | door frame | `CANONICAL` | Az ajtólapot fogadó, falnyíláshoz rögzített keretrendszer. Ha alkatrészszint számít, a puszta „tok” pontosítandó. |
| Tokmag, tokbélés | Tokmag / tokbélés | lining / lining board | `REVIEW` | Az átfogó tok központi, falkávát burkoló része. A két szó és a Doorstar BOM pontos határa profilrajzzal jóváhagyandó. |
| Borítás | Tokborítás vagy felületképzés | casing/architrave or finish | `DEPRECATED` | Minősítő nélkül tiltott domainmező: fizikai tokborítást és dekor/felületet is jelenthet. |
| Fix borítás | Fix tokborítás | fixed casing/architrave | `CANONICAL` | A tokszerkezethez szerkezetileg rögzített tokborítási szerep. Nem „fix tok”, nem automatikusan A/B, pánt- vagy falcoldal. |
| Mozgó borítás, mozgó oldal | Állítható tokborítás | adjustable casing/trim | `DEPRECATED` | Keresési/import alias. Az elem a falvastagsághoz állítható, nem az ajtó használatakor mozog. |
| Pántoldali tok | Pántoszlop | hinge jamb | `CANONICAL` | A pántot/pántfogadót hordozó függőleges tokszár. Nem azonos a fix tokborítási szereppel. |
| Zároldali tok | Záróoszlop | strike jamb | `CANONICAL` | A zárfogadót hordozó függőleges tokszár. Nem azonos az állítható tokborítási szereppel. |
| Felső tok | Tokfelső | frame head | `CANONICAL` | A két függőleges tokszárat felül összekötő tokelem; nem az épületszerkezeti áthidaló. |
| Falc, falcos | Falc; falcolt ajtó | rebate; rebated | `CANONICAL` | A lap és tok lépcsős ütköző-/ráfedési geometriája. A „falcolt” legyen a dokumentált alak. |
| Falsíkban záródó | Falc nélküli / síkban záródó, termékprofil szerint | unrebated / flush | `REVIEW` | A „flush” megjelenés és a falcgeometria nem mindig azonos fogalom; profil alapján kell típusosítani. |
| Tapétaajtó | Rejtett tokos / falsíkba simuló ajtórendszer, profilnévvel | concealed-frame / flush door | `REVIEW` | Piaci/terméknév; nem ad önmagában falc-, tok- vagy nyitási geometriát. A `TUT` rövidítéshez helyi katalógusdefiníció kell. |
| Reverz ajtó | Fordított falcú / reverz ajtó | reverse-rebate | `CANONICAL` | Speciális falc- és nyitási rendszer; nem egyszerűen falc nélküli és nem „megfordítható”. |
| Pánt, zsanér | Pánt | hinge | `CANONICAL` | A lapot tokhoz kapcsoló forgó vasalat. A zsanér kereshető alias. |
| Pánttáska | Pántfogadó / pánttáska | hinge receiver | `CANONICAL` | A tokban lévő fogadóelem; nem maga a pánt. |
| Zár | Zártest vagy zárfogadó | lock case / strike plate | `REVIEW` | Alkatrészadatban kötelező megkülönböztetni a lapba épített zártestet és a tokbeli zárfogadót. |
| Üveges | Üvegezett ajtólap | glazed door leaf | `CANONICAL` | Az üvegezés jelenléte. Külön adat kell az üvegre, vastagságra, kivágásra, rögzítésre és szükség esetén biztonsági osztályra. |
| Üvegkivágás | Üvegkivágás | glazing aperture | `CANONICAL` | Az ajtólap megmunkált nyílása; nem azonos az üveg készméretével. |
| Üvegezőléc | Üvegrögzítő léc | glazing bead | `CANONICAL` | Az üveget rögzítő szerkezeti elem; nem általános díszléc. |
| Falpanel | Falpanel; szakmai gyűjtőben falborítási elem | wall panel / wall lining element | `DOORSTAR_LOCAL` | Önálló gyártandó tétel lehet mérettel, anyaggal, felületképzéssel és kapcsolattal. Nem egyszerű ajtópozíció-flag és nem minden falborítás szinonimája. |
| Falburkolat | Falborítás | wall lining / wall cladding | `CANONICAL` | A fal felületét részben vagy egészben borító rendszer gyűjtőfogalma. A Doorstar falpanel ennek egy termékváltozata lehet. |
| Bútor front, frontlap | Bútorfront | furniture/cabinet front | `CANONICAL` | Bútor látható, nyíló vagy rögzített fronteleme; külön gyártandó tétel. Nem ajtólap és nem falpanel. |
| Blende | Blende / takaró-kiegyenlítő elem, jóváhagyott típussal | filler/fascia/cover element | `REVIEW` | Helyi jelentése geometria- és beépítésfüggő. Takaróléccel, tokborítással vagy falpanellel automatikusan nem azonosítható. |
| Kiegészítő | Rendelési kiegészítő tétel | `OrderSupplementaryItem` | `SYSTEM_TERM` | A rendeléshez tartozó, nem feltétlen önállóan gyártott kiegészítő. Nem azonos a `ManufacturedItem` életciklusával; a konkrét típus és bizonyíték kötelező. |

## 3. Méret-, oldal- és megjelenésfogalmak

### Kötelező méretsorrend

Minden többdimenziós Doorstar-adat és UI-felirat sorrendje:

> **szélesség × magasság × vastagság/mélység, mm**

A harmadik dimenzió nevét az objektum szerint kell megadni. Ajtólapnál
**vastagság**, falnyílásnál/falkávánál **falvastagság vagy mélység**. Egy
általános `width × height × depth` címke nem elegendő.

| Jelenlegi/örökölt kifejezés | Kanonikus Doorstar-fogalom | Kód/angol híd | Minősítés | Pontos használat és határ |
| --- | --- | --- | --- | --- |
| FNY | Falnyílásméret | `openingWidthMm`, `openingHeightMm`, `openingDepthMm` | `DOORSTAR_LOCAL` | Helyi rövidítés. A harmadik adat a kész/értelmezett falvastagság vagy falkávamélység, nem ajtólapvastagság. A nyers/kész állapotot jelölni kell. |
| Falnyílás | Nyers falnyílás vagy kész falnyílás | structural/finished opening | `CANONICAL` | Az épületszerkezet nyílása, amelybe a tok kerül. Az állapotjelző nélkül mért adat review-köteles. |
| Falkáva | Falkáva | wall reveal | `CANONICAL` | A falnyílás mélységi oldalfelülete; nem falfül és nem ajtótok. |
| Falvastagság | Kész falvastagság | finished wall thickness | `CANONICAL` | A két végleges falsík közötti, több ponton mérendő méret. Nem azonos a tok állítási tartományával. |
| LAP | Ajtólapméret | `doorWidthMm`, `doorHeightMm`, `doorThicknessMm` | `DOORSTAR_LOCAL` | Helyi rövidítés, ha a forrás fejléc/struktúra egyértelműen ajtólapot jelöl. Nem ajtóegység- vagy falnyílásméret. |
| Tokméret | Tokmag-, tok-kül- vagy névleges méret | frame/lining dimension | `REVIEW` | A „tokméret” önmagában nem elég pontos; a mért objektum és referenciaél kötelező. |
| Befoglaló méret | Befoglaló méret | overall dimension | `CANONICAL` | A termék legnagyobb külső kiterjedése az adott referencia szerint. Nem automatikusan falnyílás vagy szabászati méret. |
| Névleges méret | Névleges méret | nominal size | `CANONICAL` | Termék-/rendszerazonosító méret; nem feltétlen tényleges gyártási vagy mért méret. |
| Készméret | Alkatrész készmérete | finished component size | `CANONICAL` | A megmunkált, gyártás szerint kész alkatrész mérete; mérési állapot és felület/élhatás szükség szerint része a szabálynak. |
| Szabászati méret | Szabászati/alapméret | cutting blank size | `CANONICAL` | A szabászathoz kiadott kiinduló méret. Képletből csak verziózott, jóváhagyott szabály képezheti; forrás linkből nem másolható. |
| Szerelési hézag | Szerelési hézag | installation joint | `CANONICAL` | A falnyílás és tok közötti beállítási/rögzítési tér; nem ajtólap működési hézag. |
| Falchézag | Működési hézag | operating clearance | `CANONICAL` | Az ajtólap és tok közötti szükséges működési tér; nem szerelési hézag. |
| Szabad nyílás | Szabad átjárási méret | clear opening | `CANONICAL` | A használható közlekedési nyílás; nem falnyílás, névleges méret vagy tokbelméret. |
| Nyitásirány | Oldalasság + nyitás térbeli iránya + konvenció | `handing`, `opensIntoSide`, `handingConvention` | `REVIEW` | Egyetlen szabad szöveg nem elég. A jobbos/balos pánthelyzetet és azt, melyik térbe nyílik a lap, külön kell tárolni. |
| Jobbos/balos | Oldalasság | left/right handing | `CANONICAL` | Csak megnevezett megfigyelési/jelölési konvencióval teljes adat. |
| A oldal / B oldal | Fizikai faloldal A/B | `SIDE_A`, `SIDE_B` | `SYSTEM_TERM` | Stabil térbeli identitás, lehetőleg helyiséghivatkozással. Nem hordoz fix/állítható, pánt/zár vagy jobbos/balos jelentést. |
| Fix oldal / mozgó oldal | Fix/állítható tokborítási szerep | `FIXED`, `ADJUSTABLE` | `DEPRECATED` | Csak jelen lévő tokborítás szerepe. Fizikai oldal ebből csak profilbizonyítékkal kapcsolható. |
| Felület | Felületképzés + szín/dekor + hordozó + célfelület | finish/appearance specification | `REVIEW` | Az egyetlen szövegmező nem teríthető automatikusan ajtólapra, tokra, fix és állítható borításra. |
| Felületkezelés | Felületkezelési technológia | surface treatment process | `CANONICAL` | Technológiai művelet/anyag, például pácolás, alapozás, lakkozás vagy festés. Nem azonos a színnel, fóliadekorral vagy kész megjelenéssel. |
| Felület-előkészítés | Felület-előkészítés | surface preparation | `CANONICAL` | Például javítás és csiszolás a felületkezelés előtt. Makroszakaszként a felületkezeléssel együtt kezelhető, de műveletként külön maradjon. |
| Fóliás, furnér, festett | Felületképzés típusa | foil / veneer / painted finish | `CANONICAL` | A technológia/hordozó típusa; külön érték a gyártó/dekor-kód, szín, fényesség, textúra és célfelület. |
| FixOldal / MozgoOldal felület | Forrás szerinti oldal- vagy komponensfelület | source appearance evidence | `REVIEW` | A nyers mezőnév és lokátor megőrzendő. Profil- és oszlopjelentés nélkül nem tölthető általános `surface` mezőbe és nem azonosítható automatikusan `SIDE_A/B`-vel. |

## 4. Gyártási folyamat és állapotok

| Jelenlegi kifejezés | Kanonikus UI-felirat | Minősítés | Szakmai határ |
| --- | --- | --- | --- |
| 6-STAGE workflow | Hatlépcsős Doorstar gyártási makrofolyamat | `DOORSTAR_LOCAL` | Áttekintési és kiadási állapotmodell; a részletes technológiai/műveleti tervet nem helyettesíti. |
| Szabászat/Előgyártás | Szabászat / előgyártás | `CANONICAL` | Alapanyag vagy félkész elem méretre darabolása és az ide sorolt előgyártás. A CNC csak akkor ide tartozik, ha ténylegesen szabási műveletet végez. |
| Megmunkálás | Megmunkálás | `CANONICAL` | Forgácsoló/alakító műveletek, például marás, fúrás, csapozás és profil-/élmegmunkálás. A csiszolás nem automatikusan ide tartozik. |
| Felületkezelés | Felület-előkészítés és felületkezelés | `CANONICAL` | A Doorstar makroszakaszban együtt kezelheti a csiszolást és a bevonatképzést, de a műveleteket és normákat külön kell azonosítani. A fúrás nem ide tartozik. |
| Összeszerelés | Összeállítás és szerelés | `CANONICAL` | Alkatrészek egységgé építése, vasalat- és kapcsolódó szerelés a műveleti terv szerint. Nem feltétlen csak „ajtólap + tok összerakás”. |
| Csomagolás | Csomagolás | `CANONICAL` | Termékvédelem, egységképzés, jelölés és a kiadáshoz szükséges csomagadat. A „paknizás” maradhat műhelyalias, nem elsődleges rendszerfelirat. |
| Kiszállítható (örökölt felirat) | Kiszállításra kész | `DEPRECATED` | Készültségi állapot a csomagolás/ellenőrzés után. Nem bizonyít tényleges kiszállítást, raktárba vételt, beépítést vagy átadást. |
| Kiszállításra megjelölés | Kiszállításra készre jelentés | `SYSTEM_TERM` | Állapotátmenet/auditált művelet, nem önálló faipari technológia. A Prisma-kód kompatibilitásból maradhat. |
| Kiszállítás | Kiszállítás | `CANONICAL` | Tényleges logisztikai esemény, időponttal és szükség szerint átvevővel/bizonylattal. |
| Beépítés | Helyszíni beépítés | `CANONICAL` | A termék helyszíni szerelése és beállítása; külön esemény a kiszállítástól. |
| Átadásátvétel | Átadás-átvétel | `CANONICAL` | Dátummal és jogosult átvevő/aláírás vagy egyenértékű explicit ténnyel igazolt esemény. Üres sablon vagy előnyomott „Kész” nem bizonyítja. |
| Körfűrész, CNC, Bürkle, Csiszoló, Fújó, Asztalos | Munkaállomás / gép / szakmai erőforrás | `DOORSTAR_LOCAL` | Ezek erőforrásnevek, nem műveletnevek. A művelet dönti el a szakmai tartalmat; egy gép neve önmagában nem univerzális stage-besorolás. |
| Egyéb | Konkrét munkaállomás vagy művelet | `DEPRECATED` | Gyűjtőállomásként nem hordoz szakmai jelentést. Különösen nem szabad automatikusan „Csomagolás”-nak tekinteni minden ide kerülő tételt. |
| Száll./Kész | Kiszállításra kész | `DEPRECATED` | Rövid műhelyalias. UI-ban és riportban a teljes, egyértelmű állapotnév használandó. |

## 5. Legacy rövidítések és importmegfeleltetés

| Forráskód / mező | Biztonságos jelentés | Automatikus cél | Review-szabály |
| --- | --- | --- | --- |
| `DSMR` + ötjegyű azonosító | Doorstar belső munkaszám-/projektkulcs-jelölt | `Project.key`, ha a forrás és csomagkapcsolat egyértelmű; `Project.num` külön nullable mező | Egy ötjegyű szám önmagában nem munkaszám; fájlnév–útvonal konfliktus review. |
| `FNY` | Falnyílásméret a hitelesített forrásstruktúrában | nyitásszélesség, -magasság és dokumentált falmélység/-vastagság | Nyers/kész állapot, mértékegység és méretsorrend ellenőrzendő. |
| `LAP` | Ajtólapméret a hitelesített forrásstruktúrában | ajtólap szélesség, magasság, vastagság | Csak explicit fejléc/mezőkapcsolattal; nem következtethető az FNY-ből. |
| `BKM_FIX` / `BKM fix` | Fix szerephez kapcsolt gyártási méretjelölés | nincs | Pontos alkatrésznév, referenciaél és képlet/BOM-verzió kell. Addig evidence-ként kereshető. |
| `BKM_MOVING` / `BKM mozgó` | Állítható/mozgóként nevezett szerephez kapcsolt gyártási méretjelölés | nincs | A „mozgó” csak legacy alias; a BKM betűfeloldását és alkatrész-határát nem találjuk ki. |
| `TOK` méretsor | Tokhoz kapcsolt gyártási méretjelölés | nincs | Nem dönthető el automatikusan, hogy tokmag, tokborítás, tokszár vagy teljes befoglaló méret. |
| `FixOldal`, `MozgoOldal` | Forrás szerinti felület-/oldalmező | nincs közvetlen | Nyers érték + sheet/row/cell lokátor; termékprofil és emberi review szükséges. |
| `Falpaneles` | Falpanel-jelölt | `ManufacturedItem(kind=WALL_PANEL)` jelölt evidence-szel | Mennyiség, méret, anyag/felület és konkrét tétel nélkül nem hozható létre ellenőrzött rekord. |
| `Bútorfront`, `front` | Bútorfront-jelölt | `ManufacturedItem(kind=FURNITURE_FRONT)` jelölt evidence-szel | Sablon- vagy kulcsszóelőfordulás nem elég; strukturált, címkézett tételsor kell. |
| `Blende` | Blende-jelölt | típusos `OrderSupplementaryItem` vagy jóváhagyott külön termékosztály | Falpanel, tokborítás vagy takaróléc mezőjébe automatikusan nem térképezhető. |
| `Felület` | Örökölt megjelenési szöveg | legacy `surface` csak kompatibilitásként | Nem teríthető több komponensre/oldalra; célfelület és technológia review. |

### Automatikusan kereshetővé tehető

- kanonikus és örökölt megnevezés/alias;
- nyers mezőérték, forrásdokumentum relatív útja és pontos lokátora;
- munkaszám-jelölt és annak feloldási állapota;
- dokumentumtípus, revízió/hash és keletkezési mód;
- explicit FNY/LAP jelölt méret, mértékegység és méretsorrend;
- falpanel-, bútorfront-, blende-, BKM- és TOK-kulcsszó mint **jelölt**;
- határidő-megfigyelés a saját jelentéstípusával.

### Emberi review nélkül nem képezhető végleges adat

- egyetlen „nyitásirány” szövegből handing és térbeli nyitás;
- fix/mozgó mezőből fizikai `SIDE_A/SIDE_B`, pánt- vagy zároldal;
- általános `surface` mezőből az ajtólap, tok és tokborítások megjelenése;
- BKM/TOK méretből kész- vagy szabászati alkatrészméret;
- falpanel/blende jelzőből kész külön gyártási tétel;
- tervezett vagy szerződéses dátumból tényleges kiszállítás/beépítés;
- üres átadás-átvételi sablonból teljesítési állapot;
- forráshivatkozásból jóváhagyott komponens, mennyiség, anyag vagy képlet.

## 6. API- és UI-megfeleltetés

| Jelenlegi kód/mező | Ajánlott magyar UI | Szakmai megjegyzés |
| --- | --- | --- |
| `Project` | Projekt / munkaszám | A projekt és a munkaszám külön adat maradjon, még ha a főcím együtt mutatja is. |
| `ProductionOrder` | Rendelés / revíziókonténer | A jelenlegi aggregate Sales-piszkozatnál már létrejön, ezért nem nevezhető automatikusan gyártási felhatalmazásnak. A későbbi gyártási kiadás külön `ManufacturingRelease`/üzemi kiadás legyen. |
| `OrderRevision` | Rendelésrevízió | Piszkozat, review és jóváhagyott állapot megjelenítendő. |
| `OrderPosition` | Ajtópozíció | Nem ajtó jellegű elemhez `ManufacturedItem`/`OrderSupplementaryItem`. |
| `openingDepthMm` | Kész falvastagság / falkávamélység (mm) | A tényleges mérési definíciót a felmérési profil adja; „mélység” önmagában kevés. |
| `doorWidthMm × doorHeightMm × doorThicknessMm` | Ajtólap: szélesség × magasság × vastagság (mm) | Ne „ajtóméret” legyen, ha a lapot jelenti. |
| `surface` | Örökölt felületadat | Új UI-ban célfelületre bontott felületképzés/megjelenés szükséges. |
| `wallTreatment` | Kapcsolódó falmegoldás (örökölt) | `WALL_PANEL` hosszú távon külön gyártási tétel; `BLENDE` típusos elem; `NONE` csak explicit felmérési döntés. |
| `openingDirection` | Nyitásadat (örökölt) | Új modellben handing + convention + opensIntoSide. |
| `expectedDelivery` | Vállalt szállítási határidő | A jelenlegi „Várható szállítás” felirat ugyanarra a mezőre félrevezető. A várható/becsült kiszállítás külön `forecastDispatchDate` vagy típusos mérföldkő legyen. |
| `Project.kezdes` | Örökölt kezdési megjegyzés | Nem azonos a tervezett gyártáskezdéssel; új adatban típusos, időbeli minősítővel ellátott mérföldkő kell. |
| `Project.beepites` | Örökölt beépítési megjegyzés | Nem bizonyít tervezett vagy tényleges beépítést. Az időpont és a tényállapot külön mező/esemény. |
| `OrderDeadlineObservation` | Rendelési mérföldkő-megfigyelés | A forrásban talált szerződéses, tervezett vagy megjegyzés jellegű dátum; nem írja felül automatikusan a vállalt dátumot. |
| `ManufacturedItem` | Külön gyártandó tétel | Falpanel és bútorfront saját mérettel, mennyiséggel, anyaggal, felülettel. |
| `OrderSupplementaryItem` | Rendelési kiegészítő tétel | Nem automatikusan önállóan gyártott elem; konkrét típus és forrásbizonyíték megjelenítendő. |
| `ComponentRequirement` | Alkatrészigény | Szabályból képzett, exact-revision elem; forráslink nem tölti ki automatikusan. |
| `ComponentSnapshot` | Jóváhagyott alkatrész-pillanatkép | A kiadáskor rögzített, immutábilis technikai állapot. |
| `SZABASZAT_ELOGYARTAS` | Szabászat / előgyártás | Makroszakasz. |
| `MEGMUNKALAS` | Megmunkálás | Makroszakasz. |
| `FELULETKEZELES` | Felület-előkészítés és felületkezelés | Makroszakasz; műveleti bontás kötelező. |
| `OSSZESZERELES` | Összeállítás és szerelés | Makroszakasz. |
| `CSOMAGOLAS` | Csomagolás | Makroszakasz. |
| `KISZALLITASRA_MEGJELOLES` | Kiszállításra készre jelentés | Állapotátmenet, nem tényleges kiszállítás. |

### Review- és jóváhagyási szókészlet

| Kód | Kanonikus magyar jelentés | Nem jelenti |
| --- | --- | --- |
| `DRAFT` | Szerkeszthető piszkozat | műszakilag teljes vagy gyártásra kiadott |
| rendelésrevízió `REVIEW` | Felülvizsgálatra benyújtott revízió | egy evidence-sor állapota |
| evidence `UNVERIFIED` | Még nem ellenőrzött forrásállítás | elutasított vagy hamis |
| evidence `REVIEW` | Emberi döntést igénylő forrásállítás | jóváhagyott szülőrekord |
| evidence `RESOLVED` | Auditált döntéssel feloldott evidence | önmagában minden esetben „elfogadott”; a resolution tartalma is számít |
| evidence `REJECTED` | Auditáltan elutasított forrásállítás | forrásfájl törlése vagy érvénytelensége minden célra |
| szülő `VERIFIED` | A típusos tétel és kötelező evidence-készlete ellenőrzött | importáló által beállítható bizalmi pontszám |
| rendelésrevízió `APPROVED` | Jóváhagyott, hash-sel/audittal rögzített revízió | automatikus műhelyi kiadás vagy tényleges legyártás |

A `REVIEW` szót a rendszer több külön állapotgépben használja. UI-ban mindig
ki kell írni a tárgyát: **revízió felülvizsgálata**, **forrásbizonyíték
ellenőrzése**, illetve **gyártott tétel ellenőrzése**.

## 7. Bevezetési szabályok

1. A kanonikus kifejezés és az alias külön mező legyen. A régi elnevezés
   kereshető marad, de új UI-adatként ne keletkezzen.
2. Importkor mindig megmarad a `rawLabel`, `rawValue`, relatív forrásút és a
   page/sheet/row/cell/drawing lokátor. A normalizálás nem törli a forrást.
3. A szótár verziózott. Jelentésváltozás új verzió, nem csendes szövegcsere.
4. `REVIEW` és `DEPRECATED` kifejezésből nem képződik automatikusan végleges
   műszaki mező vagy jóváhagyott komponens.
5. A műhelynek szánt UI magyar szakmai címkét mutat; az angol kódnév csak
   fejlesztői/auditnézetben jelenjen meg.
6. Gép/állomás, művelet, makroszakasz és készültségi állapot négy külön
   fogalom maradjon.
7. Határidőből mindig meg kell különböztetni legalább a szerződéses/vállalt,
   a belső tervezett, a várható, a tényleges kiszállítási és a beépítési
   időpontot.

## 8. Bizonyítékok és forráskorlátok

### Doorstar helyi és rendszerforrások

- `DOORSTAR_ADJUSTABLE_INTERIOR_DOOR_TERMINOLOGY_2026-07-30.md` — ajtó-, tok-,
  oldal-, falc-, hézag- és megjelenésfogalmak; szabvány- és gyártói hivatkozások.
- `DOORSTAR_PRODUCTION_DATA_CHAIN_2026-07-28.md` — a négy munkafüzet üzleti
  adatútja, alkatrész-, készméret-, szabászati méret- és műveleti terv-határ.
- `IMPORT_MAPPING.md` és `IMPORT_STORAGE_AND_APP_USAGE.md` — FNY/LAP/BKM/TOK,
  falpanel/bútorfront és bizonyíték-alapú import.
- `prisma/schema.prisma`, `technicalCatalog.json`, `stations.json` — aktuális
  tárolási, katalógus- és makroszakasz-megnevezések.

### Doorstar faipari MCP-tudástár — 2026-07-31-i read-only lekérdezések

Az MCP-találat szakirodalmi támpont, de nem írja felül a Doorstar helyi,
jóváhagyott profilrajzát vagy BOM-ját. A hasonlósági pontszám nem
igazságérték; a gyenge vagy közvetett találatot nem használtuk automatikus
definícióhoz.

| ID | Lekérdezési téma | Találat | Lokátor | Score | Mire használható |
| --- | --- | --- | --- | --- | --- |
| `MCP-01` | falnyílás és ajtóméret | *Épületasztalos szakrajz* | `szega_book_134_oldal_005.jpg`, 5. oldal, chunk 2; továbbá 6. oldal | 0,6272 / 0,5832 | A falnyílás külön méretezett épületszerkezeti adat; befoglaló méret fogalma. |
| `MCP-02` | átfogó tok és állítható borítás | *Épületasztalos szakrajz* | `szega_book_134_oldal_172.jpg`, 172. oldal, chunk 3 | 0,5274 | Tokmag, aljborítás, állítható borítás és takaróléc külön szerkezeti fogalmak. A „fix tokborítás” pontos szókapcsolatot ez nem bizonyítja. |
| `MCP-03` | falpanel/falburkolat | *Épületasztalos szakrajz* | `szega_book_134_oldal_215.jpg`, 215. oldal, chunk 0 | 0,5767 | Szakmai gyűjtőfogalomként fal- és mennyezetborítás, fából készült falborítás. A „falpanel” maga helyi termékcímke marad. |
| `MCP-04` | bútorfront | *Bútorasztalos szakrajz — Ágfalvi–Mészöly* | `szega_book_143_oldal_213.jpg`, 213. oldal, chunk 1; `...153.jpg`, 153. oldal, chunk 2 | 0,5131 / 0,5096 | A „front”, valamint a festett/furnérozott MDF-front bevett bútorszerkezeti fogalom. |
| `MCP-05` | csiszolás és felületkezelés | *Faipari műszaki dokumentáció* | `szega_book_230_oldal_035.jpg`, 35. oldal, chunk 2 | 0,5483 | A felület-előkészítő csiszolás és a felületkezelés megkülönböztethető művelet. |
| `MCP-06` | dokumentációs jegyzékek | *Faipari műszaki dokumentáció* | `szega_book_230_oldal_022.jpg`, 22. oldal; `...024.jpg`, 24. oldal | 0,6117 / 0,5941 | Alkatrészjegyzék, szabásjegyzék, ütemterv és részletes műveletterv külön dokumentumrészek. |
| `MCP-07` | műszaki leírás | *Faipari műszaki dokumentáció* | `szega_book_230_oldal_020.jpg`, 20. oldal, chunks 1 és 3 | 0,5742 / 0,5642 | Befoglaló méret, alapanyag, felületkezelés és szerkezeti felépítés elkülönített tartalom. |
| `MCP-08` | gyártási makrofolyamat | *Faipari gyártásszervezés* | `faipari_gyártásszervezes__171531-1536x2040.jpg`, chunk 0; `...170841...`, chunk 0; `...170719...`, chunk 4 | 0,6583 / 0,6487 / 0,6480 | Összeépítés, csomagolás és a technológiai/nem technológiai folyamatok külön kezelhetők. |
| `MCP-09` | gyártmány- és gyártásdokumentáció | *Faipari műszaki dokumentáció* | `szega_book_230_oldal_007.jpg`, 7. oldal, chunk 0 | 0,5515 | A gyártmánydokumentáció és a gyártásdokumentáció szakmai elkülönítése. |

Gyenge/negatív bizonyíték: az egzakt **blende** keresés legjobb találata
irreleváns volt (`szega_book_143_oldal_010.jpg`, 0,4366); az egzakt **fix
tokborítás** keresés csak állítható borítást adott (172. oldal, 0,4909).
Ezért egyik kifejezés helyi jelentését sem vezettük le találomra a RAG-ból.

#### MCP-lekérdezési napló

Minden sor 2026-07-31-én, `limit=5`, a read-only Doorstar Nexus
`search_knowledge` tooljával, `island=doorstar` válasszal készült. A Nexus
válasza nem adott kollekció-snapshot- vagy embeddingmodell-verziót, ezért a
score csak az adott futás tájékoztató adata; későbbi újrafuttatásnál változhat.
Az alábbi `file_sha256` az upstream metadata által adott 16 hex karakteres
forrásujjlenyomat, nem helyi teljes fájlhash.

| ID | Pontos query | Reprezentatív `file_sha256` |
| --- | --- | --- |
| `MCP-01` | `belső ajtó falnyílás méret ajtólap méret tok méret falvastagság szakkifejezések` | `bd027f0f956c243b` |
| `MCP-02` | `utólag szerelhető átfogó tok fix borítás állítható borítás tokborítás` | `bd027f0f956c243b` |
| `MCP-03` | `falpanel falburkolat faburkolat ajtógyártás` | `bd027f0f956c243b` |
| `MCP-04` | `bútorfront frontlap korpuszbútor szaknyelv` | `523d1b9756ae59d4` |
| `MCP-05` | `faipari felületkezelés csiszolás pácolás alapozás lakkozás` | `5d20ebeb2756fa20` |
| `MCP-06` | `készméret szabászati méret alkatrészjegyzék darabjegyzék műveletterv` | `5d20ebeb2756fa20` |
| `MCP-07` | `szabás méretre vágás CNC marás fúrás élzárás csiszolás felületkezelés` | `5d20ebeb2756fa20` |
| `MCP-08` | `ajtógyártás szabászat megmunkálás felületkezelés összeszerelés csomagolás gyártási folyamat` | `b32e9b027ba32ab5` |
| `MCP-09` | `gyártásmegrendelés munkaszám rendelés pozíció gyártásirányítás` | `5d20ebeb2756fa20` |

### Nyitott szakmai döntések

- A Doorstar `tokmag`, `tokbélés`, `tokfal`, `BKM_FIX`, `BKM_MOVING` és `TOK`
  pontos profil-/BOM-határa.
- A `blende` helyi terméktípusai és az, hogy melyik `ManufacturedItem` vagy
  `OrderSupplementaryItem` osztályba tartoznak.
- A `TUT` termékkód feloldása és a rejtett tokos/falsíkba simuló termékek
  verziózott profiljai.
- A nyitásirány helyi jelölési konvenciója és a legacy értékek biztonságos
  feldarabolása handing + térbeli nyitás mezőkre.
- A `FixOldal`/`MozgoOldal` munkafüzetmezők pontos célfelülete termékprofilonként.

Ezek feloldásáig a rendszer feladata a kereshetőség, a forrásmegőrzés és a
review támogatása — nem a hiányzó szakmai jelentés kitalálása.
