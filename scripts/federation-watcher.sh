#!/bin/bash
# Federation Watcher — Routes messages between islands
# Runs every 30 seconds via cron or systemd timer

set -euo pipefail

ISLANDS=("nexus" "joinerytech" "doorstar" "spaceos")
LOG_FILE="/opt/spaceos/logs/federation/watcher.log"
LOCK_FILE="/tmp/federation-watcher.lock"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Simple lock to prevent concurrent runs
if [ -f "$LOCK_FILE" ]; then
    pid=$(cat "$LOCK_FILE")
    if kill -0 "$pid" 2>/dev/null; then
        exit 0
    fi
fi
echo $$ > "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

route_message() {
    local msg_file="$1"
    local source_island="$2"

    # Extract target from frontmatter
    local target=$(grep "^to:" "$msg_file" 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ')

    if [ -z "$target" ]; then
        # Skip files without 'to:' field (legacy format)
        return 0
    fi

    # Check if target is internal island
    local target_inbox=""
    for island in "${ISLANDS[@]}"; do
        if [ "$target" = "$island" ]; then
            target_inbox="/opt/$island/terminals/federation/inbox/"
            break
        fi
    done

    # Special handling for Cabinet (external)
    if [ "$target" = "cabinet" ]; then
        log "CABINET: $msg_file → Cabinet bridge queue"
        # Copy to spaceos federation outbox for cabinet-bridge to pick up
        # The cabinet-bridge handles the actual transmission
        return 0
    fi

    if [ -z "$target_inbox" ]; then
        # Target is not an island - might be internal terminal (root, conductor, etc.)
        # Skip silently - these are not federation messages
        return 0
    fi

    # Skip if already delivered
    local filename=$(basename "$msg_file")
    if [ -f "$target_inbox/$filename" ]; then
        return 0
    fi

    # Ensure target inbox exists
    mkdir -p "$target_inbox"

    # Copy message to target inbox
    cp "$msg_file" "$target_inbox/"
    log "ROUTED: $source_island → $target: $filename"
}

# Process each island's outbox
for island in "${ISLANDS[@]}"; do
    outbox="/opt/$island/terminals/federation/outbox"

    if [ ! -d "$outbox" ]; then
        continue
    fi

    for msg in "$outbox"/*.md; do
        [ -f "$msg" ] || continue
        route_message "$msg" "$island"
    done
done

log "Scan complete"
