---
id: PROJECT-DOORSTAR-SPACEOS-CONVERGENCE
name: Doorstar SpaceOS Convergence
owner: root
status: ACTIVE
created: 2026-07-18
updated: 2026-07-18
---

# Doorstar SpaceOS Convergence

## Cél

A működő Doorstar Üzemi Tábla valódi SpaceOS instance-szá alakítása a jelenlegi
felhasználói élmény és műhelyspecifikus tudás megőrzésével. A Doorstar csak a
saját brandjét, terminológiáját, állomásait, workflow-/űrlapsablonjait,
policy-jeit, adaptereit és adatmappingjét birtokolja.

## Platformhatár

### Doorstar tulajdon

- jelenlegi production-service és Üzemi Tábla viselkedésének bizonyított leltára;
- formális Doorstar OpenAPI és generált kliens;
- Doorstar role/station policy és felhasználói mapping;
- 6-stage workflow template, station config és ProjectSheet schema;
- Doorstar brand és terminology pack;
- meglévő Doorstar adatok migrációja;
- `doorstar-portal` composition és Doorstar E2E/UAT;
- Doorstar instance descriptor és lock.

### JoineryTech/SpaceOS tulajdon — ebben a projektben tilos implementálni

- ERP domain és ERP-modulcsomagok;
- ModuleId/katalógus és bundle manifest;
- közös auth/tenant/RLS hosting;
- Instance Context platform API;
- közös brand/template/policy schema;
- module installer, resolver és conformance runner;
- Project/FlowEpic/StageChain/Production végleges ownership.

Ezek forrása a JoineryTech `EPIC-ERP-SEPARATION-2026Q3` és
`EPIC-PROJECT-CORE-2026Q3`. Doorstar csak publikált contractot vagy csomagot
fogyaszthat; relatív source `ProjectReference`, másolás vagy cherry-pick tilos.

## Sikerkritérium

- ugyanaz a Doorstar fő üzleti flow fut, mint a convergence előtt;
- nincs trusted `X-Role`/`X-Station` auth;
- nincs kézzel duplikált frontend API-típus;
- a Doorstar saját részei instance packban vannak;
- platformfrissítés forrásfork nélkül fogyasztható;
- install/upgrade/rollback és tenant/security conformance bizonyított;
- valós ügyféladatra váltás külön emberi release-kapu marad.

## Out of scope

- új Doorstar feature a konvergencia kedvéért;
- UX-redesign;
- microservice-bontás;
- platformkód implementálása ebben a repositoryban;
- secretrotáció vagy éles deploy emberi jóváhagyás nélkül.

## Kötelező források

- `AGENTS.md`, `QUALITY.md`
- `src/production-service/README.md` és Prisma schema
- `src/uzemi-tabla-web/README.md`
- `docs/knowledge/patterns/6-STAGE_WORKFLOW.md`
- sibling repository:
  `joinerytech-platform/docs/knowledge/architecture/SPACEOS_MODULAR_PRODUCT_ARCHITECTURE_2026-07-18.md`
- sibling repository:
  `joinerytech-platform/docs/tasks/EPIC-ERP-SEPARATION-2026Q3/README.md`

