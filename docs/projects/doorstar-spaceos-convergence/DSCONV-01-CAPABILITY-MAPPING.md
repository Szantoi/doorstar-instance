# DSCONV-01 — Doorstar capability és adatmodell SpaceOS mapping

- **Szerep:** architect
- **Prioritás:** P0
- **Státusz:** completed — auditdokumentum elkészült, a platformdöntések
  `decision_required` jelöléssel átadva
- **Mutációs határ:** új auditdokumentum és tasknapló; minden alkalmazáskód read-only
- **Tiltott scope:** séma-, route-, package- vagy UI-módosítás

## Cél

Minden Doorstar capability kapjon `reuse`, `adapt`, `template`, `instance-only`,
`retire` vagy `decision_required` besorolást. Ez az audit a JoineryTech
ERP-boundary és Project Core döntések fogyasztói inputja.

## Kötelező leltár

- 39 körüli REST route tényleges listája és auth-viselkedése;
- Prisma Project/Epic/EpicStep/Task/StationWorkflow/ProjectSheet modellek;
- 6-stage enum és `stations.json` mapping;
- capacity, Kanban, task detail, audit, image/comment capability;
- frontend page/service/store/type és design tokenek;
- deploy, DB, migráció, test és seed;
- JoineryTech Production/FlowProject/StageChain fogalmi megfelelői.

## Kötelező kimenet

`docs/knowledge/architecture/DOORSTAR_SPACEOS_MAPPING_2026-07-18.md`, benne:

- capability matrix és source of truth;
- adatmező- és állapotmapping;
- contract gap;
- tenant/security threat boundary;
- instance packba kerülő elemek;
- platformcontractot igénylő elemek;
- adatmegőrzési és rollback kockázatok;
- átadási szakasz JoineryTech `ERPSEP-01` és `PROJECT-BOUNDARY-AUDIT` számára.

## Bizonyítékparancsok

```powershell
rg -n "router\.(get|post|put|patch|delete)" src/production-service/src
rg -n "^model |^enum " src/production-service/prisma/schema.prisma
rg -n "X-Role|X-Station|x-role|x-station" src
rg --files src/uzemi-tabla-web/src
```

## Elfogadási kritériumok

- [ ] Minden route és Prisma modell szerepel a leltárban.
- [ ] Nincs automatikus „merge” döntés csak névegyezés alapján.
- [ ] A Doorstar-specifikus és általános faipari capability szétválik.
- [ ] A mapping a platform gate-ekhez pontos contractigényt ad.
- [ ] Build/test bizonyíték nélkül semmi nem production-ready.

## Stop / eszkaláció

Ha a SpaceOS két projekt/workflow modelljének tulajdonosa nyitott, jelöld
`decision_required`; ne válassz egyiket név alapján.

## Végrehajtási napló

### 2026-07-18

- Létrejött a `docs/knowledge/architecture/DOORSTAR_SPACEOS_MAPPING_2026-07-18.md`
  audit: 36 REST endpoint (35 production API deklaráció + health), minden Prisma modell, a 6-stage/station mapping, UI és
  security boundary szerepel benne.
- Vizsgált Doorstar HEAD: `f51419eeb902b194e32aa63897e24263bda2f88a`.
- A DSCONV-00 baseline build/test eredményeire támaszkodik; új alkalmazáskód,
  package, schema, route vagy UI-módosítás nem történt.
- A Project/Epic/EpicStep/Task végső owner-e nem lett feltételezve; minden
  bizonytalan elem `decision_required` maradt a `PROJECT-CORE-ADR` és
  `ERPSEP-01` számára.

## Átadási bizonyíték

Doorstar HEAD, vizsgált fájlok, mapping output és nyitott döntések a
`DOORSTAR_SPACEOS_MAPPING_2026-07-18.md` dokumentumban.
