# Doorstar SpaceOS Convergence — agent belépési pont

> **Goal config:** [`../EPICS.yaml`](../EPICS.yaml)  
> **Tasklánc:** [`TASKS.yaml`](TASKS.yaml)  
> **Projektcél:** [`PROJECT.md`](PROJECT.md)  
> **Élő állapot:** [`STATUS.md`](STATUS.md)

A korábbi softlaunch tasklánc tulajdonosi megfeleltetése:
[`LEGACY-TASK-OWNERSHIP-REMAP.md`](LEGACY-TASK-OWNERSHIP-REMAP.md). A legacy epic
ennek lezárásáig `blocked`, nem diszpécselhető.

## Agent-protokoll

1. Olvasd el teljesen a repository `AGENTS.md`, `QUALITY.md`, ezt a README-t és
   a kiosztott taskkártyát.
2. Rögzítsd a Doorstar HEAD-et, dirty state-et, package-verziókat és baseline
   build/tesztet a task végrehajtási naplójában.
3. Más agent vagy felhasználó dirty fájlját ne formázd és ne mozgasd.
4. A `DSCONV-GATE-*` taskokat csak conductor/root zárhatja a felsorolt
   JoineryTech artifactok hash-ével és verziójával.
5. Doorstar agent nem módosíthatja a JoineryTech repositoryt.
6. Platformforrást nem másolunk át; csak csomag, OpenAPI/schema vagy bundle
   fogyasztható.
7. Éles deploy, credential-rotáció, history rewrite és valós ügyféladat-migráció
   emberi jóváhagyás nélkül tilos.
8. Készítő és reviewer külön agent legyen.

## Feladatok

| Szakasz | Task | Állapotindítás | Eredmény |
|---|---|---|---|
| D0 | [`DSCONV-00`](DSCONV-00-SECRET-BASELINE.md) | azonnal | secret hygiene + valós baseline |
| D0 | [`DSCONV-01`](DSCONV-01-CAPABILITY-MAPPING.md) | azonnal | reuse/adapt/template/instance mapping |
| D1 | [`DSCONV-02`](DSCONV-02-OPENAPI-GENERATED-CLIENT.md) | DSCONV-01 után | OpenAPI + generált frontend kliens |
| D1 | [`DSCONV-GATE-SECURITY`](PLATFORM-GATES.md#dsconv-gate-security) | külső platform gate | auth/tenant contract elfogadva |
| D1 | [`DSCONV-03`](DSCONV-03-AUTH-TENANT-POLICY.md) | OpenAPI + security gate | JWT/tenant/station policy |
| D2 | [`DSCONV-GATE-INSTANCE`](PLATFORM-GATES.md#dsconv-gate-instance) | külső platform gate | module/extension/ownership contract |
| D2 | [`DSCONV-04`](DSCONV-04-INSTANCE-PACKS.md) | instance gate | brand/template/form/station pack |
| D2 | [`DSCONV-05`](DSCONV-05-MODEL-ADAPTER-MIGRATION.md) | instance gate + OpenAPI | project/workflow adapter és migráció |
| D2 | [`DSCONV-06`](DSCONV-06-COMPOSITION-APP.md) | auth + pack + adapter | Doorstar composition app |
| D3 | [`DSCONV-GATE-BUNDLE`](PLATFORM-GATES.md#dsconv-gate-bundle) | külső bundle gate | installer/conformance elérhető |
| D3 | [`DSCONV-07`](DSCONV-07-INSTANCE-DEPLOYMENT.md) | composition + bundle gate | descriptor/lock/install/rollback |
| D3 | [`DSCONV-08`](DSCONV-08-CONFORMANCE-UAT.md) | deployment után | security/E2E/UAT release-javaslat |

## Cross-repository gate-ek

| Gate | JoineryTech artifact | Doorstar teendő |
|---|---|---|
| Security | STAB-RLS-PROOF + ERPSEP-06 | JWT/tenant/Instance Context contract hash rögzítése |
| Instance | ERPSEP-02, ERPSEP-03, ERPSEP-07, PROJECT-CORE-ADR | ModuleId, reference, extension és workflow ownership átvétele |
| Bundle | ERPSEP-08, ERPSEP-09 | installer, lock és conformance verzió rögzítése |

## Definition of Done

- minden task saját taskfájljában kitöltött naplóval és tesztbizonyítékkal zárul;
- nincs új secret, lint/build warning vagy tesztkihagyás;
- OpenAPI/client/schema drift CI-ben ellenőrzött;
- a Doorstar fő flow összehasonlító E2E-je zöld;
- minden külső artifact pontos verzióval és hash-sel szerepel az átadásban.
