# Doorstar Island Scripts

> Automatizációs szkriptek a Doorstar (ügyfél) island terminál menedzsmentjéhez.

## Telepítési hely

```
/opt/doorstar/scripts/
├── common.sh                    # Közös változók és funkciók
├── nightwatch.sh               # Cron monitoring (DONE, stuck, inbox)
├── federation-watcher.sh       # Federation üzenet figyelő
├── session/
│   ├── start-terminal.sh       # Terminál indítás
│   └── stop-terminal.sh        # Terminál leállítás
├── dispatch/
│   └── send-inbox.sh           # Inbox üzenet küldés
├── mailbox/
│   ├── inbox-status.sh         # UNREAD/DONE státusz
│   └── process-done.sh         # DONE outbox feldolgozás
└── monitoring/
    ├── health-check.sh         # Island health check
    └── terminal-status.sh      # Részletes terminál info
```

## Használat

### Session Management

```bash
# Terminál indítása
/opt/doorstar/scripts/session/start-terminal.sh backend sonnet
/opt/doorstar/scripts/session/start-terminal.sh monitor haiku

# Terminál leállítása
/opt/doorstar/scripts/session/stop-terminal.sh backend
```

### Inbox/Outbox

```bash
# Státusz áttekintés
/opt/doorstar/scripts/mailbox/inbox-status.sh

# Inbox üzenet küldés
/opt/doorstar/scripts/dispatch/send-inbox.sh backend task high "Fix bug" "Description..."

# DONE outbox-ok feldolgozása
/opt/doorstar/scripts/mailbox/process-done.sh
```

### Monitoring

```bash
# Health check
/opt/doorstar/scripts/monitoring/health-check.sh

# Terminál státusz
/opt/doorstar/scripts/monitoring/terminal-status.sh
/opt/doorstar/scripts/monitoring/terminal-status.sh backend
```

## Cron konfiguráció

```bash
# Nightwatch - minden 2 percben
*/2 * * * * /opt/doorstar/scripts/nightwatch.sh >> /opt/doorstar/logs/nightwatch.log 2>&1

# Health check - minden 30 percben
*/30 * * * * /opt/doorstar/scripts/monitoring/health-check.sh >> /opt/doorstar/logs/health.log 2>&1
```

## Változók (common.sh)

| Változó | Érték |
|---------|-------|
| `ISLAND_NAME` | doorstar |
| `ISLAND_ROOT` | /opt/doorstar |
| `ISLAND_PORT` | 3460 |
| `TMUX_PREFIX` | doorstar |
| `TERMINALS` | root backend frontend monitor |

## Megjegyzés

A Doorstar egy **ügyfél island** (customer instance), ezért kisebb terminál csapattal dolgozik:
- `root` — ügyfél-specifikus döntések
- `backend` — Doorstar backend testreszabás
- `frontend` — Doorstar frontend testreszabás
- `monitor` — ügyfél instance monitoring

---
_Doorstar Island Scripts — 2026-07-14_
