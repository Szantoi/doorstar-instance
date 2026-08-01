# 6-STAGE Production Workflow — Doorstar Kft.

**Verzió:** 1.1
**Frissítve:** 2026-07-31
**Epic:** EPIC-DOORSTAR-SOFTLAUNCH

> **Státusz:** terminológiailag korrigált legacy mintaleírás. A tényleges
> runtime authority a Prisma séma, a `src/config/stations.json`, az OpenAPI és
> a szolgáltatáskód. Az alább említett régi C# eseménynevek nem bizonyítják,
> hogy a jelenlegi TypeScript production-service-ben implementálva vannak.

---

## Áttekintés

A Doorstar hatlépcsős folyamata a korábbi papíros/Excel-alapú műhelykövetés
összevont makroállapot-modellje. A részletes technológiai műveleteket a
műveleti terv kezeli; a hat stage nem hat univerzális faipari művelet és nem
azonos hat fizikai munkaállomással.

---

## 6 STAGE Definíció

| # | Kanonikus STAGE | Szakmai tartomány | Aktuális konfigurált állomáspélda |
|---|------------------|------------------|----------------------------------|
| 1 | **Szabászat / előgyártás** | Anyagdarabolás és az ide sorolt előgyártás. A művelet tartalma, nem pusztán a gép neve dönt. | Körfűrész |
| 2 | **Megmunkálás** | Forgácsoló/alakító műveletek, például marás, fúrás, gér- és élmegmunkálás. | CNC, Bürkle |
| 3 | **Felület-előkészítés és felületkezelés** | Előkészítő csiszolás és a jóváhagyott bevonat-/felületképzési műveletek. A fúrás nem ide tartozik. | Csiszoló, Fújó |
| 4 | **Összeállítás és szerelés** | Alkatrészek egységgé építése, vasalat- és kapcsolódó szerelés. | Asztalos |
| 5 | **Csomagolás** | Termékvédelem, csomagegység-képzés és jelölés. | A jelenlegi `Egyéb` hozzárendelés szakmai review-t igényel. |
| 6 | **Kiszállításra kész** | Auditált készültségi állapot/készre jelentés. Nem tényleges kiszállítás, raktárba vétel, beépítés vagy átadás. | A jelenlegi `Száll./Kész` legacy állomás-/állapotcímke. |

A részletes kanonikus és örökölt megfeleltetés:
`../domain/DOORSTAR_FAIPARI_TERMINOLOGIAI_SZOTAR_2026-07-31.md`.

---

## FSM Állapotok

```
Queued (szürke) → InProgress (sárga) → Done (zöld)
```

### Állapot Átmenetek

1. **Queued → InProgress**: Műhelyvezető tap "Start"
2. **InProgress → Done**: Műhelyvezető tap "Done"
3. **Automatikus trigger csak szerződéssel:** a legacy
   `CuttingJob.CuttingCompleted` esemény tervhivatkozás; a jelenlegi runtime
   implementációját külön API-/kódtesztnek kell bizonyítania.

---

## Event-driven Integráció

Az alábbi táblák a korábbi célarchitektúra eseménynevei. Nem tekinthetők a
jelenlegi TypeScript service futásidejű végpont- vagy eseményjegyzékének.

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
