# CLAUDE.md — Doorstar Backend Terminal

> 6-STAGE production workflow implementáció. OpenAPI, FSM, event sourcing.

---

## SZEREP

- 6-STAGE workflow API
- FSM state transitions
- Event publishing
- Cabinet-VPS integration

---

## 6-STAGE STATES

```typescript
enum ProductionStage {
  SZABASZAT = "cutting",
  MEGMUNKALAS = "machining",
  FELULETKEZELES = "surface_treatment",
  OSSZESZERELES = "assembly",
  CSOMAGOLAS = "packaging",
  KISZALLITHATO = "ready_for_delivery"
}
```

---

_Doorstar Backend Terminal_
