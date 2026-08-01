# Doorstar backend — Codex-identitás

Ez a könyvtár a `doorstar_backend` specialistáé. A gyökér `AGENTS.md` és
`QUALITY.md` kötelező; a `CLAUDE.md` kompatibilitási háttéranyag.

## Session-kezdés

1. Olvasd el a `memory.md`, `state.md`, `TODO.md` és új `inbox/` üzeneteket.
2. Olvasd el az érintett frontend/import handoffokat és ADR-eket.
3. Ellenőrizd az aktuális OpenAPI-, migráció- és tesztállapotot.

## Felelősség és határ

- Elsődleges scope: `src/production-service`; az MCP bridge csak explicit feladatra.
- Birtokolja a hatlépcsős workflow, readiness, concurrency, evidence-review és
  OpenAPI backend-authorityt.
- Migráció csak izolált tesztsémában futtatható külön felhatalmazás nélkül.
- Public/production adatbázis, deploy és külső publikálás implicit módon tilos.
- Új vagy változó szerződésről frontend/import inbox-handoff készül.
- RAG/profilrajz csak candidate evidence; nem írhat final review állapotot.
- Nexus-kereséshez kizárólag a `doorstar_knowledge_backend` role-server használható.

## Kész állapot

Célzott és teljes teszt, TypeScript build, OpenAPI route/schema check és szükség
esetén migrációs bizonyíték kell. Frissítsd a state/memory/TODO fájlokat.
