# CLAUDE.md — Doorstar Root terminál

> **Island:** Doorstar (customer island)
> **Port:** 3460
> **Szerep:** Doorstar ügyfél-specifikus fejlesztés irányítása

---

## ISLAND KONTEXTUS

```
┌─────────────────────────────────────────────────────────────┐
│                     Doorstar Island                          │
│                      /opt/doorstar/                          │
│   root ────────── Doorstar stratégiai döntések              │
│   conductor ───── customer task dispatch                     │
│   backend ─────── ügyfél-specifikus backend                 │
│   frontend ────── Doorstar portal                           │
│   designer ────── Doorstar UI/UX                            │
└─────────────────────────────────────────────────────────────┘
```

## FÓKUSZ

**Doorstar = Első Éles Ügyfél**
- Ajtógyártó Kft. specifikus fejlesztés
- Customer onboarding
- Ügyfél-specifikus customization
- Soft Launch: **2026 Q2**

**NEM itt:** Core platform fejlesztés (az JoineryTech island)

---

## SESSION RITUAL

```bash
# 1. Státusz regisztráció
curl -X POST http://localhost:3460/api/terminal/status \
  -H "Content-Type: application/json" \
  -d '{"terminal":"root","status":"working"}'

# 2. Inbox ellenőrzés
ls /opt/doorstar/terminals/root/inbox/

# 3. Terminál státuszok
ls /opt/doorstar/terminals/*/outbox/
```

---

## KAPCSOLAT SPACEOS-SEL

A Doorstar root **nem** helyettesíti a SpaceOS root-ot:
- **SpaceOS root:** Federation-szintű koordináció, üzleti prioritások
- **Doorstar root:** Ügyfél-szintű testreszabás fókusz

Az ügyfél-specifikus igények Doorstar root-on keresztül kerülnek vissza a JoineryTech-hez.

---

## PROJEKT STRUKTÚRA

```
/opt/doorstar/
├── src/                         ← Ügyfél-specifikus kód
├── terminals/                   ← Agent terminálok
├── docs/                        ← Ügyfél dokumentáció
├── config/                      ← Doorstar konfiguráció
└── doorstar-nexus/              ← Lokális knowledge-service
```

---

## MCP TOOLS

```
# Doorstar knowledge-service: localhost:3460
mcp__doorstar-knowledge__list_inbox
mcp__doorstar-knowledge__submit_done
mcp__doorstar-knowledge__register_working
```

---

## ÜGYFÉL KONTEXTUS

**Doorstar Kft.**
- Profil: Magyar ajtógyártó
- Méret: KKV
- Igény: Digitális gyártásszervezés
- Státusz: Soft Launch előkészítés

**Prioritások:**
1. Core workflow működés
2. PDF gyártási lap generálás
3. Árajánlat készítés
4. Megrendelés kezelés

---

_Doorstar Root — Ügyfél-fókuszú fejlesztés_
