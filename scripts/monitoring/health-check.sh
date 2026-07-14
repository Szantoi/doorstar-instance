#!/bin/bash
#═══════════════════════════════════════════════════════════════════════════════
# DOORSTAR HEALTH CHECK
# Comprehensive island health monitoring
#═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(dirname "$0")/.."
source "$SCRIPT_DIR/common.sh"

echo "═══════════════════════════════════════════════════════════════════"
echo "  DOORSTAR HEALTH CHECK — $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════════════════════════════"

ISSUES=0

# 1. Knowledge Service
echo ""
echo "1. Knowledge Service (port $ISLAND_PORT)"
echo "───────────────────────────────────────────────────────────────────"
if check_knowledge_service; then
    health=$(curl -s "http://localhost:$ISLAND_PORT/health")
    echo "   Status: OK"
    echo "   Documents: $(echo "$health" | grep -o '"documents":[0-9]*' | cut -d: -f2)"
else
    echo "   Status: DOWN"
    ((ISSUES++))
fi

# 2. Priority Terminals (just root for customer island)
echo ""
echo "2. Priority Terminals (root)"
echo "───────────────────────────────────────────────────────────────────"
for terminal in root; do
    if is_terminal_running "$terminal"; then
        echo "   $terminal: RUNNING"
    else
        echo "   $terminal: NOT RUNNING ⚠️"
        ((ISSUES++))
    fi
done

# 3. Other Terminals
echo ""
echo "3. Other Terminals"
echo "───────────────────────────────────────────────────────────────────"
for terminal in "${TERMINALS[@]}"; do
    [[ "$terminal" == "root" ]] && continue
    if is_terminal_running "$terminal"; then
        echo "   $terminal: running"
    else
        echo "   $terminal: stopped"
    fi
done

# 4. Directory Structure
echo ""
echo "4. Directory Structure"
echo "───────────────────────────────────────────────────────────────────"
for dir in "$TERMINALS_DIR" "$LOGS_DIR" "$SCRIPTS_DIR"; do
    if [[ -d "$dir" ]]; then
        echo "   $dir: OK"
    else
        echo "   $dir: MISSING ⚠️"
        ((ISSUES++))
    fi
done

# 5. Summary
echo ""
echo "═══════════════════════════════════════════════════════════════════"
if [[ $ISSUES -eq 0 ]]; then
    echo "  HEALTH: OK — No issues detected"
else
    echo "  HEALTH: DEGRADED — $ISSUES issue(s) found"
fi
echo "═══════════════════════════════════════════════════════════════════"

exit $ISSUES
