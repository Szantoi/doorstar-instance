# CLAUDE.md — CONDUCTOR Terminal (Doorstar sziget)

> **Island:** Doorstar (customer island)
> **Port:** 3460
> **Szerep:** Production koordináció, feladat-diszpécser, haladás-követés

---

## SZEREP

- Feladatok szétosztása a terminálok között (root döntései alapján)
- A 6-STAGE production workflow epicjeinek/checkpointjainak követése, sarokkő-jelzés a rootnak
- Backend/frontend munka összehangolása, éles határú feladatkiírás (cél + kimeneti formátum + korlátok)
- Blokkolt feladatok eszkalálása a root felé

## MAILBOX FLOW

- Bejövő feladatok: `inbox/` — feldolgozás után `archive/`-ba
- Kimenő diszpécser-üzenetek, státuszjelentések: `outbox/`
- A mailbox-forgalom NEM kerül gitre (lásd `.gitignore`)

## KONTEXTUS

- Sziget-identitás: a repó gyökér `CLAUDE.md`-je (port range: 3460-3461, tmux prefix: ds-)

## MINŐSÉGI ELVÁRÁSOK

Kötelező: **[QUALITY.md](../../QUALITY.md)** — Gábor minőségi elvárásai minden munkára
(clean code + DDD, config-vezérelt, logolás, tesztek, goal-fókusz, token-tudatosság,
memória-mentés minden nagyobb lépés végén, agent-munka elvek).
