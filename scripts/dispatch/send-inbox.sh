#!/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
# SEND INBOX MESSAGE
# Usage: send-inbox.sh <to-terminal> <type> <priority> <title> <content>
# Example: send-inbox.sh backend task high "Fix API bug" "Description here..."
#═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(dirname "$0")/.."
source "$SCRIPT_DIR/common.sh"

TO="$1"
TYPE="${2:-task}"
PRIORITY="${3:-medium}"
TITLE="$4"
CONTENT="$5"

if [[ -z "$TO" ]] || [[ -z "$TITLE" ]]; then
    echo "Usage: $0 <to-terminal> <type> <priority> <title> <content>"
    echo "Types: task, question, directive, answer"
    echo "Priorities: critical, high, medium, low"
    exit 1
fi

DATE=$(date +%Y-%m-%d)
INBOX_DIR="$TERMINALS_DIR/$TO/inbox"
MSG_NUM=$(get_next_msg_number "$TO")
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | head -c 40)
FILENAME="${DATE}_${MSG_NUM}_${SLUG}.md"
FILEPATH="$INBOX_DIR/$FILENAME"

# Ensure inbox exists
mkdir -p "$INBOX_DIR"

# Generate content hash
HASH=$(echo -n "$TITLE$CONTENT$DATE" | sha256sum | cut -d' ' -f1)

# Create message
cat > "$FILEPATH" << EOF
---
id: MSG-DOORSTAR-${TO^^}-${MSG_NUM}
from: ${ISLAND_NAME}-dispatcher
to: ${ISLAND_NAME}-${TO}
type: $TYPE
priority: $PRIORITY
status: UNREAD
model: sonnet
created: $DATE
content_hash: $HASH
---

# $TITLE

$CONTENT

---
_${ISLAND_NAME} dispatch — $DATE_
EOF

log_info "Sent inbox message: $FILEPATH"
echo "$FILEPATH"
