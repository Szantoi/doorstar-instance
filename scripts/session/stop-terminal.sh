#!/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
# STOP DOORSTAR TERMINAL
# Usage: stop-terminal.sh <terminal>
#═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(dirname "$0")/.."
source "$SCRIPT_DIR/common.sh"

TERMINAL="$1"

if [[ -z "$TERMINAL" ]]; then
    echo "Usage: $0 <terminal>"
    echo "Terminals: ${TERMINALS[*]}"
    exit 1
fi

SESSION_NAME="${TMUX_PREFIX}-${TERMINAL}"

if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    log_info "Terminal $TERMINAL not running"
    exit 0
fi

log_info "Stopping $TERMINAL..."

# Send /exit to Claude first
tmux send-keys -t "$SESSION_NAME" "/exit" Enter
sleep 2

# Kill the session
tmux kill-session -t "$SESSION_NAME" 2>/dev/null

log_info "Terminal $TERMINAL stopped"
