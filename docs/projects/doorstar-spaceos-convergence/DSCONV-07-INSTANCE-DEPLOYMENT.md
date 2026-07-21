# DSCONV-07 — Doorstar instance descriptor, lock, install és rollback

- **Szerep:** backend/infra
- **Prioritás:** P1
- **Státusz:** pending (dependency-blocked)
- **Függőség:** DSCONV-06, DSCONV-GATE-BUNDLE
- **Mutációs határ:** Doorstar descriptor/lock, deploy config/script és staging runbook
- **Tiltott scope:** automatikus production deploy, platform installer módosítása,
  credential commit

## Cél

A Doorstar telepítés deklaratív descriptorból és pontos lockfile-ból
reprodukálható legyen. Stagingen bizonyított install, kompatibilis upgrade,
szándékosan hibás upgrade és rollback készüljön.

## Megvalósítási lépések

1. Készíts Doorstar `spaceos.instance/v1` descriptort.
2. Oldd fel és rögzítsd a platform, ERP, JoineryTech és Doorstar bundle digesteket.
3. Secretet environment/secret store-ból injektálj, ne descriptorból.
4. Futtass staging clean installt és adatbackfillt.
5. Futtass kompatibilis upgrade-et, majd hibás upgrade rollback-próbát.
6. Ellenőrizd health/readiness, API/UI smoke, nginx és systemd MainPID/listener egyezést.
7. Készíts production runbookot és emberi go/no-go checklistet.

## Elfogadási kritériumok

- [ ] Ugyanaz a lock ugyanazokat a digesteket telepíti.
- [ ] Install/upgrade/rollback log auditálható és secretmentes.
- [ ] Hibás migration vagy health esetén nincs aktiválás.
- [ ] Rollback után DB/API/UI smoke zöld.
- [ ] Nginx fájljogosultság és MainPID csapda automatizált ellenőrzést kap.
- [ ] Production deploy külön root jóváhagyásra vár.

## Stop / eszkaláció

Backup, rollback vagy compatibility verdict nélkül stagingen túl nem léphet.
SSH/deploykulcs és éles restart emberi kapu.

## Végrehajtási napló

_Az agent tölti ki._

## Átadási bizonyíték

_Descriptor/lock hash, install/upgrade/rollback log és runbook._
