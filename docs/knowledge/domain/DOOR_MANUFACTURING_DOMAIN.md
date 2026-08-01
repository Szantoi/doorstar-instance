# Doorstar Ajtógyártás Domain Model

**Verzió:** 1.1
**Frissítve:** 2026-07-31
**Epic:** EPIC-DOORSTAR-SOFTLAUNCH

> **Státusz:** a C# `ProductionJob` példák történeti/célmodell-leírások. A
> jelenlegi Doorstar runtime authority a TypeScript production-service,
> `prisma/schema.prisma`, az OpenAPI és a konfigurációk. A dokumentált legacy
> eseménynevek csak akkor tekinthetők működő szerződésnek, ha a futó kód és
> teszt külön igazolja őket.

---

## Domain Áttekintés

A Doorstar Kft. beltéri ajtókat és kapcsolódó külön gyártandó elemeket készít
egyedi megrendelésre. A részletes műveleti tervet a rendszer hat összevont
Doorstar makroszakaszban követi. A **gyártási folyamat**, a **műveleti terv**, a
**munkaállomás** és a felhasználói **munkamenet** külön fogalom; a hat
makroszakasz nem állítja, hogy minden termék technológiája pontosan hat
műveletből áll.

A kanonikus szókészlet és az örökölt/import aliasok:
`DOORSTAR_FAIPARI_TERMINOLOGIAI_SZOTAR_2026-07-31.md`.

---

## Core Aggregates

### ProductionJob (Aggregate Root)

A gyártási megrendelés fő entitása.

```csharp
public class ProductionJob : AggregateRoot
{
    public ProductionJobId Id { get; private set; }
    public ProjectName ProjectName { get; private set; }  // "DSMR XXXXX"
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
- Szemléltető alak: `DSMR XXXXX` (nem valós munkaszám)

### WorkflowStepName (Enum)
```csharp
public enum WorkflowStepName
{
    SzabaszatElogyartas,   // 1. Szabászat/Előgyártás
    Megmunkalas,           // 2. Megmunkálás
    Feluletkezeles,        // 3. Felületkezelés
    Osszeszereles,         // 4. Összeszerelés
    Csomagolas,            // 5. Csomagolás
    KiszallitasraMegjeloles // 6. Kiszállításra készre jelentés (átmenet)
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
- Trigger: A legacy célmodellben a készre jelentési step lezárása
- Payload: ProductionJobId, ProjectName, CompletedAt
- Jelentés: `ShippingReady` készültségi állapot; nem kiszállítási vagy
  beépítési esemény

---

## Business Rules

### BR-001: Szekvenciális STAGE Végrehajtás
Csak az aktuális step indítható/fejezhető be. Nem lehet átugorni STAGE-eket.

### BR-002: Auto-trigger Szabászat
A `CuttingJob.CuttingCompleted` event automatikusan Done-ra állítja az 1. STAGE-et.

### BR-003: ShippingReady Notification
Legacy célviselkedés: a készre jelentési átmenet után értesítés készülhet.
Ennek aktuális runtime implementációját külön kód- és tesztbizonyíték nélkül
nem állítjuk.

### BR-004: Csúszó Projekt Kiemelés
Ha `currentDate > Deadline` && `Status != ShippingReady` → piros kiemelés UI-on.

---

## Doorstar-specifikus Terminológia

| Kanonikus magyar | Angol | Definíció |
|--------|-------|-----------|
| Gyártási folyamat | Production process | A megrendeléstől a gyártási és logisztikai átadásig tartó teljes folyamat. Nem azonos egy UI-munkamenettel. |
| Műveleti terv | Operation plan / routing | A konkrét végrehajtandó műveletek sorrendje, erőforrása, normája és függősége. |
| Szabászat / előgyártás | Cutting and prefabrication | A Doorstar első makroszakasza; anyagdarabolás és az ide sorolt előgyártás. Egy CNC művelet besorolását a művelet tartalma dönti el. |
| Megmunkálás | Machining | Forgácsoló és alakító műveletek, például marás és fúrás. A csiszolás nem automatikusan ide tartozik. |
| Felület-előkészítés és felületkezelés | Surface preparation and treatment | Előkészítő csiszolás, majd a műveleti terv szerinti bevonat-/felületképzés. A fúrás nem felületkezelés. |
| Összeállítás és szerelés | Assembly | Alkatrészek egységgé építése és a kapcsolódó szerelés a műveleti terv szerint. |
| Csomagolás | Packaging | Termékvédelem, csomagegység-képzés és jelölés. A „paknizás” műhelyalias lehet. |
| Kiszállításra kész | Ready for dispatch | Készültségi állapot. Nem bizonyít tényleges kiszállítást, beépítést vagy átadás-átvételt. |
| Doorstar munkaszám (DSMR) | Doorstar work number | Belső projekt-/megbízásazonosító. Egy tetszőleges ötjegyű szám önmagában nem DSMR. |

---

## Kapcsolódó Dokumentumok

- `/opt/doorstar/docs/knowledge/patterns/6-STAGE_WORKFLOW.md`
- `DOORSTAR_FAIPARI_TERMINOLOGIAI_SZOTAR_2026-07-31.md`
- `DOORSTAR_ADJUSTABLE_INTERIOR_DOOR_TERMINOLOGY_2026-07-30.md`
- `/opt/doorstar/docs/projects/TASKS.yaml`
- `/opt/doorstar/docs/projects/KEYCLOAK_DOORSTAR_CONFIG.md`

---

_Doorstar Ajtógyártás Domain Model v1.1 — 2026-07-31_
