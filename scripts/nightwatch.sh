#!/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
# DOORSTAR NIGHTWATCH
# Cron-based monitoring: DONE detection, stuck sessions, inbox watcher
# Run: */2 * * * * /opt/doorstar/scripts/nightwatch.sh >> /opt/doorstar/logs/nightwatch.log 2>&1
#═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(dirname "$0")"
source "$SCRIPT_DIR/common.sh"

STATE_FILE="$SCRIPTS_DIR/.nightwatch-state"
touch "$STATE_FILE"

log_info "═══ Doorstar Nightwatch starting ═══"

#───────────────────────────────────────────────────────────────────────────────
# 1. PRIORITY TERMINALS - root ALWAYS running (customer island)
#───────────────────────────────────────────────────────────────────────────────
for terminal in root; do
    if ! is_terminal_running "$terminal"; then
        log_warn "Priority terminal '$terminal' not running - starting..."
        "$SCRIPTS_DIR/session/start-terminal.sh" "$terminal" sonnet
    fi
done

#───────────────────────────────────────────────────────────────────────────────
# 2. DONE DETECTION - notify root of completed tasks
#───────────────────────────────────────────────────────────────────────────────
for terminal in "${TERMINALS[@]}"; do
    outbox_dir="$TERMINALS_DIR/$terminal/outbox"
    [[ ! -d "$outbox_dir" ]] && continue

    for done_file in "$outbox_dir"/*.md; do
        [[ ! -f "$done_file" ]] && continue

        if grep -q "status: DONE\|type: done" "$done_file" 2>/dev/null; then
            file_hash=$(md5sum "$done_file" | cut -d' ' -f1)
            if ! grep -q "$file_hash" "$STATE_FILE" 2>/dev/null; then
                log_info "New DONE from $terminal: $(basename "$done_file")"
                echo "$file_hash" >> "$STATE_FILE"

                # Notify root if running
                if is_terminal_running "root"; then
                    tmux send-keys -t "${TMUX_PREFIX}-root" "# DONE detected: $terminal/$(basename "$done_file")" Enter
                fi
            fi
        fi
    done
done

#───────────────────────────────────────────────────────────────────────────────
# 3. STUCK SESSION NUDGE - send Enter to inactive terminals
#───────────────────────────────────────────────────────────────────────────────
for terminal in "${TERMINALS[@]}"; do
    if is_terminal_running "$terminal"; then
        # Get last activity timestamp from tmux
        last_output=$(tmux capture-pane -t "${TMUX_PREFIX}-${terminal}" -p 2>/dev/null | tail -1)
        if [[ "$last_output" =~ ^[[:space:]]*$ ]] || [[ "$last_output" =~ ">" ]]; then
            # Looks stuck at prompt, send nudge
            if (( RANDOM % 10 == 0 )); then  # Only 10% of the time
                log_debug "Nudging stuck terminal: $terminal"
                tmux send-keys -t "${TMUX_PREFIX}-${terminal}" "" Enter
            fi
        fi
    fi
done

#───────────────────────────────────────────────────────────────────────────────
# 4. INBOX WATCHER - start terminals with UNREAD messages
#───────────────────────────────────────────────────────────────────────────────
for terminal in "${TERMINALS[@]}"; do
    unread=$(count_unread "$terminal")
    if [[ "$unread" -gt 0 ]] && ! is_terminal_running "$terminal"; then
        log_info "Starting $terminal - has $unread UNREAD inbox messages"
        "$SCRIPTS_DIR/session/start-terminal.sh" "$terminal"
        sleep 2
        tmux send-keys -t "${TMUX_PREFIX}-${terminal}" "Olvasd el az inbox mappát és dolgozd fel az UNREAD üzeneteket." Enter
    fi
done

#───────────────────────────────────────────────────────────────────────────────
# 5. CLEANUP - keep state file manageable
#───────────────────────────────────────────────────────────────────────────────
if [[ $(wc -l < "$STATE_FILE") -gt 1000 ]]; then
    tail -500 "$STATE_FILE" > "${STATE_FILE}.tmp"
    mv "${STATE_FILE}.tmp" "$STATE_FILE"
fi

log_info "═══ Doorstar Nightwatch complete ═══"
