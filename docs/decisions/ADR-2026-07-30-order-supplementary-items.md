# ADR — Önálló rendelési tartozékok

**Dátum:** 2026-07-30  
**Státusz:** elfogadott  
**Kapcsolódó feladat:** DSORD-07 / Sales-PDF import

## Háttér

A Sales-PDF felmérés 244 kiegészítőtermék-jelöltet talált. Ezek között van
kilincsgarnitúra, zártest, lábazati szegőléc, takaró- és egyéb tartozék. A
DSMR-26135 például öt kilincsgarnitúrát és öt zártestet, a DSMR-26145 pedig
öt 2,4 fm-es lábazati szegőlécet tartalmaz. Ezek nem ajtópozíciók, és nem
önállóan gyártandó falpanelek/bútorfrontok.

## Döntés

`OrderSupplementaryItem` külön rendelési lane lesz, az `OrderRevision` alatt.
Kötelezően megtartja a Sales-forrásból kiolvasott kódot, nevet, opcionális
mennyiséget és egységet, valamint a feldolgozatlan leírást. A számított
mennyiség (például lineáris méter) csak akkor tárolható külön mezőben, ha az
egységnyi hossz és a darabszám is explicit forrásérték; soha nem lesz
hallgatólagos `1`.

Minden rekord legalább egy mezőszintű evidence sort kap: relatív útvonal,
oldal/sor, mező, nyers és normalizált érték, review-státusz, valamint opcionális
regisztrált `OrderDocument` hivatkozás. A rekord DRAFT alatt `REVIEW`, emberi
ellenőrzés után `VERIFIED` vagy `REJECTED`; önmagában nem indít kalkulációt,
beszerzést vagy gyártást.

Az UI ezt önálló tartozék-lane-ként kezeli. Nem írja `OrderPosition`-,
`ManufacturedItem`- vagy hardver-katalógusmezőbe, hacsak egy későbbi,
jóváhagyott szabály explicit nem kapcsolja oda.

## Két rögzítési mód

1. **Forrásból érkezett (`SOURCE_REVIEW`)**: ritka vagy importált tétel.
   Kötelező legalább egy mezőszintű evidence, és a tétel `REVIEW` állapotból
   csak emberi döntéssel léphet tovább.
2. **Kézzel felvett (`MANUAL`)**: általános, rendeléshez tartozó tétel.
   A felhasználó névvel, mennyiséggel, egységgel, kategóriával és indoklással
   hozza létre. Nem kell hozzá örökölt PDF-sor, de a felvivő szerepköre és
   időpontja auditált, a tétel pedig a revízió jóváhagyásáig módosítható.

Mindkét mód ugyanazt az `OrderSupplementaryItem` aggregate-et és UI lane-t
használja. Így az általános tételek gyorsan rögzíthetők, az importált ritka
tételekhez pedig nem vész el a forrásbizonyíték.
