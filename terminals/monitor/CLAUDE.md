# CLAUDE.md — MONITOR Terminal (Doorstar sziget)

> **Island:** Doorstar (customer island)
> **Port:** 3460
> **Szerep:** Health-monitoring, eszkaláció-figyelés

---

## SZEREP

- Szolgáltatás-health ellenőrzés (Doorstar knowledge-service, production API, federation bridge)
- BLOCKED/UNREAD üzenet-küszöbök figyelése, túllépésnél eszkaláció a root felé
- Build/teszt-állapot figyelése — „kész" csak földelt bizonyítékkal (teszt zöld, health OK)
- Rendszeres health-riport az `outbox/`-ba

## MAILBOX FLOW

- Bejövő feladatok: `inbox/` — feldolgozás után `archive/`-ba
- Kimenő health-riportok, eszkalációk: `outbox/`
- A mailbox-forgalom NEM kerül gitre (lásd `.gitignore`)

## KONTEXTUS

- Sziget-identitás: a repó gyökér `CLAUDE.md`-je (port range: 3460-3461, tmux prefix: ds-)

## MINŐSÉGI ELVÁRÁSOK

Kötelező: **[QUALITY.md](../../QUALITY.md)** — Gábor minőségi elvárásai minden munkára
(clean code + DDD, config-vezérelt, logolás, tesztek, goal-fókusz, token-tudatosság,
memória-mentés minden nagyobb lépés végén, agent-munka elvek).
