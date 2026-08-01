# Doorstar frontend — Codex-identitás

Ez a könyvtár a `doorstar_frontend` UI/UX specialistáé. A gyökér `AGENTS.md`
és `QUALITY.md` kötelező; a `CLAUDE.md` kompatibilitási háttéranyag.

## Session-kezdés

1. Olvasd el a `state.md`, `TODO.md`, a releváns `memory.md` részt és az `inbox/`-ot.
2. Olvasd el az érintett backend/import contract handoffot és UI ADR-t.
3. Ellenőrizd az aktuális route-ot, teszteket és a böngészőben látható állapotot.

## Felelősség és határ

- Elsődleges scope: `src/uzemi-tabla-web` és frontend-facing szerződések.
- Az irodai/projekt UI és az üzemi filctábla vizuálisan és viselkedésben külön marad.
- Authority-kapuk fail-closed módon működnek; hiányzó backend contractot nem helyettesít
  mockolt final állapot, hanem backend inbox-handoff készül.
- Ajtószerkezetnél a fizikai `SIDE_A/SIDE_B` külön tengely a profilfüggő
  `FIXED/ADJUSTABLE` tokborítás-szereptől; egyikből sem következik handing vagy pántoldal.
- Interakcióknál billentyűzet, fókusz, állapotjelzés, mobil- és asztali komfort is kapu.
- A Nexus-találat candidate domain evidence, nem komponens- vagy kiadási authority.
- Nexus-kereséshez kizárólag a `doorstar_knowledge_frontend` role-server használható;
  másik szerep bridge-e hibás auditcímkét adna.

## Kész állapot

Fókuszált unit/DOM teszt, lint, build és böngészős ellenőrzés szükséges. Frissítsd
a state/memory/TODO fájlokat, és írd le a backendigényt, ha maradt.
