#!/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
# DOORSTAR COMMON FUNCTIONS
# Shared utilities for all Doorstar scripts
#═══════════════════════════════════════════════════════════════════════════════

# Island identity
export ISLAND_NAME="doorstar"
export ISLAND_ROOT="/opt/doorstar"
export ISLAND_PORT=3460
export TMUX_PREFIX="doorstar"

# Terminals (customer island - smaller team)
export TERMINALS=(root backend frontend monitor)

# Paths
export TERMINALS_DIR="$ISLAND_ROOT/terminals"
export SCRIPTS_DIR="$ISLAND_ROOT/scripts"
export LOGS_DIR="$ISLAND_ROOT/logs"
export CONFIG_DIR="$ISLAND_ROOT/config"

# SpaceOS integration
export SPACEOS_ROOT="/opt/spaceos"
export FEDERATION_INBOX="$SPACEOS_ROOT/terminals/federation/inbox"

# Logging
log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*"
}

log_info()  { log "INFO" "$@"; }
log_warn()  { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_debug() { [[ "${DEBUG:-0}" == "1" ]] && log "DEBUG" "$@"; }

# Terminal management
is_terminal_running() {
    local terminal="$1"
    tmux has-session -t "${TMUX_PREFIX}-${terminal}" 2>/dev/null
}

get_terminal_session() {
    local terminal="$1"
    echo "${TMUX_PREFIX}-${terminal}"
}

# Inbox/Outbox helpers
count_unread() {
    local terminal="$1"
    local inbox_dir="$TERMINALS_DIR/$terminal/inbox"
    grep -rl "status: UNREAD" "$inbox_dir" 2>/dev/null | wc -l
}

count_done() {
    local terminal="$1"
    local outbox_dir="$TERMINALS_DIR/$terminal/outbox"
    grep -rl "status: DONE\|type: DONE" "$outbox_dir" 2>/dev/null | wc -l
}

get_next_msg_number() {
    local terminal="$1"
    local inbox_dir="$TERMINALS_DIR/$terminal/inbox"
    local last=$(ls "$inbox_dir" 2>/dev/null | grep "^[0-9]" | sort | tail -1 | cut -d'_' -f2)
    printf "%03d" $((10#${last:-0} + 1))
}

# Knowledge service check
check_knowledge_service() {
    curl -s "http://localhost:$ISLAND_PORT/health" 2>/dev/null | grep -q '"status":"ok"'
}

# Robusztus tmux küldés - 3 féle Enter egymás után
tmux_send_robust() {
    local session="$1"
    local message="$2"
    if ! tmux has-session -t "$session" 2>/dev/null; then
        log_error "Session not found: $session"
        return 1
    fi
    [ -n "$message" ] && tmux send-keys -t "$session" "$message" && sleep 0.1
    tmux send-keys -t "$session" Enter; sleep 0.15
    tmux send-keys -t "$session" C-m; sleep 0.15
    tmux send-keys -t "$session" C-j
    return 0
}
