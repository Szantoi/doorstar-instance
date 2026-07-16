# CLAUDE.md — Doorstar Sziget (Ügyfél)

> A Doorstar sziget a **Doorstar Kft. specifikus implementációja**.
> JoineryTech platformra épül, ajtógyártás-specifikus testreszabásokkal.

---

## SZIGET IDENTITY

**Név:** Doorstar
**Szerep:** Customer-specific Implementation
**Ügyfél:** Doorstar Kft. (ajtógyártó)
**Port range:** 3460-3461
**tmux prefix:** ds-

---

## FELELŐSSÉGI KÖR

| Feladat | Leírás |
|---------|--------|
| 6-STAGE Production | Szabászat → Megmunkálás → Felületkezelés → Összeszerelés → Csomagolás → Kiszállítható |
| Doorstar OpenAPI | Production workflow REST API |
| Cabinet-VPS Bridge | Federation kommunikáció |
| Custom UI | Doorstar-specifikus dashboard |

---

## TERMINÁLOK

| Terminál | Szerep |
|----------|--------|
| **root** | Ügyfél-specifikus döntések, Cabinet kommunikáció |
| **conductor** | Production koordináció |
| **monitor** | Health-monitoring, eszkaláció-figyelés |
| **backend** | 6-STAGE workflow implementáció |
| **frontend** | Doorstar UI testreszabás |

---

## 6-STAGE PRODUCTION WORKFLOW

```
1. SZABÁSZAT (Cutting)
   │
   ▼
2. MEGMUNKÁLÁS (Machining)
   │
   ▼
3. FELÜLETKEZELÉS (Surface Treatment)
   │
   ▼
4. ÖSSZESZERELÉS (Assembly)
   │
   ▼
5. CSOMAGOLÁS (Packaging)
   │
   ▼
6. KISZÁLLÍTHATÓ (Ready for Delivery)
```

---

## KAPCSOLAT MÁS SZIGETEKKEL

```
JoineryTech (platform)
    │
    │ platform modules
    ▼
Doorstar (ügyfél)
    │
    │ federation
    ▼
Cabinet VPS (partner)
```

**Federation inbox:** `terminals/federation/inbox/`
**Federation outbox:** `terminals/federation/outbox/`

---

## SERVICES

| Service | Port | Leírás |
|---------|------|--------|
| Knowledge Service | 3460 | MCP API (frozen) |
| Üzemi Tábla (uzemi-tabla-web) | 4611 | Production whiteboard UI |

> Port 3461 (`config/federation.yaml`'s `datahaven` slot) marad szabadon a
> fleet-szintű Datahaven agent-management dashboardnak — az Üzemi Tábla nem
> azonos vele és nem foglalja el a portját (korábban tévedésből
> `datahaven-web` néven futott, 3461-en; ez javítva lett).

---

## EPIC STÁTUSZ

**EPIC-DOORSTAR-SOFTLAUNCH:**
- Target: 2026-09-30
- Progress: 67%

| Milestone | Státusz |
|-----------|---------|
| Domain spec | ✅ APPROVED |
| Architecture | ✅ APPROVED |
| OpenAPI draft | ⏳ In progress |
| Implementation | ⏳ Pending |
| Testing | ⏳ Pending |
| Soft Launch | ⏳ Pending |

---

_Doorstar Sziget — Ajtógyártás Production Workflow_

## MINŐSÉGI ELVÁRÁSOK

Kötelező: **[QUALITY.md](QUALITY.md)** — Gábor minőségi elvárásai minden munkára
(clean code + DDD, config-vezérelt, logolás, tesztek, goal-fókusz, token-tudatosság,
memória-mentés minden nagyobb lépés végén, agent-munka elvek).
