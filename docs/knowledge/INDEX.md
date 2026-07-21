# Doorstar Knowledge Base — Ügyfél-specifikus Implementation

**Sziget:** Doorstar (`/opt/doorstar/`)
**Fókusz:** Doorstar Kft. specifikus fejlesztés
**Port:** 3460-3461
**Frissítve:** 2026-07-18

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

### projects/

- `TASKS.yaml` — EPIC-DOORSTAR-SOFTLAUNCH 21 task, 6 milestone
- `KEYCLOAK_DOORSTAR_CONFIG.md` — Keycloak tenant konfiguráció
- `EPICS.yaml` — aktív epic-gráf és tasklánc belépési pontok
- `doorstar-spaceos-convergence/` — Doorstar instance-konvergencia, platform
  gate-ek és részletes agent-taskok

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
| EPIC-DOORSTAR-SOFTLAUNCH | 2026-09-30 | BLOCKED — legacy ownership remap |
| EPIC-DOORSTAR-SPACEOS-CONVERGENCE | 2026-09-30 | ACTIVE — D0 taskok kiadhatók |

**Aktuális belépési pont:**
`docs/projects/doorstar-spaceos-convergence/README.md`. A régi M1→M6 lánc csak
az ownership-remap után aktiválható újra.

---

## Kapcsolódó Dokumentumok

- `/opt/doorstar/CLAUDE.md` — Terminál konfigurációk
- `/opt/spaceos/docs/architecture/4-ISLAND-ARCHITECTURE.md` — 4-sziget áttekintés
- `/opt/joinerytech/docs/knowledge/` — Megosztott platform knowledge

---

## Token Konfiguráció

Az API- és dashboard-credentialek nem dokumentált értékek: azokat kizárólag a
futtatókörnyezeti secret store-ból vagy környezeti változókból szabad betölteni.
Az értékek kiadása, cseréje és visszavonása a Doorstar root/security felelőse,
emberi jóváhagyási kapuval. A baseline és a rotációs nyilvántartás:
`docs/projects/doorstar-spaceos-convergence/DSCONV-00-SECRET-BASELINE.md`.

---

_Doorstar Knowledge Base v1.1 — 2026-07-11_
