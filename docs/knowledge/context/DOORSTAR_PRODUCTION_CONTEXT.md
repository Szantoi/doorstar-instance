# Doorstar Production Context

**Terminál:** Backend/Frontend (Doorstar sziget)
**Frissítve:** 2026-07-11
**Epic:** EPIC-DOORSTAR-SOFTLAUNCH

---

## Kontextus

A Doorstar Kft. a SpaceOS első éles ügyfele. Ajtógyártó vállalkozás, amely papír-kanban (Munkamenet.pdf) alapú műhely-követést használ. A digitalizáció célja a Viber-fotós státuszjelentés kiváltása mobil-first megoldással.

---

## Ügyfél Profil

- **Cég:** Doorstar Kft.
- **Iparág:** Beltéri ajtógyártás
- **Méret:** KKV (10-20 fő)
- **Lokáció:** Magyarország
- **Jelenlegi rendszer:** Excel + papír-kanban + Viber

---

## Epic Státusz

| Epic | Target | Státusz |
|------|--------|---------|
| EPIC-DOORSTAR-SOFTLAUNCH | 2026-09-30 | 67% complete |

### Milestones (6)

| M# | Név | NWT | Státusz |
|----|-----|-----|---------|
| M1 | KEYCLOAK DOORSTAR TENANT | 120 | Pending |
| M2 | KERNEL + JOINERY DATABASE SEED | 90 | Pending |
| M3 | ORCHESTRATOR MEDIATION ROUTES | 180 | Pending |
| M4 | B2B HANDSHAKE VALIDATION | 90 | Pending |
| M5 | USER ACCEPTANCE TESTING | 240 | Pending |
| M6 | SOFT LAUNCH (GO-LIVE) | 180 | Pending |

**Total:** 21 task, 900 NWT (~30 óra)

---

## Technikai Kontextus

### Layer 2 DRIVER

A Production modul Layer 2 DRIVER-ként illeszkedik a SpaceOS architektúrába:

```
L4  Design Portal / JoineryTech   ← Mobile kiosk UI (Doorstar)
L3  Orchestrator (BFF)            ← Mediation routes
L2  SpaceOS.Modules.Production    ← DRIVER (ez a modul)
L1  Kernel                        ← Auth/RLS/FSM
```

### Függőségek

- **Kernel Auth:** Keycloak `spaceos/doorstar` tenant
- **Joinery Module:** DoorOrder aggregate, OrderConfirmed event
- **Cutting Module:** CuttingJob.CuttingCompleted event (ADR-038)

---

## Cabinet-VPS Kommunikáció

A Doorstar sziget kezeli a Cabinet-VPS kommunikációt:

- **Protokoll:** Federation inbox/outbox
- **Irány:** Doorstar → Cabinet VPS (egyirányú push)
- **Payload:** Production stage updates, order status

### Releváns Federation Üzenetek

| ID | Típus | Tartalom |
|----|-------|----------|
| MSG-ROOT-038 | FILE-TRANSFER | Domain spec v1 (17 fázis → 6 STAGE) |
| MSG-ROOT-040 | DECISION | 6 STAGE scope végleges |
| MSG-BACKEND-194 | DONE | Implementation Plan |

---

## Backend Fejlesztési Irányelvek

### DDD Struktúra
```
SpaceOS.Modules.Production/
├── Domain/
│   ├── ProductionJob.cs (aggregate root)
│   ├── WorkflowStep.cs (entity)
│   ├── ValueObjects/
│   └── Events/
├── Application/
│   ├── Commands/
│   └── Queries/
├── Infrastructure/
│   ├── ProductionDbContext.cs
│   └── EventHandlers/
└── Api/
    └── ProductionController.cs
```

### API Endpoints

| Method | Path | Leírás |
|--------|------|--------|
| POST | /api/production/jobs | Új ProductionJob |
| GET | /api/production/jobs | Műhelyvezető lista |
| GET | /api/production/jobs/{id} | Projekt részletek |
| PUT | /api/production/jobs/{id}/steps/{stepId}/start | Step indítás |
| PUT | /api/production/jobs/{id}/steps/{stepId}/complete | Step befejezés |
| POST | /api/production/jobs/{id}/steps/{stepId}/photo | Fotó upload |
| GET | /api/production/overview | Tulaj/sales dashboard |

---

## Frontend Fejlesztési Irányelvek

### Komponensek

- **ProductionJobCard:** Touch-optimized kártya
- **WorkflowStepStepper:** 6 STAGE vertical stepper
- **KioskMobileLayout:** Full-screen mobil nézet
- **ProductionOverviewPage:** Tulaj/sales dashboard

### Hooks

- `useProductionQueue()`: TanStack Query
- `useCompleteStep()`: Mutation hook
- `useProductionSSE()`: Real-time updates

---

## Ismert Kockázatok

| Kód | Kockázat | Súlyosság | Mitigáció |
|-----|----------|-----------|-----------|
| RISK-001 | Offline mód hiánya | HIGH | Phase 2 PWA |
| RISK-002 | Event correlation hiba | MEDIUM | OrderId validation |
| RISK-004 | Scope creep (17 fázis) | HIGH | 6 STAGE végleges |
| RISK-005 | Adoption ellenállás | MEDIUM | Pilot test + training |

---

## Kapcsolódó Dokumentumok

- `/opt/doorstar/docs/knowledge/patterns/6-STAGE_WORKFLOW.md`
- `/opt/doorstar/docs/knowledge/domain/DOOR_MANUFACTURING_DOMAIN.md`
- `/opt/doorstar/docs/projects/TASKS.yaml`
- `/opt/doorstar/docs/projects/KEYCLOAK_DOORSTAR_CONFIG.md`

---

_Doorstar Production Context v1.0 — 2026-07-11_
