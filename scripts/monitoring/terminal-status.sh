#!/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
# DOORSTAR TERMINAL STATUS
# Detailed info about a specific terminal or all terminals
#═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(dirname "$0")/.."
source "$SCRIPT_DIR/common.sh"

TERMINAL="$1"

show_terminal_status() {
    local terminal="$1"
    local session="${TMUX_PREFIX}-${terminal}"

    echo ""
    echo "Terminal: $terminal"
    echo "───────────────────────────────────────────────────────────────"

    if is_terminal_running "$terminal"; then
        echo "  Session: $session (RUNNING)"
        echo "  Last output:"
        tmux capture-pane -t "$session" -p 2>/dev/null | tail -5 | sed 's/^/    /'
    else
        echo "  Session: not running"
    fi

    echo "  Inbox UNREAD: $(count_unread "$terminal")"
    echo "  Outbox DONE: $(count_done "$terminal")"
}

echo "═══════════════════════════════════════════════════════════════════"
echo "  DOORSTAR TERMINAL STATUS — $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════════════"

if [[ -n "$TERMINAL" ]]; then
    show_terminal_status "$TERMINAL"
else
    for terminal in "${TERMINALS[@]}"; do
        show_terminal_status "$terminal"
    done
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
