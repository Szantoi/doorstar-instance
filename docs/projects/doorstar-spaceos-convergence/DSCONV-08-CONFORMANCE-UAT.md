# DSCONV-08 — Doorstar conformance, regressziós E2E és UAT

- **Szerep:** QA/frontend reviewer/security
- **Prioritás:** P0 release gate
- **Státusz:** pending (dependency-blocked)
- **Függőség:** DSCONV-07
- **Mutációs határ:** teszt, fixture, UAT dokumentáció és release-javaslat
- **Tiltott scope:** feature implementáció, teszt skip, automatikus élesítés

## Cél

Független reviewer bizonyítsa, hogy a konvergált Doorstar megőrzi a jelenlegi
fő üzleti flow-t, megfelel a SpaceOS contract/security/bundle szabályainak, és
üzemeltethető. A task kimenete release-javaslat, nem automatikus go-live.

## Kötelező tesztmátrix

- OpenAPI és generált kliens drift;
- JWT, permission, station spoof és cross-tenant negative path;
- bundle signature, lock és compatibility;
- project/task/stage migration data reconciliation;
- fő Doorstar flow: projekt → epik → task → station/Kanban → completion;
- ProjectSheet, capacity, comment/image/audit regresszió;
- mobil/tablet vizuális baseline és accessibility smoke;
- install/upgrade/rollback E2E;
- performance baseline a convergence előtti értékhez képest.

## Elfogadási kritériumok

- [ ] A teljes conformance suite zöld.
- [ ] Nincs skipped/törölt teszt vagy új warning.
- [ ] Adatreconciliation 100%, vagy minden eltérés emberileg elfogadott.
- [ ] A fő flow vizuális és viselkedési regresszió nélkül fut.
- [ ] Security reviewer megpróbálta megkerülni a tenant/station/module gate-et.
- [ ] Doorstar stakeholder UAT döntése rögzített.
- [ ] Go/no-go csomag tartalmaz rollbacket és ismert maradék kockázatot.

## Stop / eszkaláció

Critical/high security, adatvesztési, rollback- vagy fő flow hiba esetén NO-GO.
Éles deploy csak Gábor/root explicit jóváhagyásával.

## Végrehajtási napló

_A reviewer tölti ki; készítő nem lehet egyedüli ellenőr._

## Átadási bizonyíték

_Conformance/E2E/UAT riport, performance diff és go/no-go ajánlás._
