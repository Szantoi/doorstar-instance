# DSORD-16 — Felmérési forrás és ellenőrzött adatkapu

**Dátum:** 2026-07-31  
**Felelős:** backend + frontend  
**Állapot:** kész

## Cél

A DSMR-26148-hoz hasonló, csak megrendelt esetekben a rendszer ne nevezze a
Salesből származó értékeket felmért ténynek, és felmérési forráskapcsolat nélkül
ne engedje `SURVEY_COMPLETED` állapotba a revíziót.

## Megvalósított szerződés

- A rendelési Pozíció 360° összefoglaló **Rögzített forrásadatok** címet és
  source-aware állapotot használ:
  - hiányzó `SURVEY` kapcsolat blokkoló;
  - kapcsolt `SURVEY` dokumentum nulla evidence mellett semleges lineage-jelzés;
  - hiányos evidence-audit blokkoló.
- A dokumentumpanel kimondja, hogy a fájlverzió, hash és pozíciókapcsolat nem
  jelent mezőszintű tartalmi ellenőrzést.
- A felmérési munkatér előre felsorolja a strukturált adat-, dokumentum-,
  pozíciókapcsolat- és evidence-audit blokkolókat.
- A szerver-authoritatív kapu teljes legacy mezőket, kész falvastagságot,
  `doorTypeKey` / `wallSolutionKey` / `glassKey` katalógusdrivereket, legalább
  egy `SURVEY` dokumentumot és minden pozícióhoz exact dokumentumverzió-linket
  követel.
- Nulla evidence elfogadható a kézi felmérési folyamatban. Ha evidence létezik,
  minden sora csak teljes, attribútált, auditált `RESOLVED` döntéssel fogadható
  el.
- A `survey_data_incomplete` 409 válasz géppel feldolgozható részleteket ad.
  Prisma- vagy migrációváltozás nem készült.

## DSMR-26148 ellenőrzés

Az élő helyi read model változatlanul `DRAFT / SURVEY_PENDING`:

- 2 hiányos pozíció;
- 1 Sales PDF;
- 0 `SURVEY` dokumentum;
- 0 közvetlen felmérési dokumentum–pozíció kapcsolat;
- 0 mezőszintű evidence.

A rendelési oldalon ezért mindkét pozíció „Felmérési forráskapcsolat hiányzik”
jelzést kap. A felmérési munkatér három blokkolócsoportot mutat, és a
véglegesítés gombja tiltott. Teszt- vagy QA-célból sem változott a DSMR-26148
adatbázisrekordja.

## Forrás és bizonytalanság

- A Sales PDF közvetlenül ellenőrzött, az adatbázis dokumentumhashével egyező
  rendelési forrás.
- A kézzel kitöltött JPG DSMR-mezője üres. A 26148-as kapcsolatot a szülőmappa,
  valamint a vizuálisan egyező név és cím támasztja alá; ezért továbbra is
  review-köteles dokumentumjelölt, nem workflow-authority.
- A kézírás pontos tartalma nem került automatikusan strukturált adatként
  elfogadásra.
- Faipari háttérállítás nem történt; a változtatás kizárólag helyi forrás-, API-
  és workflow-bizonyítékra épül, ezért Nexus-lekérdezésre nem volt szükség.

## Ellenőrzés

- Frontend célzott: 5 fájl / 18 teszt.
- Frontend teljes: 33 fájl / 130 teszt; TypeScript lint és production build
  zöld. A build csak az ismert 691,16 kB-os chunk-figyelmeztetést adja.
- Backend célzott: 10 fájl / 24 teszt.
- Backend teljes: 41 fájl / 131 teszt izolált PostgreSQL sémákban; TypeScript
  build és OpenAPI 3.1, 83/83 route coverage zöld.
- Böngésző QA: helyi DSMR-26148 rendelési és felmérési route asztali, 390×844
  mobil és sötét mobil nézetben ellenőrizve. Dokumentumszintű vízszintes
  túlcsordulás nincs; csak a szándékos navigáció- és műszaki táblázatrégió
  görgethető. A blokkolók olvashatók, a véglegesítés tiltott.
- Eredeti forrásfájl, Prisma/migráció, public/production adat és deploy nem
  változott.

## Design authority

`docs/decisions/ADR-2026-07-31-survey-source-verification-gate.md`

