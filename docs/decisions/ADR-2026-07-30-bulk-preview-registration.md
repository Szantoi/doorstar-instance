# ADR — Verziózott, újraindítható preview-regisztráció

**Dátum:** 2026-07-30  
**Státusz:** elfogadott  
**Érintett feladat:** DSORD-07

## Kontextus

A legacy-preview scriptek több, már review-zott JSON artefaktumot állítanak
elő. Az eddigi API csak egy `ImportRun` és egy `ImportCandidate` kézi,
soronkénti rögzítését teszi lehetővé. Ez nem újraindítható, nem képez
egyértelmű audit-határt és nagy preview esetén hibaveszélyes.

## Döntés

Egy `doorstar-bulk-preview-registration/v1` manifest egy vagy több relatív
preview-artefaktumot nevez meg. A `registerBulkPreview.ts` parancs:

1. csak `mode: preview` és `databaseWrite: false` artefaktumot fogad el;
2. a manifest és minden preview byte-hashéből számol egy stabil,
   verziózott `registrationKey`-t;
3. kizárólag `doorstar_test` kapcsolaton, explicit megerősítés és adminisztrátori
   review-megjegyzés után ír;
4. ugyanahhoz a kulcshoz ugyanazt az `ImportRun`-t használja;
5. minden rekordhoz stabil `sourceRecordKey`-t képez és kis batch-ekben,
   `skipDuplicates` móddal rögzít. Megszakítás után ugyanazzal a manifesttel
   indítva csak a hiányzó sorok kerülnek be;
6. a sor forráshelyét, normalizált payloadját, eredeti hibáit és a lokális
   validációs problémákat `ImportCandidate`-ként tárolja. Karantén, hiányos
   forráshely vagy rossz payload `BLOCKED`; minden más nem végleges rekord
   `REVIEW` marad.

A parancs JSON összesítést ad: futásazonosító, létrehozott/meglévő/blocked
darabszám és soronkénti hiba. Az Import Inbox ezt változatlanul olvassa.

## Következmények

- A preview-regisztráció idempotens és folytatható, de **nem** hoz létre
  Projectet, DRAFT-ot, ManufacturedItemet vagy gyártási feladatot.
- Módosított preview vagy manifest új hash-et, tehát új `ImportRun`-t eredményez;
  korábbi auditadat nem íródik felül.
- A bulk parancs nem olvas Excel/PDF/DWG forrást és nem futtat makrót; csak már
  létrejött JSON artefaktumot olvas.
- A `registrationKey` és `sourceRecordKey` adatbázis-szintű egyedisége védi a
  párhuzamos vagy ismételt elindítást is.
