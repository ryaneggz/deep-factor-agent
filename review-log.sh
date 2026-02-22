#!/bin/bash
# review-log.sh — Standalone log reviewer for Claude stream-json logs
# Formats saved JSON logs into human-readable output via format-log.sh.
#
# Usage:
#   ./review-log.sh <file.log>         # Review single log file
#   ./review-log.sh <directory/>       # Review all .log files in directory
#   ./review-log.sh                    # Print usage

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORMAT_SCRIPT="$SCRIPT_DIR/format-log.sh"

if [ ! -x "$FORMAT_SCRIPT" ]; then
    echo "Error: format-log.sh not found or not executable at $FORMAT_SCRIPT" >&2
    exit 1
fi

if [ $# -eq 0 ]; then
    echo "Usage: $(basename "$0") <file.log|directory>"
    echo ""
    echo "Review Claude stream-json logs in human-readable format."
    echo ""
    echo "Examples:"
    echo "  $(basename "$0") logs/20260222_093100_build_iter0.log"
    echo "  $(basename "$0") archive/0004-openai-default/logs/"
    echo "  $(basename "$0") logs/20260222_093100_build_iter0.log | less -R"
    echo ""
    echo "Environment variables:"
    echo "  THINK_MAX_CHARS       Max chars for thinking preview (default: 200)"
    echo "  RESULT_MAX_CHARS      Max chars for tool results (default: 500)"
    echo "  TOOL_ARGS_MAX_CHARS   Max chars for tool args (default: 120)"
    exit 0
fi

if [ -f "$1" ]; then
    "$FORMAT_SCRIPT" < "$1"
elif [ -d "$1" ]; then
    found=false
    for log_file in "$1"/*.log; do
        if [ ! -f "$log_file" ]; then
            continue
        fi
        if [ "$found" = true ]; then
            echo ""
        fi
        found=true
        echo "═══════════════════════════════════════════"
        echo "  $(basename "$log_file")"
        echo "═══════════════════════════════════════════"
        "$FORMAT_SCRIPT" < "$log_file"
    done
    if [ "$found" = false ]; then
        echo "No .log files found in $1" >&2
        exit 1
    fi
else
    echo "Error: $1 is not a file or directory" >&2
    exit 1
fi
