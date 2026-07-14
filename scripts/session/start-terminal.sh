#!/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
# START DOORSTAR TERMINAL
# Usage: start-terminal.sh <terminal> [model]
# Example: start-terminal.sh backend sonnet
#═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(dirname "$0")/.."
source "$SCRIPT_DIR/common.sh"

TERMINAL="$1"
MODEL="${2:-sonnet}"  # Default to sonnet

if [[ -z "$TERMINAL" ]]; then
    echo "Usage: $0 <terminal> [model]"
    echo "Terminals: ${TERMINALS[*]}"
    echo "Models: opus, sonnet, haiku"
    exit 1
fi

SESSION_NAME="${TMUX_PREFIX}-${TERMINAL}"
TERMINAL_DIR="$TERMINALS_DIR/$TERMINAL"

# Check if already running
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    log_info "Terminal $TERMINAL already running"
    exit 0
fi

# Validate terminal exists
if [[ ! -d "$TERMINAL_DIR" ]]; then
    log_error "Terminal directory not found: $TERMINAL_DIR"
    exit 1
fi

log_info "Starting $TERMINAL with model $MODEL..."

# Create tmux session
tmux new-session -d -s "$SESSION_NAME" -c "$TERMINAL_DIR"

# Start Claude with the appropriate model
case "$MODEL" in
    opus)
        tmux send-keys -t "$SESSION_NAME" "claude --model claude-opus-4-5-20251101" Enter
        ;;
    haiku)
        tmux send-keys -t "$SESSION_NAME" "claude --model claude-haiku-4-0-20250512" Enter
        ;;
    *)
        tmux send-keys -t "$SESSION_NAME" "claude --model claude-sonnet-4-20250514" Enter
        ;;
esac

log_info "Terminal $TERMINAL started: tmux attach -t $SESSION_NAME"
