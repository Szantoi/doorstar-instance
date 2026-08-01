# ADR — Exact-revíziós OperationPlanSnapshot authority

**Dátum:** 2026-07-31  
**Státusz:** elfogadott, implementált backend-határ  
**Érintett task:** DSORD-06

## Kontextus

A `ComponentSnapshot` után eddig nem létezett szerveroldali, verziózott
művelettervi authority. A frontend ezért helyesen fail-closed maradt, a legacy
`Project/EpicStep/Task` adatok pedig nem válhattak hallgatólagosan művelettervvé.

DSORD-05 automatikus Doorstar-képletprofilja és a jóváhagyott valódi
normaidő-katalógus továbbra is nyitott. Emiatt a backend nem választhat
standardot, erőforrást, időt vagy függőséget szöveges címke, RAG-találat vagy
legacy sor alapján.

## Döntés

Az `OperationPlanSnapshot` immutable, exact-revíziós és exact
`ComponentSnapshot`-hoz kötött aggregátum. A materializálás explicit műveleti
payloadot fogad, és a következő authorityket fagyasztja:

- rendelési approval hash és komponens output hash;
- generator profile verzió/fingerprint;
- műveleti standardszabály-katalógus verzió/fingerprint;
- station/resource mapping verzió/fingerprint;
- canonical input/output hash és soronkénti component line hash;
- exact dokumentumverzió/hash, work instruction, QC checkpoint és auditált
  source-evidence.

A jelenlegi `doorstar-explicit-operation-adapter/v1` nem generátorformula. A
három konfigurált standardosztály explicit technológiai, nem technológiai és
természeti folyamat szerkezeti szabálya; nem Doorstar normaidő és nem
automatikus standardválasztás. A tényleges standard, idő, erőforrás és lineage
minden műveletnél explicit, dokumentum-hashhez kötött input.

A create idempotenciakulcsa a component snapshot és generator profile. A
review `REVIEW → VERIFIED|REJECTED` egyszeri parancs, kötelező indokkal,
expected output hash tokennel és creator/reviewer principal separationnel.
Serializable PostgreSQL tranzakció és row lock védi a create/review versenyt.

Minden GET dinamikus readiness-projekciót ad. Új rendelési revízió, stale
hash/fingerprint, nem VERIFIED komponens, hiányzó vagy ambiguous standard/
resource, hibás/ciklikus dependency, nyitott evidence vagy eltérő dokumentumhash
strukturált blockert eredményez. `REJECT_OPERATION_PLAN` fail-safe akcióként
stale tervnél is elérhető marad.

## API

- `GET /api/production/production-orders/:projectKey/revisions/:revision/operation-plan-snapshots`
- `POST /api/production/production-orders/:projectKey/revisions/:revision/operation-plan-snapshots`
- `PATCH /api/production/production-orders/:projectKey/revisions/:revision/operation-plan-snapshots/:snapshotId/review`

A szerződés OpenAPI 3.1-ben, enumerált 409 kódokkal publikált.

## Kizárt scope

- automatikus Doorstar BOM-/műveletgenerálás;
- PlanningProposal, naptári kapacitásfoglalás és Gantt;
- immutable `IssuedWorkPackage` és dokumentumkiadás;
- végrehajtási mérés, actor, inspection, nonconformance és rework;
- legacy task vagy RAG alapján automatikus standard/normaidő/final review.

VERIFIED OperationPlan ezért továbbra sem üzemi kiadás.

## Bizonyíték

- production-service build zöld;
- OpenAPI 83 művelet, teljes route coverage;
- DSORD-06 céltesztek: component snapshot, operation plan és OpenAPI 3/3 zöld;
- a korábbi teljes Vitest 39 fájl / 127 teszt zöld volt; a jelenlegi közös dirty
  fa külön `legacyProductionGuard` változása miatt 38/39 fájl és 122/127 teszt
  zöld, a maradék öt régi board-elvárás a szándékos 409 fail-closed válasszal tér el;
- concurrent create: 201 + idempotens 200;
- concurrent review: egy siker, egy stabil 409;
- kétfázisú `prisma migrate deploy` izolált sémában: 22 migráció, második
  futás no-pending; teardown után nincs ideiglenes séma.
