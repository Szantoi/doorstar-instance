# DSORD-12 — Kétoldali felületkezelés közérthető rendelési összefoglalója

**Dátum:** 2026-07-31  
**Felelős:** frontend  
**Állapot:** kész

## Cél

A rendelési adatlap olvasója egy pillantással értse meg, hogy az ajtónak két,
helyiség felőli nézete van, és ezek ajtólap- illetve tokfelülete önálló döntés.
A felület ugyanakkor nem állíthatja, hogy a legacy `fix:` / `mozgó:` jelöltek
már a fizikai A vagy B oldalhoz tartoznak.

## Kiinduló UX-probléma

A jelenlegi panel domain-biztonságos, de az elsődleges információt sok
szakkifejezés, ismétlődő `Feloldatlan` állapot és egy állandóan nyitott,
ötcélos műszaki táblázat mögé rejti. A forrásban ténylegesen megtalált
felületértékek csak a blokk alján látszanak, ezért a felhasználó nehezen tudja
megmondani, azonos vagy eltérő felület szerepel-e a két forrásjelöltnél.

## Design intent

1. A blokk első címe az üzleti kérdést nevezi meg: **Az ajtó két oldalának
   felületkezelése**.
2. Az A és B oldal két azonos súlyú kártya. Az emberi `A oldal` / `B oldal`
   megnevezés az elsődleges; a stabil `SIDE_A` / `SIDE_B` kód másodlagos.
3. Egy rövid magyarázat különválasztja a fizikai oldalt a tokborítás
   `FIX` / `ÁLLÍTHATÓ` szerepétől.
4. A legacy forrásban talált értékek kiemelt, de **kiosztatlan**
   forrásjelöltként jelennek meg. Az UI kimondja, ha a két szerepjelölt azonos
   vagy eltérő, de egyiket sem másolja A/B oldalra vagy komponensre.
5. A profil-, borítás- és appearance-target részletek alapból zárt,
   billentyűzettel kezelhető `details` blokkba kerülnek. A nyers örökölt érték
   külön lenyitható.
6. A panel read-only marad. Strukturált szerkesztés csak a verziózott backend
   `DoorStructureSpec`, evidence/lineage, readiness és concurrency szerződés
   után készülhet.

## Elfogadási feltételek

- Asztali és 390 px mobilnézetben nincs dokumentumszintű vízszintes
  túlcsordulás.
- A/B oldalkártyán nem jelenhet meg `fix:` vagy `mozgó:` forrásérték.
- Két explicit forrásjelölt azonos/eltérő állapota közérthetően látszik.
- Egyoldali vagy összevont forrás nem hoz létre kitalált ellenoldalt.
- A műszaki ötcélos bontás és a nyers forrásérték alapból zárt.
- A komponens DOM-tesztje, a teljes frontend tesztcsomag, TypeScript lint és
  production build zöld.
- A rendelési adatlap világos asztali, valamint sötét mobil nézetben vizuálisan
  ellenőrzött; konzolhiba nincs.

## Határ

Ez a task kizárólag a meglévő, read-only összefoglaló érthetőségét javítja.
Nem változtat adatmodellt, API-t, review-readiness szabályt vagy mentési
payloadot, és nem minősít legacy forrásjelöltet jóváhagyott felületkiosztássá.

## Eredmény

- Az A és B helyiség felőli nézet két azonos súlyú, gyorsan áttekinthető
  kártyát kapott.
- Az örökölt felülettípus és a `FIX` / `ÁLLÍTHATÓ` címkéjű értékek külön,
  látható, de kiosztatlan forrásjelöltek. Azonos vagy eltérő értéküket a panel
  kimondja, miközben egyik sem kerül az A/B kártyákra.
- Az ötcélos műszaki bontás és a nyers forrás alapból zárt natív `details`
  elem. Mobilon a műszaki táblázat megtartja a valódi fejléc- és sorfejléc-
  szemantikát; a 600 px széles táblázat megnevezett, fókuszolható belső régióban
  görgethető.
- A megoldás read-only maradt; nem készült adatmodell-, API-, readiness- vagy
  mentésipayload-változás.

## Nexus-forrás és bizonytalanság

A faipari háttér ellenőrzéséhez kizárólag a frontend szerep saját
`doorstar_knowledge_frontend` Nexus keresése futott.

- **Forrás:** *Épületasztalos szakrajz (szega.hu #134)*,
  `szega_book_134_oldal_008.jpg`, 8. oldal, relevancia `0,5971`. A találat külön
  fogalomként sorolja a tokborítás külméretét, a falnyílás méretét, a tokmag
  külméretét és a falvastagságot.
- **Forrás:** *Épületasztalos szakrajz (szega.hu #134)*,
  `szega_book_134_oldal_124.jpg`, 124. oldal, relevancia `0,5497`. A jelmagyarázat
  külön vízszintes és függőleges tokborítást nevez meg, beépítés utáni
  állapotban.

**Bizonytalanság:** a Nexus-találatok támogatják a tokborítás, tokmag és
falvastagság fogalmi elkülönítését, de nem igazolják közvetlenül, hogy a
`FIX` / `ÁLLÍTHATÓ` minden faipari rendszerben tokborítás-szerep, és nem A/B
oldal. Ezért az UI nem általános iparági tényként fogalmaz, hanem kifejezetten
„A Doorstar örökölt forrásában” határolja az állítást. A konkrét Doorstar
modell authorityja továbbra is az
`ADR-2026-07-30-two-sided-door-structure-appearance.md`; a Nexus-találat csak
forrásjelölt, nem gyártási vagy kiosztási authority.

## Ellenőrzés

- Célzott DOM-regresszió: 2 fájl, 9/9 teszt; a FIX-only és ÁLLÍTHATÓ-only
  esetek sem hoznak létre ellenoldalt.
- Teljes frontend suite: 30/30 tesztfájl, 114/114 teszt; TypeScript lint és
  production build zöld. A build csak a már ismert 500 kB feletti chunk-
  figyelmeztetést adja.
- Független monitor utó-QA: PASS a mobil táblázatszemantikára és az egyoldali
  forrásesetekre.
- Böngésző: 1440×1000 világos és 390×844 sötét nézetben a dokumentum
  `scrollWidth === clientWidth`; a technikai táblázat 325 px-es belső régióban
  600 px-ig görgethető, miközben a `table` / `thead` szemantika megmarad.
  A műszaki és nyers részletek alapból zártak, warning/error konzolbejegyzés
  nincs.
- Élesítés nem történt.
