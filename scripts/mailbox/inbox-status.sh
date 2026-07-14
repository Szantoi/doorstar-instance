#!/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
# DOORSTAR INBOX STATUS
# Shows UNREAD/DONE counts for all terminals
#═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(dirname "$0")/.."
source "$SCRIPT_DIR/common.sh"

echo "═══════════════════════════════════════════════════════════════════"
echo "  DOORSTAR INBOX/OUTBOX STATUS — $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════════════"
printf "%-15s %-8s %-8s %-10s\n" "TERMINAL" "UNREAD" "DONE" "STATUS"
echo "───────────────────────────────────────────────────────────────────"

for terminal in "${TERMINALS[@]}"; do
    unread=$(count_unread "$terminal")
    done=$(count_done "$terminal")

    if is_terminal_running "$terminal"; then
        status="RUNNING"
    else
        status="stopped"
    fi

    printf "%-15s %-8s %-8s %-10s\n" "$terminal" "$unread" "$done" "$status"
done

echo "═══════════════════════════════════════════════════════════════════"

# Knowledge service status
if check_knowledge_service; then
    echo "Knowledge Service: OK (port $ISLAND_PORT)"
else
    echo "Knowledge Service: DOWN"
fi
