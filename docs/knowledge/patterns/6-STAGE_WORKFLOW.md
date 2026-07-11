# 6-STAGE Production Workflow — Doorstar Kft.

**Verzió:** 1.0
**Frissítve:** 2026-07-11
**Epic:** EPIC-DOORSTAR-SOFTLAUNCH

---

## Áttekintés

A Doorstar 6-STAGE workflow a papír-kanban (Munkamenet.pdf) digitalizálása mobil-first megoldással. A valós 17 mikro-fázis Excel-ben marad, a mobil app 6 összevont STAGE-et követ.

---

## 6 STAGE Definíció

| # | STAGE | Munkamenet-fázisok | Trigger | UI |
|---|-------|-------------------|---------|-----|
| 1 | **Szabászat/Előgyártás** | Szabás, 22-es marás, HDF keret, üvegezés-előkészítés | Auto: `CuttingCompleted` | Auto sárga→zöld |
| 2 | **Megmunkálás** | CNC kontúrmarás, Gérvágás, Csiszolás | Manuális | Tap Start/Done |
| 3 | **Felületkezelés** | Fúrás, Ragasztó, Fóliázás | Manuális | Tap Start/Done |
| 4 | **Összeszerelés** | Él-lécezés, CNC Pánt-zár, Tok/Gér összerakás | Manuális + fotó | Tap + photo upload |
| 5 | **Csomagolás** | Paknizás, Csomagolás | Manuális | Tap "ZÖLD jelölés" |
| 6 | **Kiszállítható** | Kész → Raktár → Beépítés | Auto: Step 5 Done | Push notification |

---

## FSM Állapotok

```
Queued (szürke) → InProgress (sárga) → Done (zöld)
```

### Állapot Átmenetek

1. **Queued → InProgress**: Műhelyvezető tap "Start"
2. **InProgress → Done**: Műhelyvezető tap "Done"
3. **Auto-trigger (Szabászat)**: `CuttingJob.CuttingCompleted` event

---

## Event-driven Integráció

### Bejövő Események

| Esemény | Forrás | Akció |
|---------|--------|-------|
| `CuttingJob.CuttingCompleted` | Cutting modul (ADR-038) | Auto-complete Szabászat step |
| `OrderItem.OrderConfirmed` | CRM/Joinery | Create ProductionJob |

### Kimenő Események

| Esemény | Cél | Akció |
|---------|-----|-------|
| `ProductionJob.ShippingReady` | Sales/tulaj | Telegram/email notification |
| `ProductionJob.ShippingReady` | Inventory | ReserveForShipping |
| `WorkflowStepCompleted` | Analytics | Timeline tracking |

---

## Persona & Use Case

### Elsődleges Persona: Műhelyvezető
- Szakmunkás, csak telefont kezel
- Feladat: STAGE állapotok frissítése (sárga/zöld)
- UI: Koppintásos, nagy érintőfelület

### Másodlagos Persona: Tulaj / Sales
- Élő rálátás minden aktív projektre
- Viber-fotó kiváltása valós idejű nézettel
- Csúszó projektek kiemelése (piros)

---

## Technikai Referenciák

- **Domain Spec:** `/opt/doorstar/docs/projects/TASKS.yaml`
- **Keycloak Config:** `/opt/doorstar/docs/projects/KEYCLOAK_DOORSTAR_CONFIG.md`
- **Implementation Plan:** Backend terminál MSG-BACKEND-194 DONE

---

_Doorstar 6-STAGE Workflow Pattern v1.0 — 2026-07-11_
