# DSCONV-04 — Doorstar instance packok kivonása

- **Szerep:** frontend/designer, backend schema reviewer
- **Prioritás:** P1
- **Státusz:** pending (dependency-blocked)
- **Függőség:** DSCONV-GATE-INSTANCE
- **Mutációs határ:** Doorstar brand/terminology/config/template/form packok és
  fogyasztó adapterek
- **Tiltott scope:** platform schema módosítása, domain refaktor, UX-redesign

## Cél

A Doorstar saját képe és műhelytudása platformforrás módosítása nélkül,
verziózott és validálható instance packokban éljen.

## Kötelező packok

- `doorstar.brand`: tokenek, assetek, font és engedélyezett shell-opciók;
- `doorstar.hu-HU`: terminológiai kulcsok;
- `doorstar.workshop`: stationlista és station→stage mapping;
- `doorstar.production-template`: 6-stage workflow;
- `doorstar.project-sheets`: QUANTITIES/CUTTING/HARDWARE sémák és verziók;
- szükséges Doorstar policy metadata, de auth/policy implementáció DSCONV-03.

## Megvalósítási lépések

1. Fagyaszd a jelenlegi vizuális és config baseline-t screenshot/hash bizonyítékkal.
2. Töltsd ki az ERPSEP-07 schema-kat Doorstar tartalommal.
3. A backend validálja a ProjectSheet payloadot schema+version alapján.
4. Adj migrációt a meglévő verzió nélküli JSON rekordokhoz.
5. A UI ugyanazt a packot fogyassza, ne tartson párhuzamos hardcode-ot.
6. Készíts invalid pack és backward compatibility teszteket.

## Elfogadási kritériumok

- [ ] A stations, 6-stage, sheet alak és brand egyetlen forrásban él.
- [ ] Ismeretlen/hibás pack vagy schema verzió fail-fast.
- [ ] ProjectSheet backendoldalon validált.
- [ ] A jelenlegi Doorstar kulcsképernyők vizuális regressziója elfogadott.
- [ ] A packokban nincs secret vagy environment-specifikus URL.

## Stop / eszkaláció

Ha egy szabály tranzakciós invariáns, ne tedd JSON-ba; jelöld policy/domain
döntésre. Platform schema bővítés a JoineryTech ERPSEP-07 taskba kerül.

## Végrehajtási napló

_Az agent tölti ki._

## Átadási bizonyíték

_Pack verziók/hash-ek, schema tesztek, migráció és vizuális baseline._
