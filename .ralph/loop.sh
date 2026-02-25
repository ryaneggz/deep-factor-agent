#!/bin/bash
# Usage: ./loop.sh [plan] [max_iterations]
# Examples:
#   ./loop.sh              # Build mode, unlimited iterations
#   ./loop.sh 20           # Build mode, max 20 iterations
#   ./loop.sh plan         # Plan mode, unlimited iterations
#   ./loop.sh plan 5       # Plan mode, max 5 iterations
#
# Environment variables:
#   FORMAT_LOGS=0          # Disable formatted output, show raw JSON (default: 1)

# Parse arguments
if [ "$1" = "plan" ]; then
    # Plan mode
    MODE="plan"
    PROMPT_FILE="$SCRIPT_DIR/PROMPT_plan.md"
    MAX_ITERATIONS=${2:-0}
elif [[ "$1" =~ ^[0-9]+$ ]]; then
    # Build mode with max iterations
    MODE="build"
    PROMPT_FILE="$SCRIPT_DIR/PROMPT_build.md"
    MAX_ITERATIONS=$1
else
    # Build mode, unlimited (no arguments or invalid input)
    MODE="build"
    PROMPT_FILE="$SCRIPT_DIR/PROMPT_build.md"
    MAX_ITERATIONS=0
fi

# Formatting control
FORMAT_LOGS="${FORMAT_LOGS:-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORMAT_SCRIPT="$SCRIPT_DIR/format-log.sh"

if [ "$FORMAT_LOGS" = "1" ] && [ ! -x "$FORMAT_SCRIPT" ]; then
    echo "Warning: format-log.sh not found or not executable. Falling back to raw output." >&2
    FORMAT_LOGS=0
fi

ITERATION=0
CURRENT_BRANCH=$(git branch --show-current)
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"
SESSION_START=$(date +%s)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Mode:   $MODE"
echo "Prompt: $PROMPT_FILE"
echo "Branch: $CURRENT_BRANCH"
echo "Logs:   $LOG_DIR/"
[ $MAX_ITERATIONS -gt 0 ] && echo "Max:    $MAX_ITERATIONS iterations"
echo "Format: $([ "$FORMAT_LOGS" = "1" ] && echo "enabled" || echo "disabled")"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Verify prompt file exists
if [ ! -f "$PROMPT_FILE" ]; then
    echo "Error: $PROMPT_FILE not found"
    exit 1
fi

format_duration() {
    local total_secs="$1"
    local mins=$(( total_secs / 60 ))
    local secs=$(( total_secs % 60 ))
    if [ "$mins" -gt 0 ]; then
        printf '%dm %ds' "$mins" "$secs"
    else
        printf '%ds' "$secs"
    fi
}

while true; do
    if [ $MAX_ITERATIONS -gt 0 ] && [ $ITERATION -ge $MAX_ITERATIONS ]; then
        echo "Reached max iterations: $MAX_ITERATIONS"
        break
    fi

    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    LOG_FILE="${LOG_DIR}/${TIMESTAMP}_${MODE}_iter${ITERATION}.md"
    ITER_START=$(date +%s)

    echo "┌─ Iteration $ITERATION ─────────────────────────"
    echo "│ Started: $(date '+%Y-%m-%d %H:%M:%S')"

    # Run Claude iteration with selected prompt
    # -p: Headless mode (non-interactive, reads from stdin)
    # --dangerously-skip-permissions: Auto-approve all tool calls (YOLO mode)
    # --output-format=stream-json: Structured output for logging/monitoring
    # --model opus: Primary agent uses Opus for complex reasoning (task selection, prioritization)
    #               Can use 'sonnet' in build mode for speed if plan is clear and tasks well-defined
    # --verbose: Detailed execution logging
    if [ "$FORMAT_LOGS" = "1" ]; then
        # Formatted markdown to log file AND terminal
        cat "$PROMPT_FILE" | claude -p \
            --dangerously-skip-permissions \
            --output-format=stream-json \
            --model opus \
            --verbose 2>&1 | "$FORMAT_SCRIPT" | tee "$LOG_FILE"
    else
        # Raw JSON to both terminal and log file (original behavior)
        cat "$PROMPT_FILE" | claude -p \
            --dangerously-skip-permissions \
            --output-format=stream-json \
            --model opus \
            --verbose 2>&1 | tee "$LOG_FILE"
    fi

    ITER_END=$(date +%s)
    ITER_DURATION=$(( ITER_END - ITER_START ))

    echo "│ Ended:    $(date '+%Y-%m-%d %H:%M:%S')"
    echo "│ Duration: $(format_duration "$ITER_DURATION")"
    echo "│ Log:      $LOG_FILE"

    # Push changes after each iteration
    echo "│ Pushing to origin/$CURRENT_BRANCH..."
    git push origin "$CURRENT_BRANCH" 2>&1 | tee -a "$LOG_FILE" || {
        echo "│ Failed to push. Creating remote branch..." | tee -a "$LOG_FILE"
        git push -u origin "$CURRENT_BRANCH" 2>&1 | tee -a "$LOG_FILE"
    }
    echo "└────────────────────────────────────────"

    ITERATION=$((ITERATION + 1))
done

# Session summary
SESSION_END=$(date +%s)
SESSION_DURATION=$(( SESSION_END - SESSION_START ))

echo ""
echo "╔══════════════════════════════════════════"
echo "║ SESSION COMPLETE"
echo "║ Mode:       $MODE"
echo "║ Iterations: $ITERATION"
echo "║ Total time: $(format_duration "$SESSION_DURATION")"
echo "║ Logs:       $LOG_DIR/"
echo "╚══════════════════════════════════════════"
