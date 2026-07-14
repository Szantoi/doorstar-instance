#!/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
# PROCESS DONE OUTBOXES
# Moves DONE outbox files to archive after processing
#═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(dirname "$0")/.."
source "$SCRIPT_DIR/common.sh"

echo "═══════════════════════════════════════════════════════════════════"
echo "  PROCESSING DONE OUTBOXES — $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════════════"

PROCESSED=0

for terminal in "${TERMINALS[@]}"; do
    outbox_dir="$TERMINALS_DIR/$terminal/outbox"
    archive_dir="$TERMINALS_DIR/$terminal/archive"

    [[ ! -d "$outbox_dir" ]] && continue
    mkdir -p "$archive_dir"

    for done_file in "$outbox_dir"/*.md; do
        [[ ! -f "$done_file" ]] && continue

        if grep -q "status: DONE\|type: done" "$done_file" 2>/dev/null; then
            filename=$(basename "$done_file")
            echo "  [$terminal] $filename"

            # Update status to PROCESSED
            sed -i 's/status: DONE/status: PROCESSED/' "$done_file"

            # Move to archive
            mv "$done_file" "$archive_dir/"
            ((PROCESSED++))
        fi
    done
done

echo "───────────────────────────────────────────────────────────────────"
echo "Processed: $PROCESSED files"
echo "═══════════════════════════════════════════════════════════════════"
