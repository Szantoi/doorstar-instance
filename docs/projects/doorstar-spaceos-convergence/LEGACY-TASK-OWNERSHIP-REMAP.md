# Legacy Doorstar softlaunch taskok ownership-megfeleltetése

> **Forrás:** `docs/projects/TASKS.yaml` (2026-07-08)  
> **Döntés:** a legacy epic `blocked`; az alábbi megfeleltetés nélkül nem
> diszpécselhető egyetlen régi task sem.

## Miért szükséges?

A régi tasklánc abból az időből származik, amikor Doorstar-agentek közvetlenül
Kernel-, Joinery- és Orchestrator-forrást is módosítottak volna. A célarchitektúra
szerint a Doorstar csak publikált SpaceOS/JoineryTech contractot és bundle-t
fogyaszt. Emiatt a régi taskokat nem szabad változtatás nélkül végrehajtani.

## Megfeleltetés

| Legacy task | Tényleges tulajdon | Új végrehajtási hely / döntés |
|---|---|---|
| TASK-DS-001..004 Keycloak/JWT | Doorstar instance + platform security contract | `DSCONV-GATE-SECURITY` → `DSCONV-03`; realm/credential művelet emberi kapu |
| TASK-DS-005 tenant/facility seed | Doorstar instance data | `DSCONV-03` és `DSCONV-05`, platform API/migration contracton keresztül |
| TASK-DS-006..007 `DoorstarSeedData.cs` a Joinery modulban | régi, tiltott instance-in-platform minta | kiváltja `DSCONV-04/05`; általános faipari seed csak JoineryTech task lehet |
| TASK-DS-008..010 Joinery mediation route/saga/E2E | platform contract + Doorstar adapter | platformoldal: `ERPSEP-03/05/06` és `PROJECT-CORE-ADR`; Doorstar adapter: `DSCONV-05/06` |
| TASK-DS-011 platform nginx/health | megosztott health contract + Doorstar deploy | platformoldal: `ERPSEP-05`; Doorstar futtatás: `DSCONV-07` |
| TASK-DS-012..014 B2B validation | Doorstar fogyasztói integráció | `DSCONV-08`, csak `PROJECT-CORE-ADR` és security gate után |
| TASK-DS-015..018 onboarding/UAT/security audit | Doorstar | megmarad, de `DSCONV-08` release-gate-be olvad; credentialet nem tárolhat |
| TASK-DS-019..021 deploy/monitoring/SLA | Doorstar üzemeltetés | `DSCONV-07/08`; éles deploy és SLA emberi feladat |

## Platform-gap visszaadási szabály

Ha a Doorstar végrehajtás közben hiányzó általános képességet talál:

1. contract-gap riport készül reprodukcióval;
2. a JoineryTech conductor a megfelelő `ERPSEP` vagy `PROJECT-CORE` taskhoz köti;
3. a javítás a JoineryTech repositoryban készül és verziózott artifactként jelenik meg;
4. Doorstar csak a publikált artifact új verzióját fogyasztja;
5. tilos a platformkód lokális másolata vagy Doorstar-only patch-e.

## Feloldási feltétel

A legacy softlaunch epic csak akkor vehető vissza `active` állapotba, ha:

- DSCONV-00 baseline elkészült;
- minden nyitott legacy task `retired`, új taskra mapped vagy bizonyítottan
  továbbra is Doorstar-owned;
- a conductor frissítette a taskláncot úgy, hogy nincs cross-repo mutáció;
- root jóváhagyta az új critical pathot.

