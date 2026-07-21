# Doorstar → SpaceOS capability és adatmodell mapping

**Dátum:** 2026-07-18  
**Doorstar HEAD:** f51419eeb902b194e32aa63897e24263bda2f88a  
**Státusz:** audit kész; ownership- és platformcontract-döntések nyitottak

## Bizonyíték és határ

A vizsgálat a Production Service Prisma-sémáját, hét Express route modulját, stations.json-t, az Üzemi Tábla frontendjét, a DSCONV-00 baseline-t és a JoineryTech moduláris architektúrát fedi le. Forráskód-módosítás nem történt. A Doorstar nem másol platformforrást, és nem választ Project/FlowEpic/StageChain tulajdonost névegyezés alapján.

## Jelenlegi REST leltár — 36 endpoint

| Terület | Route-ok |
|---|---|
| Health | GET /healthz |
| Board | GET /board; PUT /week-note; GET, POST, PATCH, DELETE /orders |
| Task | POST /tasks; GET, PATCH, DELETE /tasks/:id; POST /tasks/:id/comments; POST /tasks/:id/images; DELETE /images/:id |
| Kanban | GET /kanban; PUT /kanban/:station/workflow; DELETE /kanban/:station/workflow/:index |
| Kapacitás | GET /load; PUT /capacity |
| Projekt | GET, POST /projects; GET, PUT /projects/:key; GET /projects/:key/epik-rollup; PUT /projects/:key/epics; POST /projects/:key/schedule; GET, PUT /projects/:key/sheets/:kind |
| Sablon | GET, POST /templates; POST /templates/:name/apply/:key; GET, POST /epik-templates; POST /epik-templates/:name/apply/:key |
| Összegzés | GET /stations; GET /overview |

Minden üzleti route prefixe /api/production. A validáció részleges: a létrehozó és néhány update payload Zod-validált, de a checklist, workflow, image és ProjectSheet JSON több helyen közvetlen body-t használ.

## Capability matrix

| Capability / source of truth | Besorolás | Célhely / indok |
|---|---|---|
| Project ügyfélmunka és státusz | decision_required | A végleges Project/FlowProject/FlowEpic owner a PROJECT-CORE-ADR döntése. Doorstar csak reference és adapter lehet. |
| Epic és EpicStep munkalap-terv | decision_required | A generikus projektterv és gyártási routing határa nyitott. |
| Task kártya, függőség, lépésindex | adapt | JoineryTech Production végrehajtási work-item megfelelője, csak approved owner után adapterrel. |
| 6 Stage enum és ProductionStatus | adapt | Production domain analógja; névazonosság nem automatikus merge. |
| Állomáslista és station→stage mapping | instance-only | Doorstar műhelyspecifikus; instance pack input. |
| StationWorkflow oszlopok | template | ERPSEP-07 extension schema után verziózott workflow template. |
| Kapacitás, heatmap, scheduler | adapt | Általános Production capability lehet, de a képlet és ownership auditot igényel. |
| ProjectSheet QUANTITIES/CUTTING/HARDWARE JSON | instance-only | Doorstar formok; verziózott, szervervalidált JSON Schema szükséges. |
| Sheet/Epik template | template | Doorstar kezdeti template adat; extension packba kerül. |
| Task komment, kép, audit | adapt | Audit/blob port + WorkItemRef; ownership adapteren keresztül. |
| Board checklist és heti note | instance-only | Lokális műhely UI-viselkedés, nincs közös domain-invariáns. |
| Marker-board UI és design tokenek | instance-only | Doorstar brand/UX pack; nem platform-shell reskin. |
| React service/hook/API szerkezet | reuse | Platform-kompatibilis konvenció; DSCONV-02 Orval kliensre vált. |
| X-Role/X-Station védelem | retire | Nem hitelesített header; DSCONV-03 JWT, tenant és station policy váltja ki. |

## Adat- és állapotmapping

| Doorstar modell | Jelenlegi szerep | SpaceOS cél | Döntés |
|---|---|---|---|
| Project | kulcs, név, munkaszám, határidő-szerű adatok, roll-up státusz | ProjectRef + jóváhagyott owner | decision_required |
| Epic | komponenscsoport, sorrend, mennyiség-label | Flow/project terv vagy Production routing | decision_required |
| EpicStep | állomás, mennyiség/óra/dátum | semleges work-plan step + StationRef | decision_required |
| Task | kiosztás, nap/hét, függőség, jelzők, lépésindex | Production work item / workflow execution | adapt |
| Stage | hat makrolépés | JoineryTech production workflow template | adapt |
| StationWorkflow | állomásonkénti oszloplista | instance workflow template override | template |
| ProjectSheet | szabad JSON | Doorstar form pack + JSON Schema | instance-only |
| TaskComment/TaskImage/TaskAuditEntry | melléklet/idővonal | audit/blob port + WorkItemRef | adapt |
| OrderChecklistItem | board oldalsáv checklist | Doorstar instance-only UI-adat | instance-only |
| WeekNote | ISO-hétre kulcsolt szöveges note | Doorstar instance-only UI-adat | instance-only |
| SheetTemplate | teljes munkalap JSON-sablon | Doorstar workflow/form template pack | template |
| EpikTemplate | egyetlen epik JSON-sablon | Doorstar workflow/form template pack | template |
| CapacitySetting | globális óra/nap/állomás feltételezés | Production capacity policy, extension contract után | adapt |

A mai végrehajtási állapot a stepIndex, acknowledged, egyéni station workflow és problem kombinációja; a Project QUEUED → IN_PROGRESS → SHIPPING_READY roll-up ettől külön tárolódik. A célkontraktusban a template-definíció és a végrehajtási állapot külön aggregate legyen.

## Frontend és instance pack

| Réteg | Tartalom | Cél |
|---|---|---|
| Page | Board, Kanban, Load, Projects, Project detail/subsheet, modal | Doorstar composition appban fogyasztott Production modul UI |
| Service | services/production api, types, hooks, config | DSCONV-02 OpenAPI/Orval generált kliens |
| Store | uiStore szerep/állomás, toast/confirm | auth contextből policy; csak helyi UI-állapot marad store-ban |
| Theme | marker-board tokenek és core UI | Doorstar brand/terminology pack |

## Security és tenant boundary

Jelenleg nincs JWT, tenant, RLS vagy hitelesített station membership. A frontend X-Role és X-Station értéket küld, a backend csak a task PATCH útvonalon ellenőrzi. Minden író route tenant-határon kívül van. Kötelező DSCONV-GATE-SECURITY input: STAB-RLS-PROOF, ERPSEP-06 Instance Context OpenAPI, JWT claim/tenant-resolution contract, hosting package-verzió és negatív security verdict.

## Megőrzési és rollback-kockázatok

1. A bulk PUT /projects/:key/epics delete-and-recreate művelete régi EpicStep-id-ket töröl; stabil legacy mapping és rollback kell.
2. ProjectSheet, SheetTemplate és EpikTemplate JSON frontend-owned; sémaverzió és szervervalidáció nélkül driftet okoz.
3. A Task dependsOnId egyedi lánc, nem teljes dependency DAG.
4. Image URL adat-URI is lehet; blob ownership, méretkorlát és retention contract hiányzik.
5. A platform és Doorstar production HEAD eltér; migráció előtt comparison E2E, feature-flag és strangler rollback kell.

## Kötelező platformátadások

| Artifact | Doorstar fogyasztói igény |
|---|---|
| ERPSEP-01 + PROJECT-CORE-ADR | Project/Epic/EpicStep/Task és Production owner; ProjectRef/WorkItemRef |
| ERPSEP-02 | kanonikus ModuleId, manifest schema, compatibility policy |
| ERPSEP-03 | cross-module reference/event/API contract |
| STAB-RLS-PROOF + ERPSEP-06 | tenant/JWT/Instance Context DSCONV-03-hoz |
| ERPSEP-07 | brand, terminology, station, template, form, policy, adapter schema DSCONV-04/05-höz |
| ERPSEP-08/09 | bundle installer, instance schema, lock, conformance DSCONV-07/08-hoz |

## Átadási verdict

A Doorstar ownership szétválasztása elég pontos az ERPSEP-01 és PROJECT-BOUNDARY-AUDIT inputjához. Nincs production-ready vagy merge-javaslat: Project és workflow/production végleges owner-e decision_required. A következő Doorstar kódoló feladat csak publikált contract és gate után indulhat.
