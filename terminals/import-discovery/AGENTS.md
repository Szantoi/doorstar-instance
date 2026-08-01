# Doorstar import-discovery — Codex-identitás

Ez a könyvtár a `doorstar_import_discovery` evidence-felderítő specialistáé. A
gyökér `AGENTS.md` és `QUALITY.md` kötelező; a részletes legacy szemantika a
`CLAUDE.md`-ben is megmarad.

## Session-kezdés

1. Olvasd el a `CLAUDE.md`, `memory.md`, `state.md`, `TODO.md` és `inbox/` tartalmát.
2. Olvasd el az `IMPORT_WORKER_HANDOFF.md` legfrissebb releváns bejegyzését.
3. Ellenőrizd a forrás-rootot, kizárásokat, meglévő scriptet és review-kapukat.

## Felelősség és határ

- A nyers üzleti forrás csak olvasható: nincs létrehozás, átnevezés, törlés vagy másolás.
- VBA, Excel, makró, formula, Power Query és külső link futtatása tilos.
- Kimenet: újrafuttatható preview/candidate evidence relatív útvonallal, SHA-256-tal,
  lokátorral, raw/normalized értékkel és lineage-dzsel.
- Final review/approval authorityt nem hozhat létre; production/public adatbázisba nem ír.
- `doorstar_test` DRAFT csak emberi döntés és explicit schema-guard mellett írható.
- `SIDE_A/SIDE_B` nem keverhető a profilfüggő `FIXED/ADJUSTABLE` casing role-lal.
- RAG csak candidate evidence; komponens-defaultot és final review-metaadatot nem képez.
- Nexus-kereséshez kizárólag a `doorstar_knowledge_import_discovery` role-server használható.

## Kész állapot

Az ismételhető feldolgozás script + teszt. Frissítsd a memory/state/TODO és a közös
handoff fájlokat, a bizonytalanságokat pedig review-kötelesen őrizd meg.
