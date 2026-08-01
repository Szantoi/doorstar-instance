# Utólag szerelhető beltéri ajtók — szerkezet és Doorstar-terminológia

**Dátum:** 2026-07-30  
**Állapot:** kutatási baseline; Doorstar-profilrajzokkal és szakirodalmi RAG-gal
finomítandó  
**Cél:** közös szakmai nyelv a felmérési, rendelési, kalkulációs, gyártási,
beépítési, UI-, import- és backend-folyamatokhoz

## Rövid eredmény

A felhasználói pontosítás szakmailag helyes: a tipikus utólag szerelhető,
állítható átfogó toknak két, a fal két homlokfelületéhez tartozó borítási oldala
van.

- A **fix borítás** a tokszerkezethez rögzített vagy azzal együtt összeállított
  oldal.
- Az **állítható borítás** — Doorstar örökölt nyelven „mozgó” borítás — a másik
  faloldalon a tok nútjába/hornyába illeszkedő nyelvvel vagy tollal veszi fel a
  kész falvastagság eltérését.
- A „mozgó” szó nem azt jelenti, hogy ez az elem az ajtó használatakor mozog.
  UI-feliratként ezért az **Állítható borítás** a pontosabb; a „mozgó” kereshető
  örökölt szinonima marad.

A magyar [Borovi gyártói leírása](https://borovi.eu/tok-tipusok/) név szerint
elkülöníti a tok magját, a fix és mobil borítást. A
[PORTA gyártói ismertetője](https://www.porta.com.pl/otworzsiena/drzwi/wybierz-odpowiednia-oscieznice-do-twoich-drzwi)
ugyanezt a felépítést írja le az egyik oldali fix és a másik oldali állítható,
falat átfogó borítással. A német gyártói nyelvben a
[Westag](https://www.westag.de/de/westag-tueren/service/ratgeber/fachbegriffe-finden-im-tueren-glossar/)
`Falzbekleidung` és `Zierbekleidung`, a
[Giese](https://giesetueren.de/tueren/umfassungszarge) rögzített falcoldali és
laza, beillesztett díszborítás néven választja szét a két elemet.

## Forrás- és bizonyossági szintek

A kutatás állításait a későbbi RAG-ban is forrásszinttel kell tárolni:

| Szint | Jelentés | Doorstar-használat |
| --- | --- | --- |
| `NORMATIVE` | Szabvány vagy szabványkiadó hivatalos metaadata | Fogalmi horgony; licencelt szöveg nélkül nem találunk ki definíciót vagy méretet |
| `MANUFACTURER_INSTRUCTION` | Gyártói műszaki katalógus vagy szerelési útmutató | Bizonyítja a szerkezeti mintát; a saját mérete csak az adott rendszerre igaz |
| `DOORSTAR_PUBLIC` | Doorstar hivatalos nyilvános termék-/gyártási leírás | Doorstar-termékirány, de nem feltétlenül minden egyedi termékre teljes |
| `DOORSTAR_LOCAL` | Belső munkafüzet, profilrajz, kalkulátor, BOM vagy jóváhagyott szakmai döntés | A Doorstar tényleges szabályának elsődleges forrása |
| `INFERENCE` | Több forrásból levezetett, még nem jóváhagyott modell | UI-ban és kiadási kapuban nem válhat hallgatólagos ténnyé |

Az aktuális általános terminológiai szabvány az
[ISO 22496:2021](https://www.iso.org/standard/73331.html); az
[EN 12519:2018](https://knowledge.bsigroup.com/products/windows-and-pedestrian-doors-terminology)
szintén a gyalogos ajtók általános, ábrákkal támogatott terminológiáját
rögzíti. A korábbi ISO 1804:1972 visszavont szabvány, ezért nem használható
aktuális normatív alapként. A jobbos/balos épületszerkezeti jelölés hivatalos
hivatkozási pontja a [DIN 107](https://www.dinmedia.de/en/standard/din-107/702361).

## A tipikus állítható átfogó tok gyártósemleges képe

```text
HELYISÉG A / FALOLDAL A                         HELYISÉG B / FALOLDAL B

  fix borítás                                      állítható borítás
       │                                                    │
       ▼                                                    ▼
 ┌──────────┐  ┌────────────────────────────────┐  ┌─────────────────┐
 │ fal síkja│──│ tokmag / tokbélés a falkávában│──│ nyelv/toll      │
 └──────────┘  │ pántoszlop + záróoszlop       │  │ a tok hornyában │
               │ + tokfelső                    │  └─────────────────┘
               └──────────────┬─────────────────┘
                              │
                        ajtólap + vasalat
```

Ez szemléltető alkatrészkapcsolat, nem gyártási profilrajz. A profil alakja, a
horony helye, a borítás rögzítése és az állítási tartomány termékrendszerenként
eltér.

### Javasolt Doorstar alkatrészfa

```text
Ajtópozíció
├─ Beépítési környezet
│  ├─ Helyiség A
│  ├─ Helyiség B
│  ├─ kész falnyílás
│  ├─ falkáva és falfülek
│  ├─ kész falvastagság min./max.
│  └─ kész padlószint
├─ Ajtóegység
│  ├─ Ajtólap
│  │  ├─ A oldali lapfelület
│  │  ├─ B oldali lapfelület
│  │  ├─ pántél, zárél, felső él, alsó él
│  │  ├─ lapkeret/váz, fedőlapok és betét
│  │  ├─ falckialakítás
│  │  └─ üvegezés, szellőzés és lapba épített vasalat
│  ├─ Ajtótok / tokszerkezet
│  │  ├─ tokmag vagy tokbélés [pontos Doorstar-határ ellenőrzendő]
│  │  │  ├─ pántoszlop
│  │  │  ├─ záróoszlop
│  │  │  └─ tokfelső
│  │  ├─ fix tokborítás [ha a profil része]
│  │  ├─ állítható tokborítás [ha a profil része]
│  │  │  └─ illesztőnyelv/toll
│  │  ├─ horony/nút
│  │  ├─ falc/ütköző és gumitömítés
│  │  ├─ pántfogadók
│  │  └─ zárfogadó
│  ├─ Vasalatok
│  │  ├─ pántok
│  │  ├─ zártest
│  │  ├─ kilincs/rozetta
│  │  └─ opcionális csukó-, retesz- és beléptetőelemek
│  └─ Alsó lezárás
│     ├─ küszöb, vagy
│     ├─ automata süllyedő tömítés, vagy
│     └─ meghatározott alsó légrés
└─ Kapcsolódó, de nem tokalkatrész
   ├─ blende
   ├─ falpanel
   ├─ felül-/oldalvilágító
   └─ külön takaró- vagy csatlakozóelem
```

Az [ERKADO 2026 gyártói katalógusa, 176. oldal](https://erkado.pl/wp-content/uploads/2026/03/katalog-dw-2026ia-en-www-29012026.pdf)
a tok készletét pántoldali állóra, zár/ütközőoldali állóra és felső elemre
bontja, tömítéssel, pántokkal és szerelési elemekkel. A
[Szalafa szerelési útmutatója](https://www.szalafa.hu/utolag-beepitheto-ajto/)
ajtólapot, tokot és utólag szerelhető tokborítást külön alkatrészként kezeli,
majd a borítást a tok nútjába illeszti.

## Fogalmi dimenziók és kapcsolataik

Az „oldal” önmagában nem elég pontos domainfogalom.

| Dimenzió / kapcsolat | Értékek | Mit ír le? | Nem azonos ezzel |
| --- | --- | --- | --- |
| Fizikai faloldal | `SIDE_A`, `SIDE_B` + `spaceRef` | A fal két stabil homlokoldala és a hozzájuk tartozó helyiség | bal/jobb, pánt/zár |
| Ajtólapfelület | `FACE_ON_SIDE_A`, `FACE_ON_SIDE_B` | Az ajtólapnak a megfelelő fizikai oldal felé néző látható síkja; 1:1 kapcsolatban áll a fizikai oldallal | falc vagy él |
| Borítás jelenléti állapota | `UNRESOLVED`, `NOT_APPLICABLE`, `PRESENT` | Ismeretlen-e, hiányzik-e, vagy ténylegesen jelen van-e tokborítás az adott oldalon | borítás szerepe |
| Borítási szerep | `UNRESOLVED`, `FIXED`, `ADJUSTABLE`, `OTHER` | `PRESENT` állapotnál az adott fizikai oldali tokborítás szerepe | a fizikai oldal azonosítója vagy az ajtólap mozgása |
| Tokoszlop szerepe | `HINGE_JAMB`, `STRIKE_JAMB` | A nyílás két függőleges tokszárának funkciója | fix/állítható faloldal |
| Oldalasság | `LEFT`, `RIGHT` + `handingConvention` | A pánthelyzet a rögzített megfigyelési konvenció szerint | a lap térbeli nyitási iránya |
| Nyitás térbeli iránya | `opensIntoSide=SIDE_A|SIDE_B` | Melyik helyiség terébe fordul a lap | jobbos/balos oldalasság vagy közlekedési irány |
| Falcgeometria | `REBATED`, `UNREBATED`, `REVERSE_REBATE`, … | A lap–tok ütközés/rásimulás geometriai rendszere | borítási szerep |

A stabil koordináta a két fizikai `SIDE_A/SIDE_B`. A lapfelület ehhez 1:1-ben
kötött alrész. A tokborítás jelenléti állapota külön adat; csak `PRESENT`
állapotnál kap szerepet és megjelenést.
Az oldalasság és a térbeli nyitási irány két külön mező.

A tipikus egyfalcos átfogó tokban a fix borítás gyakran a falc/pánt felőli
faloldalhoz kötődik. Ez azonban nem kódolható globális azonosságként: falc
nélküli, fordított falcú, rejtett pántos és más speciális rendszereknél külön
termékszabály szükséges. Az
[ERKADO nyitásirány-leírása, 149. oldal](https://erkado.pl/wp-content/uploads/2026/03/katalog-dw-2026ia-en-www-29012026.pdf)
is külön kezeli a jobbos/balos kivitelt, a befelé/kifelé nyitást, valamint a
falcolt, falc nélküli és fordított kialakítást.

A `LEFT/RIGHT` csak a hivatkozott konvencióval együtt teljes adat. DIN-szerű
jelölésnél azon az oldalon állunk, amerre az ajtólap felénk nyílik; a pánt
helyzete adja a balos/jobbos kivitelt. Az `opensIntoSide` ettől külön
mondja meg, melyik helyiség terébe fordul a lap. A „helyiség A-ból B-be”
közlekedési irány nem helyettesíti a nyitás térbeli irányát.

### Kényelmes UI-azonosítás

Ha ismert a két helyiség és a profil alapján a borítási szerep is igazolt, a
felületen ne pusztán „A/B” vagy „fix/mozgó” szerepeljen:

- **Nappali felőli oldal — fix borítás**
- **Háló felőli oldal — állítható borítás**
- **Ajtólap nappali felőli felülete**
- **Ajtólap háló felőli felülete**
- **Pántoszlop** és **záróoszlop**

A `SIDE_A/SIDE_B` maradjon stabil belső koordináta. A helyiségnevet, az
ajtólapfelületet és az opcionális borítási szerepet ehhez kell kapcsolni, nem a
szöveges címkébe beégetni.

## Kanonikus magyar szójegyzék

| Doorstar kanonikus név | Pontos jelentés | Elfogadott alias / angol híd | Kerülendő összemosás |
| --- | --- | --- | --- |
| **Ajtóegység** | Az együtt kezelt ajtólap, tok és szükséges vasalatok/tömítések | teljes ajtószerkezet; `doorset` | pusztán „ajtó”, ha az alkatrészszint számít |
| **Ajtólap** | A nyílást lezáró mozgó elem | ajtószárny; `door leaf` | tok, borítás |
| **Ajtótok / tokszerkezet** | A falnyíláshoz rögzített, az ajtólapot fogadó teljes keretrendszer | `door frame` | tokmag |
| **Tokmag / tokbélés** | Az átfogó tokszerkezet központi, a falkávát burkoló része; a pontos Doorstar BOM-határ még megerősítendő | béléslap; `lining/lining board` | a teljes tok szinonimája |
| **Tokborítás** | A fal síkján látható, a tok–fal csatlakozást takaró szerkezeti elem | borítás, borítóléc; `architrave/trim` | felületkezelés vagy dekorfólia |
| **Fix tokborítás** | A tokszerkezethez gyárilag vagy szerkezetileg rögzített, nem falvastagság-állító borítás | fix borítás; `fixed-side casing/architrave` | fix/nem állítható ajtótok vagy automatikusan falc-/pántoldal |
| **Állítható tokborítás** | A falvastagsághoz beállítható, jellemzően horonyba illesztett faloldali borítás | mobil/mozgó borítás; `adjustable trim` | működés közben mozgó elem |
| **Pántoszlop** | A pántokat/pántfogadókat hordozó függőleges tokszár | pántoldali tokszár; `hinge jamb` | fix oldal |
| **Záróoszlop** | A zárfogadót hordozó függőleges tokszár | zároldali tokszár; `strike jamb` | állítható oldal |
| **Tokfelső** | A két függőleges tokszárat felül összekötő rész | felső gerenda, tokfej; `frame head` | áthidaló |
| **Falc** | A lap és tok lépcsős ütköző-/ráfedési geometriája | `rebate` | falkáva |
| **Falcolt ajtó** | A lap falca ráfed a tokra | falcos; `rebated` | fix borítás |
| **Falc nélküli ajtó** | Zárt állapotban a lap és tok látható síkja rendszerint egy síkba kerül | síkban záródó; `unrebated` | minden „flush” konstrukció |
| **Fordított falcú/reverz ajtó** | Fordított falcgeometriájú, speciális nyitási rendszer | `reverse-opening`, `reverse-rebate` | egyszerűen falc nélküli; a `reversible` megfordítható termékjelentése |
| **Pánt** | A lapot a tokhoz kapcsoló forgó vasalat | zsanér; `hinge` | pánttáska |
| **Pánttáska / pántfogadó** | A tokban lévő, pántot fogadó szerkezeti elem | pántdoboz; `hinge receiver` | maga a pánt |
| **Zártest** | Az ajtólapba épített zárszerkezet | `lock case` | zárfogadó |
| **Zárfogadó** | A tok záróoszlopában a zárnyelvet fogadó elem | zárlemez, ütközőlemez; `strike plate` | zártest |
| **Gumitömítés** | A falc/ütköző mentén futó tömítőprofil | tokszigetelés; `gasket/seal` | automata küszöb |
| **Falnyílás** | Az épületszerkezet nyílása, amelybe a tok kerül | nyers/kész falnyílás — az állapotot mindig meg kell adni | szabad átjárás |
| **Falkáva** | A falnyílás mélységi oldalfelülete | nyíláskává, béllet; `wall reveal` | falfül |
| **Falfül** | A nyílás melletti falszakasz, amelyen a borítás elfér | oldalsó kiállás | falkáva |
| **Szerelési hézag** | A falnyílás és tok közötti beállítási/rögzítési tér | elhelyezési hézag; `installation joint` | működési hézag |
| **Működési hézag** | Az ajtólap és tok közötti szükséges hézag | falchézag; `operating clearance` | szerelési hézag |
| **Szabad átjárási méret** | A használható közlekedési nyílás | szabad nyílás; `clear opening` | névleges méret, tok belméret |
| **Kész falvastagság** | A két végleges fal-/burkolati sík közötti méret | több ponton mérve min.–max. | névleges toktartomány |
| **Tok falvastagsági tartománya** | Az adott tokváltozat által lefedhető gyártói min.–max. tartomány | állítási tartomány | borításszélesség |
| **Borításszélesség** | A tokborítás fal síkján látható szélessége/takarása | takarási szélesség | falvastagsági tartomány |
| **Küszöb** | A padlón maradó alsó szerkezeti elem | fix küszöb | automata küszöb |
| **Automata alsó tömítés** | Az ajtólapból csukáskor lesüllyedő tömítés | automata küszöb, süllyedő küszöb | a tok része |

### Három különösen veszélyes szó

1. **Fix tok** nem ugyanaz, mint **fix tokborítás**. Az első sok katalógusban
   nem állítható szélességű toktípust, a második az állítható átfogó tok egyik
   borítását jelenti.
2. **Borítás** jelenthet fizikai tokborítást, de hétköznapi nyelven
   felületképző fóliát vagy lemezburkolatot is. Domainmezőben mindig
   `tokborítás` vagy `felületképzés` szerepeljen.
3. **Oldal** lehet faloldal, ajtólapfelület, pánt-/zároldal vagy jobbos/balos
   nyitás. Minősítő nélküli `side` mező nem elfogadható.

## Ajtólapszerkezet: külön, termékváltozathoz kötött modul

Az ajtólap nem egyetlen univerzális rétegrend. Gyártói rendszertől függően
lehet keret-/frízszerkezetű vagy fedőlapos/panel jellegű; a belső kitöltés lehet
például méhsejtrács, tömör vagy furatolt forgácslap. Az
[ERKADO gyártói szerkezeti áttekintője](https://erkado.pl/en/innovations/erkado-door-design-and-construction/)
külön kezeli a látható keretes és a fedőlap alatt rejtett keretes konstrukciót,
valamint a különböző betéteket.

A [Doorstar saját gyártási leírása](https://www.doorstar.hu/gyartas) jelenleg
HDF/MDF anyagokat, furatolt forgácslap ajtólapkitöltést, egyedi élzárást,
rejtett pántokat és mágneses zártestet emel ki. Ezek fontos Doorstar-irányok, de
az egyedi rendeléseknél a tényleges jóváhagyott termékspecifikáció marad az
authority.

Javasolt ajtólap-BOM fogalmak:

- függőleges váz-/keretelem;
- felső és alsó keresztelem;
- pánt- és zárerősítés;
- külső fedőlap/bőr;
- belső betét/kitöltés;
- élzárás és falckialakítás;
- üvegkivágás, üveg és üvegrögzítő elem;
- szellőzőkivágás/rács vagy alsó légrés;
- zár-, kilincs- és pántmegmunkálás.

Ezekhez nem rendelhető egyetlen fix anyag vagy rétegrend terméktípus és
verziózott profil nélkül.

## Felület és megjelenés

A komponens és annak megjelenése két külön modell. Egy igazolt, állítható
átfogó tokos Doorstar-pozíció az alábbi öt, egymástól független megjelenési
célt igényli:

1. ajtólap `SIDE_A` felőli felülete;
2. ajtólap `SIDE_B` felőli felülete;
3. látható tok-/falcfelület;
4. a `FIXED` szerepű tokborítás;
5. az `ADJUSTABLE` szerepű tokborítás.

Más `FrameSystemProfile` esetén a megjelenési célok alkalmazhatósága a
profilból jön. Bizonyítottan hiányzó borítás jelenléti állapota
`NOT_APPLICABLE`; ismeretlen profilnál `UNRESOLVED`, nem hallgatólagos hiány.
A `visibleFrameSurface` jelenleg egyetlen absztrakt megjelenési cél. A Doorstar
`tokmag` pontos alkatrészkapcsolata és az esetleges oldalankénti
tokfelület-bontás profilrajzos tisztázásig nyitott.

Minden célhoz külön kezelendő:

- felületképzés/technológia;
- alapanyag vagy hordozó, ha műszakilag releváns;
- szín/dekor és katalóguskód;
- minta/marás/profil;
- szálirány és mintairány;
- fényesség/textúra, ha releváns;
- explicit öröklés vagy explicit eltérés;
- forrás, revízió és jóváhagyási állapot.

A „megegyezik az ajtólappal” ne hiányzó adat, hanem explicit, célzott öröklési
döntés legyen. Az egyetlen örökölt `surface` mező nem másolható automatikusan
mind az öt célra. A Doorstar helyi munkafüzetek már külön mezőket tartalmaznak
a FIX és MOZGÓ lapfelületre, továbbá a két oldali borításra; ez erős
`DOORSTAR_LOCAL` bizonyíték, de a mezőértékeket továbbra is evidence-ként,
review-val kell migrálni.

## Mérés és geometria

Egy kényelmes és gyártható felmérési modell nem egyetlen szélesség–magasság–
falvastagság hármasból áll:

```text
Falnyílás
├─ szélesség: fent / középen / lent
├─ magasság: bal / közép / jobb
├─ átlók és függő/vízszint eltérés
├─ kész falvastagság: bal felső/közép/alsó, jobb felső/közép/alsó
├─ kész padlószint és burkolatváltás
├─ falfül/takarási hely: bal / jobb / felső
├─ Helyiség A és Helyiség B
└─ nyitási akadályok

Kiválasztott tokspecifikáció
├─ gyártói termék-/profilverzió
├─ névleges méret
├─ tokmag külméret
├─ szabad átjárási méret
├─ falvastagsági tartomány
├─ tervezett beállítás és maradó tartalék
└─ borításszélesség
```

A [Borovi felmérési útmutatója](https://borovi.eu/meretezes-felmeres/)
kifejezetten szétválasztja a falnyílást, a névleges méretet, a tokmag külméretét
és az elhelyezési hézagot. A konkrét számpéldái saját termékszabályok, nem
Doorstar-univerzálék.

Külön mező kell legalább ezekhez a hézagokhoz:

- falnyílás–tok szerelési hézag;
- ajtólap–tok oldalsó és felső működési hézag;
- ajtólap alatti kész légrés;
- tok–kész padló nedvességvédelmi csatlakozás;
- tokborítás–fal csatlakozási hézag.

## Gyártósemleges beépítési folyamat

Az alábbi folyamat ellenőrzési kapuk sorozata, nem univerzális szerelési
utasítás:

1. termék, oldalasság, nyitásirány, falnyílás, kész fal, falvastagság és kész
   padlószint ellenőrzése;
2. pántoszlop, záróoszlop és tokfelső összeállítása a gyártói rendszer szerint;
3. tok behelyezése, ékelése, távtartása és függő–vízszint–derékszög ellenőrzése;
4. ajtólap próbaillesztése és a működési hézagok, pántok, záródás ellenőrzése;
5. a tok gyártói előírás szerinti habos és/vagy mechanikus rögzítése;
6. kötés után a segédelemek és felesleges kitöltés eltávolítása;
7. az állítható borítás illesztőnyelvének a tok hornyába helyezése a tényleges
   falvastagsághoz;
8. ajtólap, vasalat, tömítés, küszöb/alsó tömítés és csatlakozások végleges
   beállítása, majd funkcióellenőrzés.

Az [INVADO 1/2020 gyártói szerelési útmutatója, 1. oldal, 3–19. lépés](https://invado-mtb.pl/wp-content/uploads/1_1_ORS1_PLEDYCJA-1-2020.pdf),
a [Voster gyártói útmutatója, 2. oldal, 1–16. lépés](https://www.voster.pl/file/do_pobrania/instrukcja_oscieznica_regulowana_224.pdf),
a [Hörmann fa átfogó tok szerelési útmutatója, 2022-10 kiadás](https://www.hoermann.de/mediacenter/download/288049hu/EB001_Holzumfassungszargen_Stand_2022_10.pdf)
és a [Szalafa magyar útmutatója](https://www.szalafa.hu/utolag-beepitheto-ajto/)
ezt a közös szerkezeti mintát támasztja alá.

Nem válhat általános Doorstar-szabállyá:

- egy konkrét állítási tartomány;
- egy konkrét habfajta, habmennyiség vagy kötési idő;
- kizárólag habos rögzítés;
- a borítás kötelező ragasztása;
- az ajtólap próbaillesztésének egyetlen merev sorszáma;
- tűz-, füst-, hanggátló vagy nagy tömegű ajtó normál ajtóként kezelése.

## UI- és domainkövetkezmények

### Azonnal alkalmazható

- A felületeken **Fix borítás** és **Állítható borítás** legyen a fő címke;
  „mozgó” csak örökölt alias/súgó.
- Minden oldal kapjon helyiségnevet és stabil `SIDE_A/SIDE_B` azonosítót.
- A lapfelület 1:1-ben a fizikai oldalhoz kötődik. A borítás külön
  `UNRESOLVED/NOT_APPLICABLE/PRESENT` jelenléti állapotot kap; csak jelen lévő
  borításnak van `FIXED/ADJUSTABLE/OTHER/UNRESOLVED` szerepe.
- A `HINGE/STRIKE`, `LEFT/RIGHT + handingConvention`, `opensIntoSide` és
  falcgeometria külön mező legyen.
- A `tokmag` ne legyen a `tok` szinonimája.
- A `tokborítás` komponens és a `felületképzés` ne ugyanazt a `borítás` mezőt
  használja.
- A falvastagság, toktartomány, aktuális beállítás és borításszélesség külön
  érték legyen.
- A falnyílás, tokmag külméret és szabad átjárás ne legyen felcserélhető.
- Blende és falpanel külön kapcsolódó komponens; nem tokborítás-alias.

### Backend-szerződésben szükséges

- verziózott `FrameSystemSpec`, amely külön tárolja a toktípust,
  beépítési módot és állíthatósági rendszert;
- stabil `SIDE_A/SIDE_B`, opcionális `spaceRef`, valamint az adott oldali
  `CasingState` és — jelen lévő borításnál — `CasingRole` kapcsolata;
- termékrendszer-függő, nem globális fix-oldal ↔ pántoldal szabály;
- önálló megjelenési targetek és szerveroldali öröklési lineage;
- mérési pontok/min.–max., kiválasztott gyártói tartomány és kompenzáció;
- falcgeometria, oldalasság és nyitási irány külön mező;
- profil-/katalógusverzióhoz kötött validáció és readiness;
- mezőszintű source evidence, konfliktus és emberi resolution.

### Importban szükséges

- a „FIX”, „MOZGÓ/MOBIL/ÁLLÍTHATÓ”, „PÁNT”, „ZÁR”, „A/B”, „BELÜL/KÍVÜL”
  címkék külön fogalomra normalizálása;
- ismeretlen megfigyelési oldalnál nincs automatikus bal/jobb vagy
  pánt-/zár-hozzárendelés;
- egy generikus tok- vagy felületérték nem sokszorosítható több komponensre;
- a `Tokmag Vsz.` és `Tokmag Függ.` gyártási alkatrészmegfigyelés, nem a teljes
  tok vagy annak UI-neve;
- minden gyártói méret- vagy profilszabály forrás- és verziókötött.

## Javasolt RAG-metaadat a szakirodalomhoz

A könyvek és gyártói dokumentumok ne csak szövegchunkként kerüljenek be. Egy
visszakeresett állítás alkalmazhatóságához legalább ezeket érdemes megőrizni:

```text
sourceId, contentHash
title, author/publisher/manufacturer
documentType, authorityLevel
edition, revision, publicationDate, validFrom, validTo, supersedes
language, jurisdiction
productFamily, profileRef, doorType, performanceClass
section, page, table, figure, caption
rawTerm, normalizedTermCandidates
rawValue, unit, tolerance, applicabilityConditions
accessControl, licenceNote
reviewState, reviewedBy, reviewedAt
```

További feldolgozási szabályok:

- az ábrát, képaláírást, jelmagyarázatot és az azokat magyarázó bekezdést
  egymáshoz kapcsolva indexeld;
- az OCR-szöveg mellett maradjon meg az oldalkép és a pontos oldal-/ábrahivatkozás;
- egy terminust ne írj felül egyetlen „helyes” szinonimával: őrizd a nyers
  alakot és adj normalizálási jelöltet;
- méret, tűrés és szerelési utasítás csak az alkalmazhatósági feltételeivel
  együtt legyen visszakereshető;
- visszavont szabványt és elavult katalógust jelölj, ne törölj: történeti
  Doorstar-dokumentumok értelmezéséhez még szükséges lehet;
- a licencelt könyvek és szabványok tartalma csak a jogosultságuknak megfelelő
  hozzáférési körben legyen indexelhető és idézhető;
- RAG-találat önmagában csak evidence/javaslat; Doorstar domain-szabályt emberi
  jóváhagyás és verziózott konfiguráció hozhat létre.

## Nyitott kérdések a készülő szakirodalmi RAG-hoz

1. A Doorstar összes aktív tokrendszerének keresztmetszeti/profilrajza és
   alkatrészjegyzéke.
2. A `tokmag`, `tokbélés`, `tokfal`, `BKM_FIX`, `BKM_MOVING`, `TOK` és
   `borítás` pontos Doorstar BOM-határa.
3. Mely termékrendszerekben kötelező, megengedett vagy tiltott a
   fix borítás ↔ pánt/falc oldal kapcsolata?
4. Falc nélküli, fordított falcú, rejtett tokos, kétszárnyú, toló-, átjáró-,
   felülvilágítós és falpanelbe integrált ajtók külön oldalmodellje.
5. Mely tok-/tokmagfelületek láthatók A és B oldalról, és lehet-e a tok
   megjelenése is oldalanként eltérő?
6. A tokmag, fix borítás és állítható borítás pontos felületöröklési és
   eltérési szabályai.
7. Termékenkénti falvastagsági sorozatok, állítási tartományok, profilvágási és
   toldási szabályok.
8. A falnyílás-, tokmag-, ajtólap- és szabad átjárási méret képletei,
   toleranciái és mérési konvenciói.
9. Pánt-, pánttáska-, zár-, zárfogadó-, tömítés- és küszöbrendszerek
   kompatibilitási szabályai.
10. Tűz-, füst-, hang-, nedvesség- és akadálymentességi teljesítményhez tartozó
    eltérő szerkezetek és kötelező szerelési előírások.
11. A licencelt ISO/EN/MSZ/DIN fogalmak jogszerűen használható, verziózott
    kivonatai és a magyar szabványos megfelelőik.

## Forrásjegyzék

### Szabványos horgonyok

- [ISO 22496:2021 — Windows and pedestrian doors — Vocabulary](https://www.iso.org/standard/73331.html)
- [EN 12519:2018 — Windows and pedestrian doors — Terminology](https://knowledge.bsigroup.com/products/windows-and-pedestrian-doors-terminology)
- [DIN 107 — Building construction; identification of right and left side](https://www.dinmedia.de/en/standard/din-107/702361)
- [DIN 68706-2 — fa átfogó tokok terminológiája, méretei és beépítése](https://www.dinmedia.de/de/norm/din-68706-2/318805341)
- [DIN 18101 — beltéri ajtólapok és tokok méretkoordinációja](https://www.dinmedia.de/de/norm/din-18101/204907014)

### Gyártói, elsődleges műszaki források

- [Doorstar — Gyártás](https://www.doorstar.hu/gyartas)
- [Borovi — Tok típusok](https://borovi.eu/tok-tipusok/)
- [Borovi — Méretezés, felmérés](https://borovi.eu/meretezes-felmeres/)
- [Szalafa — Utólag beépíthető ajtó és szerelési útmutató](https://www.szalafa.hu/utolag-beepitheto-ajto/)
- [PORTA — fix és állítható tok ismertető](https://www.porta.com.pl/otworzsiena/drzwi/wybierz-odpowiednia-oscieznice-do-twoich-drzwi)
- [PORTA — állítható tokok](https://www.porta.com.pl/produkty/oscieznice-regulowane)
- [ERKADO — 2026 beltéri ajtó katalógus](https://erkado.pl/wp-content/uploads/2026/03/katalog-dw-2026ia-en-www-29012026.pdf)
- [ERKADO — állítható tok szerelési útmutató](https://erkado.pl/wp-content/uploads/2025/03/installation-instructions-for-the-adjustable-door-frame-for-rebated-non-rebated-and-reversible-doors.pdf)
- [ERKADO — ajtólap-konstrukciók](https://erkado.pl/en/innovations/erkado-door-design-and-construction/)
- [DRE — 2024 angol termékkatalógus](https://dre.pl/wp-content/uploads/2024/03/Katalog-DRE-2024-edycja-1-English.pdf)
- [INVADO — állítható tok szerelési útmutató](https://invado-mtb.pl/wp-content/uploads/1_1_ORS1_PLEDYCJA-1-2020.pdf)
- [Voster — állítható tok szerelési útmutató](https://www.voster.pl/file/do_pobrania/instrukcja_oscieznica_regulowana_224.pdf)
- [Hörmann — fa átfogó tok szerelési útmutató](https://www.hoermann.de/mediacenter/download/288049hu/EB001_Holzumfassungszargen_Stand_2022_10.pdf)
- [Westag — ajtóipari fogalomtár](https://www.westag.de/de/westag-tueren/service/ratgeber/fachbegriffe-finden-im-tueren-glossar/)
- [Westag — szerelési útmutató](https://www.westag.de/fileadmin/westag_getalit/tueren-und-zargen/fachhandel/verarbeiter-architekten/montageanleitungen/386628_montage_tuerelemente_2022_low.pdf)
- [GARANT — tok szerelési dokumentáció](https://tuerenhandbuch.garant.de/typo3conf/ext/cdt_cmos2/Resources/Public/cmos2/php/get.php?id=5661)
- [Giese — átfogó tok felépítése](https://giesetueren.de/tueren/umfassungszarge)

## Leállási feltétel

Ez a baseline akkor válthat `APPROVED_DOORSTAR_DOMAIN` állapotba, ha:

1. Doorstar szakmai felelős legalább egy normál falcolt és egy speciális
   tokrendszer keresztmetszetén jóváhagyta az alkatrészneveket;
2. a tokmag és a két borítás BOM-határa egyértelmű;
3. a helyiségoldal, borítási szerep, pánt-/zároldal és nyitásirány
   adatmodellje példákkal validált;
4. a termékspecifikus méret- és szerelési szabályok verziózott forráshoz
   kötöttek;
5. a UI, backend és import ugyanazt a kanonikus szójegyzéket használja.
