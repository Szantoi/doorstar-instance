# Sales → felmérés → műszaki előkészítés v1

## Üzleti döntések

- Ugyanazon megrendelő új igénye is **új projekt és új rendelés**. Korábbi
  beépítés vagy rendelés nem írható felül és nem használható újra projektként.
- A Sales külön munkatér. Ügyfél- és ajánlati adatot rögzít, majd dokumentumot
  ad át; nem véglegesít gyártási adatot.
- A felmérés külön munkatér. Ez a forrása a végleges műszaki adatoknak.
- A műszaki előkészítés csak a felmérésen validált adatokkal indíthat
  gyártható specifikációt. A Sales-csomagot előzetes tájékozódásra látja, de
  nem adhat belőle gyártási kiadást.
- A beépítő minden kiadott beépítési ellenőrzőlistát köteles kitölteni; a
  hiányos helyszíni dokumentáció nem zárhatja le a beépítést.

## Állapotgép

```text
SALES_DRAFT
  → SALES_DOCUMENTS_RECEIVED
  → SURVEY_PENDING
  → SURVEY_COMPLETED
  → TECHNICAL_PREPARATION
  → REVIEW
  → APPROVED
  → (kalkuláció / tervezés / üzemi kiadás)
```

`SALES_DOCUMENTS_RECEIVED` azt jelenti, hogy a Sales a dokumentumcsomagot
átadta és a műszaki előkészítés **előzetesen** dolgozhat rajta. Nem jelenti,
hogy méret, típus vagy kivitel végleges.

Ha nincs felmérés, a folyamat nem ugorhat közvetlenül műszaki jóváhagyásra:
`SURVEY_PENDING → SURVEY_EXCEPTION_REVIEW → TECHNICAL_PREPARATION` csak
névvel, indoklással és jóváhagyással rögzített kivételként lehetséges.

## Felmérésen véglegesítendő gyártási adatok

Pozíciónként kötelező:

1. ajtótípus;
2. méret: **szélesség × magasság × vastagság**;
3. felület / kivitel;
4. falpaneles, blendés vagy egyik sem;
5. üveges vagy nem üveges, üveges kivitel esetén az üveg specifikációja;
6. nyitásirány és a szükséges helyszíni megjegyzés.

Ezeket a rendszer nem csak adatlapként kezeli: a típus, felület, falpanel/
blende és üveg konfigurációs kulcsa később a kalkulációt, alkatrészképzést és
műveletjelölteket is meghatározza. Hiányuk blokkolja a jóváhagyást.

## Sales dokumentumátadás

Első, átmeneti forrás:

```text
C:\Users\szant\Doorstar Kft\Gyártás-Dokumentumok - Dokumentumok\01 - Megrendelés
```

Megfigyelt mappaminta: `DSMR <munkaszám> <ügyfél> ...`; egy előzetes felmérési
csomagban PDF-ek, DWG rajzok és falpanel-rajzok is lehetnek. A rendszer a
mappát kezdetben csak olvasási forrásként kezeli; fájlt nem nevez át, nem
mozgat és nem ír vissza.

| Fájltípus | Kezelés |
| --- | --- |
| `.pdf`, `.dwg`, jóváhagyott képi rajz | verziózott dokumentumjelölt |
| `.bak` | kizárt: lokális AutoCAD mentés |
| `.dwl`, `.dwl2` | kizárt: szerkesztési zárolás |
| `desktop.ini` | kizárt: rendszerfájl |

A mappanévben szereplő „előzetes” csak jelzés; a rendszer állapotát nem a
fájlnév, hanem a Sales/felmérő által rögzített státusz vezérli. A későbbi
SharePoint-szinkron ennek a mappának a megfelelő dokumentumtárát, azonos
olvasási és kizárási szabályokkal fogja figyelni.

## Beépítői lezárási kapu

Minden kiadott beépítési pozíción rögzítendő: beépített mennyiség, státusz,
időpont, beépítő, fotó vagy indokolt bizonyíték, eltérés/hibajegy, valamint
átadás-átvételi állapot. Eltérés nem írhatja át a jóváhagyott rendelést; a
megfelelő műszaki előkészítőnek `site_issue` review-feladatot nyit.
