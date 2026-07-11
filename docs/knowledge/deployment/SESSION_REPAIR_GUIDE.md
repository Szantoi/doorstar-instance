# SpaceOS Session Javítási Útmutató

> Referencia dokumentum a tmux sessionök helyes beállításához és javításához.

---

## Terminál → Projekt Mappa Mapping

| Session név | Projekt mappa | CLAUDE.md |
|-------------|---------------|-----------|
| spaceos-root | /opt/spaceos | /opt/spaceos/CLAUDE.md |
| spaceos-fe | /opt/spaceos/spaceos-doorstar-portal | /opt/spaceos/spaceos-doorstar-portal/CLAUDE.md |
| spaceos-nexus | /opt/spaceos/spaceos-nexus | /opt/spaceos/spaceos-nexus/CLAUDE.md |
| spaceos-kernel | /opt/spaceos/SpaceOS.Kernel | /opt/spaceos/SpaceOS.Kernel/CLAUDE.md |
| spaceos-identity | /opt/spaceos/SpaceOS.Kernel | (Kernel részeként) |
| spaceos-cutting | /opt/spaceos/spaceos-modules-cutting | /opt/spaceos/spaceos-modules-cutting/CLAUDE.md |
| spaceos-joinery | /opt/spaceos/spaceos-modules-joinery | /opt/spaceos/spaceos-modules-joinery/CLAUDE.md |
| spaceos-orch | /opt/spaceos/spaceos-orchestrator | /opt/spaceos/spaceos-orchestrator/CLAUDE.md |
| spaceos-infra | /opt/spaceos/infra | /opt/spaceos/infra/CLAUDE.md |
| spaceos-e2e | /opt/spaceos/e2e | /opt/spaceos/e2e/CLAUDE.md |
| spaceos-conductor | /opt/spaceos | (Root alatt, planner role) |

---

## Mailbox Mappa Mapping

| Session név | Inbox mappa |
|-------------|-------------|
| spaceos-fe | /opt/spaceos/docs/mailbox/fe/inbox/ |
| spaceos-nexus | /opt/spaceos/docs/mailbox/nexus/inbox/ |
| spaceos-kernel | /opt/spaceos/docs/mailbox/kernel/inbox/ |
| spaceos-identity | /opt/spaceos/docs/mailbox/identity/inbox/ |
| spaceos-cutting | /opt/spaceos/docs/mailbox/cutting/inbox/ |
| spaceos-joinery | /opt/spaceos/docs/mailbox/joinery/inbox/ |
| spaceos-orch | /opt/spaceos/docs/mailbox/orch/inbox/ |
| spaceos-infra | /opt/spaceos/docs/mailbox/infra/inbox/ |
| spaceos-conductor | /opt/spaceos/docs/mailbox/conductor/inbox/ |

---

## Session Létrehozási Parancsok

```bash
# FE terminál
tmux -S /tmp/spaceos.tmux new-session -d -s spaceos-fe -c /opt/spaceos/spaceos-doorstar-portal

# Nexus terminál
tmux -S /tmp/spaceos.tmux new-session -d -s spaceos-nexus -c /opt/spaceos/spaceos-nexus

# Identity terminál (Kernel mappa alatt)
tmux -S /tmp/spaceos.tmux new-session -d -s spaceos-identity -c /opt/spaceos/SpaceOS.Kernel

# Cutting terminál
tmux -S /tmp/spaceos.tmux new-session -d -s spaceos-cutting -c /opt/spaceos/spaceos-modules-cutting

# Joinery terminál
tmux -S /tmp/spaceos.tmux new-session -d -s spaceos-joinery -c /opt/spaceos/spaceos-modules-joinery

# Orchestrator terminál
tmux -S /tmp/spaceos.tmux new-session -d -s spaceos-orch -c /opt/spaceos/spaceos-orchestrator

# Kernel terminál
tmux -S /tmp/spaceos.tmux new-session -d -s spaceos-kernel -c /opt/spaceos/SpaceOS.Kernel

# Infra terminál
tmux -S /tmp/spaceos.tmux new-session -d -s spaceos-infra -c /opt/spaceos/infra

# E2E terminál
tmux -S /tmp/spaceos.tmux new-session -d -s spaceos-e2e -c /opt/spaceos/e2e

# Conductor terminál (Root projektben, de külön session)
tmux -S /tmp/spaceos.tmux new-session -d -s spaceos-conductor -c /opt/spaceos
```

---

## Claude Indítás + Nudge Pattern

```bash
# 1. Claude indítás
tmux -S /tmp/spaceos.tmux send-keys -t <session> "claude --model sonnet"
sleep 0.5
tmux -S /tmp/spaceos.tmux send-keys -t <session> Enter

# 2. Várakozás a CLI betöltésére
sleep 3

# 3. Inbox üzenet küldés (dupla Enter!)
tmux -S /tmp/spaceos.tmux send-keys -t <session> "Olvasd el az inbox üzenetedet: /opt/spaceos/docs/mailbox/<terminal>/inbox/"
sleep 0.5
tmux -S /tmp/spaceos.tmux send-keys -t <session> Enter
sleep 1
tmux -S /tmp/spaceos.tmux send-keys -t <session> Enter
```

---

## Stuck Session Diagnózis

```bash
# Ellenőrzés: mi látszik a pane-ben
tmux -S /tmp/spaceos.tmux capture-pane -t <session> -p | tail -20
```

### Pattern-ek és teendők

| Pattern | Jelentés | Teendő |
|---------|----------|--------|
| `shift+tab to cycle` | Permission prompt | Enter küldés |
| `Noodling…` vagy `Thinking…` | Gondolkodik | Ne nyúlj hozzá |
| `> ` prompt üres | Várakozik inputra | Nudge küldés |
| `Szeretnéd, hogy...` | Kérdést tesz fel | Válasz küldés |
| `[Y/n]` | Megerősítést kér | `Y` + Enter |
| `Error:` vagy `BLOCKED` | Hiba történt | Diagnózis szükséges |

---

## Session Kill és Újraindítás

```bash
# Session törlése
tmux -S /tmp/spaceos.tmux kill-session -t <session>

# Majd új session létrehozás (lásd fent)
```

---

## Gyors Diagnosztika Script

```bash
#!/bin/bash
# session-diag.sh — gyors állapotfelmérés

SOCK="/tmp/spaceos.tmux"

echo "=== FUTÓ SESSIONÖK ==="
tmux -S $SOCK list-sessions 2>/dev/null

echo ""
echo "=== SESSION ÁLLAPOTOK ==="
for sess in $(tmux -S $SOCK list-sessions -F "#{session_name}" 2>/dev/null); do
  CMD=$(tmux -S $SOCK list-panes -t "$sess" -F "#{pane_current_command}" 2>/dev/null | head -1)
  DIR=$(tmux -S $SOCK display-message -t "$sess" -p "#{pane_current_path}" 2>/dev/null)
  LAST=$(tmux -S $SOCK capture-pane -t "$sess" -p 2>/dev/null | tail -3 | head -1)
  echo "● $sess"
  echo "  Cmd: $CMD"
  echo "  Dir: $DIR"
  echo "  Last: ${LAST:0:60}..."
  echo ""
done

echo "=== UNREAD INBOX-OK ==="
grep -rl "status: UNREAD" /opt/spaceos/docs/mailbox/*/inbox/ 2>/dev/null | while read f; do
  TERM=$(echo "$f" | sed 's|.*/mailbox/||' | cut -d/ -f1)
  FILE=$(basename "$f")
  echo "  $TERM: $FILE"
done
```

---

## Gyakori Hibák

### 1. Session rossz mappában indul

**Tünet:** A Claude "No CLAUDE.md found" vagy a keresések nem találnak fájlokat.

**Fix:**
```bash
tmux -S /tmp/spaceos.tmux kill-session -t <session>
tmux -S /tmp/spaceos.tmux new-session -d -s <session> -c <helyes_mappa>
```

### 2. Dupla Enter nem működik

**Tünet:** Az üzenet a text mezőben marad.

**Fix:** Növeld a sleep időt:
```bash
sleep 0.5  # → sleep 1
sleep 1    # → sleep 2
```

### 3. Session nem reagál

**Tünet:** Semmilyen output változás.

**Diagnózis:**
```bash
# Ellenőrizd, hogy a process fut-e
tmux -S /tmp/spaceos.tmux list-panes -t <session> -F "#{pane_pid} #{pane_current_command}"

# Ha a process fut de nem reagál → kill és újraindítás
```

---

## Model Választás

| Feladat típus | Ajánlott model |
|---------------|----------------|
| Egyszerű keresés, összefoglaló | haiku |
| Kód írás, napi fejlesztés | sonnet |
| Architektúra, komplex tervezés | opus |

```bash
# Model megadás indításkor
claude --model sonnet  # default
claude --model haiku   # gyors, olcsó
claude --model opus    # erős, drága
```
