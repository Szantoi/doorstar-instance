# 24181 — Aktív és Passzívház Kft. adatgyűjtési minta

**Állapot:** `SURVEY_PENDING` / tesztsémába betöltve  
**Feltérképezés:** 2026-07-29, csak olvasásos előnézet  
**Adatbázis-művelet:** sikeres DRAFT-import a `doorstar_test` sémába; 12 pozíció, 2 hash-elt dokumentumhivatkozás

## Forrásbiztonság

- A csomagban lévő `.xlsm` állományokból csak az OOXML-ben tárolt, gyorsítótárazott cellaértékeket olvastuk ki.
- VBA/makró nem futott, `vbaProject.bin` nem lett beolvasva vagy módosítva.
- A dokumentumok eredeti helyükön maradtak; a rendszer később csak relatív hivatkozásokat tárolhat.

## Felismert projekt

| Mező | Jelölt érték | Bizalom / teendő |
| --- | --- | --- |
| Projektkulcs | `DSMR-24181` | azonosító egyértelmű |
| Megrendelő | Aktív és Passzívház Kft. | a munkafüzetben szerepel |
| Pozíciók | 12 db, mindegyik 1 db | részletesen kiolvasható |
| Várható szállítás | 2026. augusztus vége | a 2026-06-24-i gyártásmegrendelésből; ez az elsődleges jelölt |
| Beépítés | 2025-03-01 | az ütemező Excel-sorszámából konvertálva; üzleti felülvizsgálat kell |

Az archív csomagban megtalálható a gyártásmegrendelő, kalkulátor, folyamat- és kiíró munkafüzet, PDF-ek és DWG-rajz. A `01 - Megrendelés` forrásban a munkához 19 dokumentumjelölt kapcsolódik. Egy eltérő munkaszámot tartalmazó segédfájl előfordulása miatt minden dokumentum-kapcsolat még ellenőrzésre vár.

## Kiolvasható pozíciók

| Poz. | Megnevezés | Típus | Nyitás | Falnyílás: szélesség × magasság × vastagság (mm) |
| --- | --- | --- | --- | --- |
| 01 | Gardrób F.05 | Tokba | Bal be | 890 × 2 120 × 135 |
| 02 | Szoba 1 F.04 | FAF T | Toló | 950 × 2 125 × 135 |
| 03 | Fürdő 1 F.06 | FAF T | Toló | 900 × 2 125 × 140 |
| 04 | Kamra F.08 | Síkban | Jobb ki | 800 × 2 100 × 100 |
| 05 | Gardrób F.07 | Síkban | Bal ki | 800 × 2 100 × 100 |
| 06 | Folyosó F.09 | FAF T | Toló | 980 × 2 125 × 130 (BKM 2 140 megjegyzéssel) |
| 07 | Dolgozó F.10 | Tokba | Jobb be | 950 × 2 120 × 125 |
| 08 | Szoba 2 F.11 | Tokba | Jobb be | 930 × 2 120 × 125 |
| 09 | Szoba 3 F.12 | Tokba | Bal be | 910 × 2 120 × 330 |
| 10 | Fürdő F.13 | Tokba | Jobb be | 830 × 2 120 × 330 |
| 11 | Gépészet F.14 | Tokba | Bal be | 1 000 × 2 120 × 350 |
| 12 | Zuhanyzó F.15 | Síkban | Jobb ki | 780 × 2 100 × 135 |

Mind a 12 pozíciónál kiolvasható a fix és mozgó oldali felület. A fő felület `Fóliás`; a domináns szín `THERMOFILM Highland Green Premier Matt`, néhány pozíciónál eltérő mozgó oldali színnel. A vasalat és a megmunkálási megjegyzések is a forrásban vannak. A méretek a 2026-06-24-i, négyoldalas Sales gyártásmegrendelésből származnak, és annak vizuális ellenőrzésével is egyeznek.

## Hiányzó vagy nem automatikusan elfogadható adatok

- A munkafüzetben üresek a szélesség × magasság × vastagság mezők, de a Sales gyártásmegrendelés PDF-je tartalmazza őket. Ezek előtölthetők DRAFT-ként, de felmérési jóváhagyás nélkül nem válnak véglegessé.
- Falpanel/blende és üvegezés nem megbízhatóan normalizálható ebből a mintából.
- Az ütemezőből kiolvasott 2025-ös dátumok ellentmondanak a 2026-os Sales gyártásmegrendelésnek és a benne jelzett 2026. augusztus végi szállításnak; a Sales adat az elsődleges, az ütemezői sorok felülvizsgálatra kerülnek.
- A felmérés tölti ki és véglegesíti a műszaki adatokat. A projekt a rendszerben `SURVEY_PENDING` előkészített piszkozat; nem kiadható gyártásba.

## Következő biztonságos lépés

1. A felmérés vagy a folyamatos Excel-adatbevitel egészítse ki pozíciónként a falkezelést, üvegezést és az esetleges méreteltéréseket.
2. A rendszerben rögzített hiba- vagy hiányjelzések alapján legyen javítható az importmapping; az Excel/PDF-források megmaradnak összevetési alapnak.
3. A fokozatos átállás alatt minden új betöltés csak `doorstar_test` DRAFT marad, amíg az éles átállás külön döntése meg nem születik.
