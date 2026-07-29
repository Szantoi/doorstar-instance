---
id: PROJECT-DOORSTAR-ORDER-DATA-CHAIN
name: Doorstar Order-to-Production Data Chain
owner: root
status: ACTIVE
created: 2026-07-29
---

# Doorstar megrendelés–gyártás adatút

## Cél

A Doorstar a megrendelést egy korszerű, ellenőrizhető alkalmazásban rögzíti,
majd abból verziózott termék-, alkatrész-, szabászati, műveleti és kiadható
üzemi adatot állít elő. A kiadott gyártási információ mindig visszavezethető
azt létrehozó megrendelési revízióig.

## Validált üzleti lánc

Egy 2026. júliusi, összetartozó valós mintán a következő adatáramlás igazolt:

```text
Gyártásmegrendelő → Kalkulátor → Folyamatok → Kiíró
```

Az első lépés projektszintű adatokat és ajtópozíciókat vesz fel. A Kalkulátor
ezekből kész- és szabászati méretű alkatrészeket képez. A Folyamatok az
alkatrész- és termékadatokból normaidős, erőforrás- és függőség-információval
ellátott műveleti tervet készít. A Kiíró csak a már jóváhagyott adatot teszi
üzemi használatra alkalmassá.

A vizsgált forrásfájlok csak helyben, olvasási célból szolgáltak; üzleti vagy
személyes rekordérték nem kerül ebbe a repositoryba.

## Célmodell és felelősségi határok

| Réteg | Doorstar fogalom | Felelősség |
| --- | --- | --- |
| Rendelés | `Project` + `OrderRevision` | Ügyfél-, projekt- és határidőadatok, a revízió életciklusa |
| Konfiguráció | `OrderPosition` | Ajtónkénti mennyiség, típus, nyitás és kiinduló méretek |
| Műszaki specifikáció | oldalfelület, üveg, vasalat, anyag, megmunkálás | Az egyes pozíciók gyártható paraméterei és megjegyzései |
| Kalkuláció | `ComponentRequirement` | Kész- és szabászati méretű alkatrészsnapshot, kalkulátorprofil-verzióval |
| Gyártástervezés | `OperationCandidate` | Norma-, mennyiség-, erőforrás- és függőségi bemenet |
| Tervezés | platform `PlanningProposal` | A SpaceOS naptár- és kapacitástudatos tervjavaslata |
| Kiadás | `IssuedWorkPackage` | Változhatatlan hivatkozás a jóváhagyott order-, kalkuláció- és tervverzióra |

A már létező Doorstar `Project` marad a UI és a jelenlegi munkalap gyökere;
nem készül vele párhuzamos projekt- vagy kernelmodell. Az új rendelési adatok
hozzá kötött, tenant-specifikus kiterjesztések lesznek.

## Rendelésfelvétel v1

Az első képernyő nem a teljes régi munkafüzetet másolja, hanem három
érthető szerkesztési részt ad:

1. **Megrendelés fejléc:** munkaszám, projekt/megrendelő, kapcsolattartási és
   szállítási adatok, prioritás, kezdés, elvárt szállítás, megjegyzés.
2. **Ajtópozíciók:** pozícióazonosító, megnevezés, mennyiség, típus,
   nyitásirány, falnyílás- és ajtóméretek, vastagság.
3. **Műszaki specifikáció:** fix és mozgó oldali felület, borítás, blende és
   falpanel; üveg; vasalat; alapanyag; megmunkálás; irányított megjegyzések.

A termékkatalógusok (típus, szín, minta, vasalat, anyag) nem szabad szövegként
kerülnek a kiadható adatokba: konfigurációból jövő kulcsot és megjelenítési
értéket kapnak. Az ismeretlen vagy érvénytelen kiválasztás blokkolja a
jóváhagyást, nem válik hallgatólagos alapértelmezéssé.

## Sales és felmérési folyamat

A Sales csak új projektet kezdeményez és a dokumentumcsomagot adja át. A
felmérés véglegesíti a típus-, méret-, felület-, falpanel/blende- és
üvegadatokat; ezek befolyásolják a későbbi műveletképzést. A teljes állapotgép,
a Sales-forrásmappa olvasási szabályai és a beépítői lezárási kapu a
[`SALES_SURVEY_WORKFLOW.md`](SALES_SURVEY_WORKFLOW.md) dokumentumban vannak.

## Állapotok és kapuk

`DRAFT → REVIEW → APPROVED → SUPERSEDED`

- Csak `DRAFT` revízió szerkeszthető.
- Jóváhagyáskor a rendszer tartalmi hash-t és változhatatlan pillanatképet
  készít.
- Kalkuláció és műveletképzés kizárólag jóváhagyott revízióból indulhat.
- Egy új rendelésmódosítás új revízió, nem a korábbi kiadás felülírása.
- Üzemi kiadás csak jóváhagyott, teljes rendelés + kalkuláció + tervezési
  bemenetre mutathat.

## Szerepkörök

A szerepkörök, az állapotkapuk és a beépítői visszajelzés határai a
[`ROLE-MATRIX.md`](ROLE-MATRIX.md) dokumentumban vannak rögzítve. A beépítő
csak a neki kiadott beépítési csomag konkrét dokumentumverzióit látja és
helyszíni bizonyítékot rögzít; nem módosít jóváhagyott rendelési vagy gyártási
adatot.

## Excel-migráció és dokumentumkezelés

A régi Excel-folyamatokat nem egyszeri, ellenőrizhetetlen adatbetöltéssel
váltjuk ki. A rendszer minden betöltést visszakövethető **import futásként**
kezeli: a forrásfájl hash-ét, nevét, típusát és a verziózott mezőtérképet
rögzíti; az előnézet megmutatja a létrehozandó rekordokat és a hibás sorokat;
majd csak vezetői jóváhagyás hozhat létre új `OrderRevision`-t. Jóváhagyott
vagy kiadott revíziót import nem írhat felül.

Az import a `Gyártásmegrendelő`, `Kalkulátor`, `Folyamatok` és `Kiíró`
profilokat külön kezeli. Excel-makrót nem futtatunk, cellahivatkozást nem
teszünk üzleti logikává. Ismeretlen munkafüzetverzió, oszlop vagy
katalógusérték előnézeti hibát és karantént eredményez.

A gyártási tétel jelöltek alkalmazása külön, idempotens emberi kapu. Csak az
ImportRunhoz tartozó tesztsémás DRAFT revízió, a változatlan forrásfingerprint
és a felhasználó által egyenként kijelölt READY rekordok fogadhatók el. A
részletes szerződést az
[`ADR-2026-07-29-controlled-manufactured-item-import-apply.md`](../../decisions/ADR-2026-07-29-controlled-manufactured-item-import-apply.md)
rögzíti.

A dokumentumok első osztályú, verziózott rekordok lesznek. Egy dokumentum
`Project`-hez, `OrderRevision`höz, ajtópozícióhoz vagy kiadott
munkacsomaghoz kapcsolható kategóriával (például megrendelőlap, műszaki
rajz, kalkuláció, szabászlista, folyamatlap, kísérőlevél, átadás-átvétel) és
SHA-256 tartalmi azonosítóval. A fájl binárisa konfigurált objektumtárban
marad, az adatbázis csak a metaadatot és a jogosult hivatkozást tárolja.
Új feltöltés új verzió; kiadáskor a munkacsomag a használt dokumentumok
konkrét verzióit rögzíti.

## SharePoint és GraphRAG alaparchitektúra

A SharePoint a Doorstar dokumentumainak elsődleges tárhelye marad. A Doorstar
alkalmazás nem hálózati megosztást csatol, hanem Microsoft Graph API-n keresztül
kapcsolódik egy kijelölt SharePoint-site és dokumentumtárakhoz. Az Entra
alkalmazás kezdetben csak az előzetesen jóváhagyott site-ra kap olvasási jogot
(`Sites.Selected`); teljes tenant- vagy írási jogosultság nem alapértelmezés.

A szinkronizáló a Graph `driveItem` azonosítót, verziót, szülőmappát,
metaadatot, jogosultsági kontextust és delta tokent tárolja. Az első teljes
leltár után delta-lekérdezéssel dolgozik, ezért módosítást, átnevezést és
törlést is követni tud. A SharePointban törölt dokumentum keresési indexe és
helyi hivatkozása is visszavonásra kerül; a kiadott munkacsomaghoz már
rögzített, szükséges bizonyítékot a megőrzési szabály szerint kell kezelni.

A GraphRAG réteg az alábbi, hozzáférés-ellenőrzött gráfot építi:

```text
Project / OrderRevision / Position / IssuedWorkPackage
  ↕ kapcsolódik
SharePointDocumentVersion → Chunk → termék, alkatrész, művelet, rajzazonosító
```

- A dokumentumok szövege és strukturált adatai chunkokra, embeddingre és
  domain-entitás/kapcsolat indexre kerülnek; a forrásfájl nem kerül tanítási
  adatként felhasználásra.
- Minden chunk örökli a forrás SharePoint- és Doorstar-hozzáférési címkéit.
  Lekérdezéskor az ACL-szűrés **a keresés előtt** történik.
- Az LLM kizárólag a jogosult, visszakeresett részleteket kapja meg; válaszhoz
  dokumentum- és verzióhivatkozást ad. Jogosulatlan vagy nem indexelt
  dokumentumra nem következtethet.
- LLM-javaslat (például rajz és rendelés eltérésének jelzése) csak review
  állapotot hozhat létre. Rendelési adat, kalkuláció, terv vagy kiadás
  módosításához mindig emberi jóváhagyás és a rendes domain-validáció kell.
- A keresés, a promptba adott forrásazonosítók és a felhasználói jóváhagyások
  auditnaplóba kerülnek; promptba nyers titok, token vagy felesleges
  dokumentumtartalom nem kerülhet.

Az első SharePoint-szelet olvasási/szinkronizálási módú. Automatizált
SharePoint-írás (például generált Kiíró feltöltése) csak külön jóváhagyott
verzió- és ütközéskezelési terv után készülhet.

## Megvalósítási sorrend

1. **DSORD-01:** SharePoint- és GraphRAG-alap: jogosultsági határ, forrás- és
   dokumentumazonosítók, auditált indexelési szerződés.
2. **DSORD-02:** adatséma, API és Megrendelésfelvétel v1 (fejléc + ajtópozíció).
3. **DSORD-03:** műszaki specifikációs blokkok és katalogizált értékek.
4. **DSORD-04:** verziózás, jóváhagyási kapu és auditnapló.
5. **DSORD-05:** tiszta, tesztelt kalkulátor-adapter; alkatrész- és
   szabászati snapshot előállítása.
6. **DSORD-06:** `OperationCandidate` képzése és a meglévő preflighthez való
   illesztése.
7. **DSORD-07:** Excel-import előnézet, karantén és jóváhagyott
   revízióképzés.
8. **DSORD-08:** dokumentumtár, verziózás és kiadási dokumentumkapcsolatok.
9. **DSORD-09:** a publikált SpaceOS szerződésen keresztüli tervjavaslat,
   majd verifikált üzemi kiadás.

## Elfogadási feltételek

- Egy rögzített ajtópozíció minden kiadhatósághoz kötelező méret- és
  termékazonosítót tartalmaz.
- Egy `ComponentRequirement` egyetlen order-revízióra és
  kalkulátorprofil-verzióra mutat.
- Egy `OperationCandidate` alkatrészre, norma-revízióra és erőforrásra
  mutat; hiányos jelölt karanténba kerül.
- Egy kiadott munkacsomag revíziói nem módosíthatók utólag.
- Egy Excel-import futás bemeneti hash-e, mapping-verziója, előnézete és
  jóváhagyója auditálható.
- Egy kiadott munkacsomag minden kapcsolódó dokumentumának konkrét verziója
  visszakereshető.
- GraphRAG-válasz nem jeleníthet meg olyan dokumentumrészletet, amelyre a
  lekérdezőnek nincs SharePoint- és Doorstar-joga, és minden érdemi válasz
  forrásverzióra hivatkozik.
- A régi Excel képletei és cellahivatkozásai nem kerülnek át a
  production-service-be; a jóváhagyott üzleti szabályok típusos, tesztelt
  domainlogikaként élnek tovább.
