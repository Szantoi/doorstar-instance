# Doorstar gyártási adat- és dokumentumlánc

**Dátum:** 2026-07-28  
**Állapot:** Doorstar által megerősített üzleti folyamat; részletes mezőtérkép készítendő  
**Cél:** az Excel-lánc üzleti jelentésének megőrzése modern, ellenőrizhető
Doorstar-funkciókban.

## Alapelv

A jelenlegi munkafüzetek együtt egy gyártás-előkészítő rendszert alkotnak.
Nem a képletek vagy cellahivatkozások másolása a cél, hanem az általuk
megvalósított üzleti eredmény és az adatok visszakövethetőségének megőrzése.

Minden későbbi rendszerbeli rekordnak meg kell őriznie a forrásprojektet,
forrásverziót és azt, hogy melyik korábbi adatból vagy szabályból keletkezett.

## A jelenlegi lánc

```mermaid
flowchart LR
    A["Gyártásmegrendelő.xlsm\nprojekt- és megrendelési adatok"]
    B["Kalkulátor.xlsm\nalkatrészek és méretek"]
    C["Folyamatok.xlsm\nműveletek és munkaidő"]
    D["Kiíró\nüzemi dokumentumok"]
    A --> B --> C --> D
```

| Szakasz | Jelenlegi munkafüzet | Üzleti felelősség | Következő szakaszba adott lényeges eredmény |
|---|---|---|---|
| 1. Projektfelvétel | `Gyártásmegrendelő.xlsm` | A projekt és a megrendelési adatok rögzítése. | Egyértelmű projekt-/munkamegrendelés-azonosító és a termékhez szükséges kiinduló adatok. |
| 2. Termék-előkészítés | `Kalkulátor.xlsm` | Meghatározza, mely alkatrészek kellenek a munkához, azok készméretét és szabászati méretét. | Strukturált alkatrészlista, mennyiségek, készméretek és szabászati méretek. |
| 3. Gyártástervezés | `Folyamatok.xlsm` | A termék- és alkatrészadatból meghatározza a szükséges műveleteket, normaidőket, függőségeket és tervezett munkaidőt. | Műveleti terv, erőforrásigény, tervezési bemenet, napi terhelés és Gantt-adat. |
| 4. Üzemi kiadás | `Kiíró` | A jóváhagyott gyártási adatot az üzem számára használható formában biztosítja. | Kiadható munkalapok és a végrehajtáshoz szükséges információ. |

## A szakaszok jelentése

### 1. Gyártásmegrendelő: az üzleti kiindulópont

Ez az első rögzítési felület. Itt születik meg az a projekt- és
megrendeléskörnyezet, amelyhez minden későbbi kalkuláció és művelet tartozik.
A modern rendszerben ez a **forrásprojekt**; nem szabad a műveleti tervből
visszafejteni vagy csak szöveges névvel azonosítani.

### 2. Kalkulátor: a termékből gyártható alkatrészek

A Kalkulátor nem ütemező. A feladata a termék konfigurációjából a gyártási
alkatrészek és dimenziók képzése:

- milyen alkatrészek szükségesek;
- hány darab szükséges belőlük;
- mi a készméretük;
- milyen szabászati méretre van szükség.

Ez a réteg adja azokat a mennyiségeket és műszaki paramétereket, amelyekből a
Folyamatok munkafüzet később műveletet és munkaidőt képez.

### 3. Folyamatok: a gyártási műveleti terv

Ez a közvetlen tervezési bemenet. A vizsgált munkafüzetben a Power Query és a
képletek a termék-/alkatrészadatokat a `Folyamat` és `Mérföldkövek` műveleti
sorokká alakítják, majd a következőket számítják vagy megjelenítik:

- az alkalmazható norma és egységidő;
- a műveleti mennyiség;
- átfutási idő és külön munkaigény;
- erőforrás/részleg;
- FS, SS, FF és SF függőség, késleltetés, részleges indítás és jóváhagyott
  felülírás;
- napi munkaidő-bontás, részlegterhelés és Gantt.

Az itt látható `Folyamat` eredmény a rövid távú adapter-bemenet a Planning
számára. Ugyanakkor a teljes modernizációhoz a két előző szakasz adatképzését
is le kell modellezni.

### 4. Kiíró: az üzemnek adott, végrehajtható információ

A Kiíró nem újratervezi a gyártást. A jóváhagyott projekt-, alkatrész- és
műveleti adatokat teszi használhatóvá az üzem számára. A modern Doorstar
felületen ezért kiadáskor mindig ugyanahhoz a verziózott projekthez,
alkatrészlistához és műveleti tervhez kell kapcsolódnia, amelyet a tervezés
használt.

## Modern céladatmodell

| Mai üzleti adat | Modern Doorstar fogalom | Kötelező kapcsolat |
|---|---|---|
| Gyártásmegrendelő sora | `ProductionOrder` / projekt | saját, stabil forrásazonosító |
| Termék konfigurációja | `ProductConfiguration` | a projekthez tartozik |
| Kalkulált alkatrész | `ComponentRequirement` | termék, mennyiség, kész- és szabászati méret |
| Normaidő-sor | `OperationStandard` | verzió, egység, erőforrás és minősítők |
| Folyamat-sor | `OperationCandidate` | alkatrész, norma, mennyiség és függőségek |
| Jóváhagyott terv | `PlanningProposal` / `PlannedOperation` | norma- és naptárverzió |
| Kiírt üzemi adat | `IssuedWorkPackage` | csak jóváhagyott tervverzióra mutathat |

## Rendszerhatárok

Doorstar birtokolja a projekt-, termék-, alkatrész-, szabászati és kiadási
üzleti adatokat, valamint a `doorstar.scheduling-import` adaptert. A
`spaceos.scheduling` platformmodul birtokolja a generikus ütemezési magot,
naptár- és kapacitásfoglalást, a bérlői biztonságot és a publikált API-t.

Ez azt jelenti, hogy a Doorstar adja át a teljesen ellenőrzött műveleti
bemenetet, a platform pedig tervjavaslatot és kapacitásos ütemezési eredményt
ad vissza. A Doorstar felület jeleníti meg és az üzemnek kiadja azt.

## Kernelkapcsolat és kézfogás

Ez a lánc csak a kernel Project–FlowEpic–Task modellhez kapcsolva érvényes.
A Gyártásmegrendelő modern megfelelője hiteles Project-hivatkozással indul;
a Kalkulátor, a Folyamatok, a Planning-javaslat és a Kiíró a kapcsolt scope és
revízió mentén működik. Doorstar nem hoz létre párhuzamos kernel-adatmodellt,
hanem a publikált contractot és kézfogási csomagot fogyasztja.

A kötelező hivatkozási és biztonsági szabályokat a
`../architecture/DOORSTAR_KERNEL_HANDSHAKE_ALIGNMENT_2026-07-28.md` rögzíti.

## Megvalósítási sorrend

1. A négy munkafüzet közti konkrét bemeneti/kimeneti mezők és Power Query
   kimeneti sémák feltérképezése.
2. A `Gyártásmegrendelő → Kalkulátor` üzleti szabályok modern,
   tesztvezérelt modellje.
3. A `Kalkulátor → Folyamat` alkatrész- és műveletképzés modellje.
4. A már megkezdett `Folyamat` adapter: csak jóváhagyott standardhoz és
   forrásazonosítóhoz kötött műveletet adhat át.
5. Kernel- és platform-kontraktus után generált TypeScript-klienssel tervjavaslat,
   shadow-összevetés és jóváhagyott kiadás.
6. A Kiíró modern, verziózott üzemi dokumentum-/felületkimenete.

## Elfogadási feltételek

- Egy kiadott üzemi tétel visszavezethető a projektig, az alkatrészig, a
  méretekig, a normáig és a jóváhagyott tervverzióig.
- A rendszer nem választ normát pusztán megjelenítési név alapján.
- A mennyiség, készméret és szabászati méret forrása egyértelmű és verziózott.
- A tervezés nem publikálhat hiányos alkatrész-, norma-, erőforrás- vagy
  naptáradattal.
- A modern logika kiválasztott valós példákon funkcionálisan összevethető a
  régi munkafüzettel, miközben nem hordoz Excel-cellahivatkozást vagy képletet.
