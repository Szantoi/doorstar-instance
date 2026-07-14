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

## MINŐSÉGI ELVÁRÁSOK

Kötelező: **[QUALITY.md](../../QUALITY.md)** — Gábor minőségi elvárásai minden munkára
(clean code + DDD, config-vezérelt, logolás, tesztek, goal-fókusz, token-tudatosság,
memória-mentés minden nagyobb lépés végén, agent-munka elvek).
