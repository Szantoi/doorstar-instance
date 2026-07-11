# Doorstar Ajtógyártás Domain Model

**Verzió:** 1.0
**Frissítve:** 2026-07-11
**Epic:** EPIC-DOORSTAR-SOFTLAUNCH

---

## Domain Áttekintés

A Doorstar Kft. beltéri ajtókat gyárt egyedi megrendelésre. A gyártási folyamat (Munkamenet) egy 17-fázisú workflow, amelyet digitálisan 6 összevont STAGE-ben követünk.

---

## Core Aggregates

### ProductionJob (Aggregate Root)

A gyártási megrendelés fő entitása.

```csharp
public class ProductionJob : AggregateRoot
{
    public ProductionJobId Id { get; private set; }
    public ProjectName ProjectName { get; private set; }  // "DSMR 26144"
    public OrderId OrderId { get; private set; }          // CRM/Joinery correlation
    public ProductionDeadline Deadline { get; private set; }
    public ProductionStatus Status { get; private set; }
    public int CurrentStepIndex { get; private set; }

    private List<WorkflowStep> _workflowSteps;
    public IReadOnlyList<WorkflowStep> WorkflowSteps => _workflowSteps.AsReadOnly();
}
```

### WorkflowStep (Entity)

Egy gyártási fázis (6 STAGE egyike).

```csharp
public class WorkflowStep : Entity
{
    public WorkflowStepId Id { get; private set; }
    public WorkflowStepName StepName { get; private set; }
    public StepStatus Status { get; private set; }
    public DateTime? StartedAt { get; private set; }
    public DateTime? CompletedAt { get; private set; }
    public string CompletedBy { get; private set; }  // "user:xxx" or "auto:CuttingCompleted"
    public string PhotoUrl { get; private set; }     // Optional, for Összeszerelés
}
```

---

## Value Objects

### ProjectName
- Format: `DSMR XXXXX` (ahol XXXXX = 5 számjegy)
- Regex: `^DSMR \d{5}$`
- Példa: "DSMR 26144"

### WorkflowStepName (Enum)
```csharp
public enum WorkflowStepName
{
    SzabaszatElogyartas,   // 1. Szabászat/Előgyártás
    Megmunkalas,           // 2. Megmunkálás
    Feluletkezeles,        // 3. Felületkezelés
    Osszeszereles,         // 4. Összeszerelés
    Csomagolas,            // 5. Csomagolás
    Kiszallithato          // 6. Kiszállítható
}
```

### ProductionStatus (Enum)
```csharp
public enum ProductionStatus
{
    Queued,         // Sorban áll (szürke)
    InProgress,     // Folyamatban (sárga)
    Completed,      // Befejezett
    ShippingReady   // Kiszállításra kész (zöld)
}
```

### StepStatus (Enum)
```csharp
public enum StepStatus
{
    Queued,      // Várakozik
    InProgress,  // Folyamatban
    Done         // Kész
}
```

---

## Domain Events

### ProductionJobCreated
- Trigger: `OrderItem.OrderConfirmed` event
- Payload: ProductionJobId, ProjectName, Deadline

### WorkflowStepStarted
- Trigger: Műhelyvezető tap "Start"
- Payload: ProductionJobId, StepId, StepName, StartedAt, StartedBy

### WorkflowStepCompleted
- Trigger: Műhelyvezető tap "Done" VAGY `CuttingCompleted` event
- Payload: ProductionJobId, StepId, StepName, CompletedAt, CompletedBy

### ProductionJobShippingReady
- Trigger: Utolsó step (Kiszállítható) Done
- Payload: ProductionJobId, ProjectName, CompletedAt
- Side Effect: Telegram notification Sales/tulaj-nak

---

## Business Rules

### BR-001: Szekvenciális STAGE Végrehajtás
Csak az aktuális step indítható/fejezhető be. Nem lehet átugorni STAGE-eket.

### BR-002: Auto-trigger Szabászat
A `CuttingJob.CuttingCompleted` event automatikusan Done-ra állítja az 1. STAGE-et.

### BR-003: ShippingReady Notification
Ha az utolsó STAGE (Kiszállítható) Done → push notification Sales/tulaj-nak.

### BR-004: Csúszó Projekt Kiemelés
Ha `currentDate > Deadline` && `Status != ShippingReady` → piros kiemelés UI-on.

---

## Doorstar-specifikus Terminológia

| Magyar | Angol | Definíció |
|--------|-------|-----------|
| Munkamenet | Production workflow | 17 fázisú gyártási folyamat |
| Szabászat | Cutting | CNC/kézi vágás |
| Megmunkálás | Machining | CNC marás, csiszolás |
| Felületkezelés | Surface treatment | Fúrás, ragasztás, fóliázás |
| Összeszerelés | Assembly | Ajtólap + tok összerakás |
| Csomagolás | Packaging | Paknizás, védőcsomagolás |
| Kiszállítható | Shipping ready | Raktárba került, beépíthető |
| DSMR | Doorstar megrendelés | Projekt azonosító |

---

## Kapcsolódó Dokumentumok

- `/opt/doorstar/docs/knowledge/patterns/6-STAGE_WORKFLOW.md`
- `/opt/doorstar/docs/projects/TASKS.yaml`
- `/opt/doorstar/docs/projects/KEYCLOAK_DOORSTAR_CONFIG.md`

---

_Doorstar Ajtógyártás Domain Model v1.0 — 2026-07-11_
