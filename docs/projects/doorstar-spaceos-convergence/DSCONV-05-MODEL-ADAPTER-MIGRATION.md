# DSCONV-05 — project/workflow adapter és adatmegőrző migráció

- **Szerep:** backend/architect
- **Prioritás:** P0
- **Státusz:** pending (dependency-blocked)
- **Függőség:** DSCONV-02, DSCONV-GATE-INSTANCE
- **Mutációs határ:** Doorstar anti-corruption adapter, mapping, migráció és tesztek
- **Tiltott scope:** új platform Project/Task modell, platform repository mutáció,
  adateldobás, közvetlen éles migráció

## Cél

A Doorstar Project/Epic/EpicStep/Task/Stage adatai és viselkedése az elfogadott
SpaceOS ownershiphoz adapteren keresztül illeszkedjen. Ne legyen big-bang merge,
és ne keletkezzen harmadik source of truth.

## Megvalósítási lépések

1. Fogyaszd a DSCONV-01 field/state mappinget és a platform ADR contractját.
2. Készíts anti-corruption adaptert a jelenlegi Prisma modell köré.
3. Definiáld az identity, ordering, status, audit és optional-stage mappinget.
4. Írj idempotens backfillt, dry-run riporttal és unmapped-record listával.
5. Adj dual-read vagy shadow comparison szakaszt; dual-write csak ADR-rel.
6. Készíts rollbacket és adat-egyezőségi ellenőrző scriptet.
7. Csak bizonyított ekvivalencia után jelöld a duplikált modellt kiválthatónak.

## Teszt- és bizonyítékterv

- golden Doorstar projekt teljes task/stage/audit lánccal;
- optional/skipped/reopened edge case;
- duplikált és hiányzó identity;
- transaction failure és újrafuttatás;
- row count, referential és state-distribution előtte/utána;
- adapter contract test a platform-verzió ellen.

## Elfogadási kritériumok

- [ ] Minden állapotnak explicit mappingje vagy döntési blokkja van.
- [ ] Dry-run nem ír adatot és tételes eltéréslistát ad.
- [ ] Backfill idempotens és rollbackelhető.
- [ ] Nincs adatvesztés vagy néma default.
- [ ] Shadow comparison a kijelölt golden flow-kon egyezést bizonyít.

## Stop / eszkaláció

Unmapped production adat, ownership-ADR eltérés vagy visszafordíthatatlan séma
esetén állj meg. Éles migráció kizárólag backup és emberi kapu után.

## Végrehajtási napló

_Az agent tölti ki._

## Átadási bizonyíték

_Mapping verzió, dry-run, row/state diff, rollback és contract teszt._
