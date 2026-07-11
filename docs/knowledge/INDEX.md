# Doorstar Knowledge Base — Ügyfél-specifikus Implementation

**Sziget:** Doorstar (`/opt/doorstar/`)
**Fókusz:** Doorstar Kft. specifikus fejlesztés
**Port:** 3460-3461
**Frissítve:** 2026-07-11

---

## Áttekintés

A Doorstar sziget a **Doorstar Kft. ügyfél-specifikus implementációjának központja**. Fókusz:
- 6-STAGE production workflow
- Cabinet-VPS kommunikáció
- Ajtógyártás domain
- Production tracking

---

## Dokumentum Kategóriák

### architecture/ (2 dokumentum)

- `CABINET_VPS_FEDERATION_ACCESS_CONTROL.md` — Cabinet-VPS kommunikációs protokoll
- `SpaceOS_Doorstar_Onboarding_v4.md` — Doorstar onboarding dokumentáció

### deployment/ (1 dokumentum)

- `SESSION_REPAIR_GUIDE.md` — Session troubleshooting guide

### patterns/ (1 dokumentum) ✅ KÉSZ

- `6-STAGE_WORKFLOW.md` — 6-STAGE production workflow FSM és integráció

### domain/ (1 dokumentum) ✅ KÉSZ

- `DOOR_MANUFACTURING_DOMAIN.md` — Ajtógyártás domain model (DDD)

### context/ (1 dokumentum) ✅ KÉSZ

- `DOORSTAR_PRODUCTION_CONTEXT.md` — Doorstar production context termináloknak

---

## Projekt Dokumentumok

### projects/ (2 dokumentum) ✅ KÉSZ

- `TASKS.yaml` — EPIC-DOORSTAR-SOFTLAUNCH 21 task, 6 milestone
- `KEYCLOAK_DOORSTAR_CONFIG.md` — Keycloak tenant konfiguráció

---

## Technológiák

**Backend:**
- .NET 8 (örökölt JoineryTech platform-ról)
- PostgreSQL
- 6-STAGE FSM (ProductionJob aggregate)

**Frontend:**
- React 18 (örökölt JoineryTech platform-ról)
- Production tracking UI (mobile-first)

**Integráció:**
- Cabinet VPS (Federation protokoll)
- Telegram notifications

---

## 6-STAGE Production Workflow

| # | Stage | Trigger | UI |
|---|-------|---------|-----|
| 1 | **Szabászat/Előgyártás** | Auto: CuttingCompleted | Auto sárga→zöld |
| 2 | **Megmunkálás** | Manuális | Tap Start/Done |
| 3 | **Felületkezelés** | Manuális | Tap Start/Done |
| 4 | **Összeszerelés** | Manuális + fotó | Tap + photo |
| 5 | **Csomagolás** | Manuális | Tap "ZÖLD" |
| 6 | **Kiszállítható** | Auto: Step 5 Done | Push notification |

**FSM Állapotok:** `Queued` (szürke) → `InProgress` (sárga) → `Done` (zöld)

---

## Cabinet-VPS Kommunikáció

**Protocol:** Federation inbox/outbox
**Direction:** Doorstar → Cabinet VPS (egyirányú push)
**Payload:** Production stage updates, order status

**Referencia:**
- `architecture/CABINET_VPS_FEDERATION_ACCESS_CONTROL.md`
- `/opt/spaceos/docs/FEDERATION_PROTOCOL.md`

---

## Epic Státusz

| Epic | Target | Státusz |
|------|--------|---------|
| EPIC-DOORSTAR-SOFTLAUNCH | 2026-09-30 | 67% complete |

**Milestones:** M1-KEYCLOAK → M2-SEED → M3-ORCHESTRATOR → M4-B2B → M5-UAT → M6-SOFTLAUNCH

---

## Kapcsolódó Dokumentumok

- `/opt/doorstar/CLAUDE.md` — Terminál konfigurációk
- `/opt/spaceos/docs/architecture/4-ISLAND-ARCHITECTURE.md` — 4-sziget áttekintés
- `/opt/joinerytech/docs/knowledge/` — Megosztott platform knowledge

---

## Token Konfiguráció

**API Token:** `doorstar-api-7f2ee55831b27bd4664c42548eea88c8825f4e94`
**Dashboard Token:** `dev-token-doorstar-dashboard-2026`

---

_Doorstar Knowledge Base v1.1 — 2026-07-11_
