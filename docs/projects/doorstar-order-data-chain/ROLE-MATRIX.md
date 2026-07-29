# Doorstar szerepkör- és jogosultsági mátrix v1

## Alapelv

A jogosultság három részből áll: **szerepkör**, **projekthez/rendeléshez való
hozzárendelés** és **revízióállapot**. A szerepkör önmagában nem ad jogot egy
másik projekt módosítására, és jóváhagyott vagy kiadott adat nem szerkeszthető
közvetlenül.

| Kód | Szerepkör | Fő feladat |
| --- | --- | --- |
| `sales` | Értékesítés / rendelésfelvétel | Piszkozat rendelés és ügyféladatok |
| `technical_preparation` | Műszaki előkészítő | Ajtópozíciók, műszaki specifikáció, dokumentum-előkészítés |
| `order_approver` | Jóváhagyó vezető | Rendelési revízió ellenőrzése és jóváhagyása |
| `production_planner` | Termeléstervező | Jóváhagyott adatokból tervjavaslat, kapacitás és gyártási előkészítés |
| `shop_floor` | Üzemi állomáskezelő | Kiadott munkacsomag végrehajtása az állomáson |
| `installer` | Beépítő | Kiadott beépítési csomag, helyszíni visszajelzés, átadás-átvétel |
| `warehouse_dispatch` | Raktár / kiszállítás | Csomagolás, kiszállítás, átadási bizonyíték |
| `administrator` | Rendszergazda | Felhasználó-, szerepkör-, integráció- és katalóguskezelés |
| `reader` | Csak olvasó | Jogosult projektek aktuális, nem érzékeny nézete |

## Műveleti mátrix

| Művelet | Sales | Műszaki | Jóváhagyó | Tervező | Üzem | Beépítő | Raktár | Admin | Olvasó |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Rendelési piszkozat létrehozása | igen | igen | igen | – | – | – | – | igen | – |
| Piszkozat ügyfél-/határidőadat módosítása | igen | igen | igen | – | – | – | – | igen | – |
| Műszaki specifikáció módosítása | – | igen | igen | – | – | – | – | igen | – |
| Review-ra küldés | igen | igen | igen | – | – | – | – | igen | – |
| Jóváhagyás / leváltás | – | – | igen | – | – | – | – | igen | – |
| Kalkuláció / műveletjelölt képzése | – | igen | igen | igen | – | – | – | igen | – |
| Tervezési javaslat és kiadás előkészítése | – | – | – | igen | – | – | – | igen | – |
| Kiadott üzemi csomag végrehajtása | – | – | – | megtekintés | igen | – | igen | – | megtekintés |
| Beépítési csomag megnyitása | – | megtekintés | megtekintés | megtekintés | – | igen | megtekintés | igen | hozzárendelve |
| Helyszíni fotó / hibajegy / átadás rögzítése | – | megtekintés | megtekintés | – | – | igen | igen | igen | – |
| Rendelés vagy műszaki adat módosítása kiadás után | – | – | – | – | – | – | – | – | – |

## Beépítői korlátok

A `installer` csak a neki vagy csapatának kiosztott, **kiadott** beépítési
csomagot és annak konkrét dokumentumverzióit látja. Rögzíthet helyszíni
állapotot, fotót, eltérést, hiányt és átadás-átvételi bizonyítékot. Nem
módosíthat rendelési revíziót, méretet, műszaki specifikációt, kalkulációt,
gyártási tervet vagy korábbi dokumentumverziót.

Eltérés esetén a rendszer `site_issue` review-feladatot nyit a műszaki
előkészítőnek; nem készít csendes módosítást. Ha a változtatás szükséges, új
order-revízió és a szokásos jóváhagyási/kiadási lánc készül.

## Jóváhagyási elválasztás

- `technical_preparation` előkészít, de nem hagyhat jóvá saját revíziót.
- `order_approver` hagy jóvá; a jóváhagyási naplóban mindig szerepel a
  felhasználó, az időpont, a revízió tartalmi hash-e és az indoklás.
- `administrator` vészhelyzeti jogosultsága auditált; normál üzleti
  jóváhagyóként nem használjuk.

## Megvalósítási lépések

1. A jelenlegi ideiglenes `vezeto` / `allomas` fejlécértékeket a fenti
   stabil jogosultságkódokra képezzük le, kompatibilitási átmenettel.
2. Bevezetjük a projekt- és beépítési-csomag-hozzárendelést.
3. Az Entra/SharePoint csoportokat ezekhez a Doorstar-szerepkörökhöz
   rendeljük, de a Doorstar-oldali revízióállapot-gate továbbra is kötelező.
4. A GraphRAG lekérdezés a szerepkör + projekthozzárendelés + SharePoint ACL
   metszetére szűr még a visszakeresés előtt.
