# Federation Protocol — 4-Island + Cabinet Communication

> **KRITIKUS DOKUMENTUM** — Minden sziget közötti kommunikáció ezen protokoll szerint történik.

---

## SZIGET AZONOSÍTÓK

| Sziget | ID | Típus | Lokáció |
|--------|-----|-------|---------|
| Nexus | `nexus` | Infra | `/opt/nexus/` |
| JoineryTech | `joinerytech` | Platform | `/opt/joinerytech/` |
| Doorstar | `doorstar` | Customer | `/opt/doorstar/` |
| SpaceOS | `spaceos` | Orchestration | `/opt/spaceos/` |
| Cabinet | `cabinet` | External Partner | Cabinet VPS |

---

## FEDERATION INBOX/OUTBOX STRUKTÚRA

Minden szigeten:
```
terminals/federation/
├── inbox/      ← Beérkező üzenetek MÁS szigetekről
├── outbox/     ← Kimenő üzenetek MÁS szigeteknek
└── archive/    ← Feldolgozott üzenetek
```

---

## ÜZENET FORMÁTUM

**Fájlnév:** `YYYY-MM-DD_NNN_[from]-[to]-[slug].md`

**Frontmatter (KÖTELEZŐ):**
```yaml
---
id: MSG-FEDERATION-NNN
from: spaceos              # Küldő sziget ID
to: cabinet                # Címzett sziget ID
type: request|response|info|task
priority: critical|high|medium|low
status: UNREAD
created: YYYY-MM-DD
ref: MSG-XXX-NNN           # Kapcsolódó üzenet (opcionális)
content_hash: sha256...    # Tartalom hash (integritás)
---
```

---

## ROUTING SZABÁLYOK

### Belső szigetek között (VPS-en belül)

```
Küldő sziget                    Címzett sziget
outbox/ ───────────────────────► inbox/
         (file copy by watcher)
```

**Watcher:** A `federation-watcher.sh` szkript figyeli az outbox mappákat és másolja az üzeneteket a megfelelő inbox-ba.

### Cabinet-VPS kommunikáció

```
SpaceOS/Doorstar                        Cabinet VPS
outbox/ ─────► Telegram Bot ─────► Cabinet inbox/
               (or HTTP API)
```

**Bridge:** A `spaceos-cabinet-bridge` kezeli a Cabinet kommunikációt.

---

## CÍMZÉSI MÁTRIX

| From \ To | nexus | joinerytech | doorstar | spaceos | cabinet |
|-----------|-------|-------------|----------|---------|---------|
| **nexus** | - | ✅ release | ✅ release | ✅ infra | ❌ |
| **joinerytech** | ✅ bug report | - | ✅ platform | ✅ coord | ❌ |
| **doorstar** | ✅ bug report | ✅ feature req | - | ✅ coord | ✅ production |
| **spaceos** | ✅ task | ✅ task | ✅ task | - | ✅ governance |
| **cabinet** | ❌ | ❌ | ✅ production | ✅ governance | - |

---

## ÜZENET TÍPUSOK

### `type: request`
Kérdés vagy igény, válaszra vár.
```yaml
type: request
expects_response: true
response_deadline: 24h
```

### `type: response`
Válasz egy korábbi request-re.
```yaml
type: response
ref: MSG-FEDERATION-XXX   # Az eredeti request ID
```

### `type: info`
Tájékoztató üzenet, nem vár választ.
```yaml
type: info
```

### `type: task`
Feladat kiadás másik szigetnek.
```yaml
type: task
priority: high
assignee: backend
```

---

## FELDOLGOZÁSI SORREND

1. **Inbox scan** — `status: UNREAD` üzenetek keresése
2. **Priority sort** — critical > high > medium > low
3. **Routing check** — A `to:` mező alapján a megfelelő sziget kezeli
4. **Process** — Feldolgozás, válasz küldés
5. **Archive** — `status: READ` + archív mappába

---

## CABINET-VPS SPECIÁLIS PROTOKOLL

### Cabinet → VPS üzenet
- Telegram bot-on érkezik (vagy HTTP webhook)
- `from: cabinet` azonosítóval
- SpaceOS root/Doorstar root fogadja

### VPS → Cabinet üzenet
- `/opt/spaceos/terminals/federation/outbox/` mappába írjuk
- `to: cabinet` címzéssel
- Bridge elküldi Telegram-on vagy HTTP-n

### Cabinet üzenet típusok
- `governance` — Szabályok, spec-ek, döntések
- `production` — Gyártási adatok, BOM, státusz
- `query` — Lekérdezés, információkérés

---

## PÉLDA ÜZENETEK

### SpaceOS → Cabinet (response)
```yaml
---
id: MSG-FEDERATION-003
from: spaceos
to: cabinet
type: response
priority: high
status: UNREAD
created: 2026-07-11
ref: MSG-ROOT-047
---
# [VPS→CABINET] Doorstar OpenAPI Státusz

A JoineryTech 7 modul prioritást kapott...
```

### Cabinet → SpaceOS (request)
```yaml
---
id: MSG-CABINET-047
from: cabinet
to: spaceos
type: request
priority: medium
status: UNREAD
created: 2026-07-10
---
# [CABINET→VPS] Governance-csomag ingest kész

...várakozó szálak...
```

---

## FEDERATION WATCHER MŰKÖDÉSE

```bash
# /opt/spaceos/scripts/federation-watcher.sh
# Minden 30 másodpercben fut

for island in nexus joinerytech doorstar spaceos; do
  # Outbox üzenetek feldolgozása
  for msg in /opt/$island/terminals/federation/outbox/*.md; do
    target=$(grep "^to:" "$msg" | cut -d: -f2 | tr -d ' ')
    if [ -d "/opt/$target/terminals/federation/inbox/" ]; then
      cp "$msg" "/opt/$target/terminals/federation/inbox/"
    fi
  done
done
```

---

## HIBAKEZELÉS

| Hiba | Kezelés |
|------|---------|
| Címzett nem található | `status: FAILED`, log error |
| Timeout (24h) | Escalation SpaceOS root-nak |
| Duplikált üzenet | `content_hash` alapján kiszűrés |
| Sérült formátum | `status: INVALID`, manuális review |

---

_Federation Protocol v1.0 — 2026-07-11_
