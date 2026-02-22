#!/bin/bash
# review-log.sh — Standalone log reviewer for Claude session logs
# Supports both new markdown (.md) logs and archived raw JSON (.log) files.
#
# Why dual format? New logs are saved as formatted markdown (.md) by loop.sh.
# Archived logs from earlier runs are raw JSON (.log) that need format-log.sh
# to transform them. This script handles both transparently.
#
# Usage:
#   ./review-log.sh <file.md>              # Review markdown log (cat directly)
#   ./review-log.sh <file.log>             # Review raw JSON log (format via format-log.sh)
#   ./review-log.sh <directory/>           # Review all logs (prefers .md, falls back to .log)
#   ./review-log.sh                        # Print usage

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORMAT_SCRIPT="$SCRIPT_DIR/format-log.sh"

if [ $# -eq 0 ]; then
    echo "Usage: $(basename "$0") <file.md|file.log|directory>"
    echo ""
    echo "Review Claude session logs in human-readable format."
    echo ""
    echo "Examples:"
    echo "  $(basename "$0") logs/20260222_093100_build_iter0.md"
    echo "  $(basename "$0") archive/0004-openai-default/logs/20260222_092718_plan_iter0.log"
    echo "  $(basename "$0") logs/"
    echo "  $(basename "$0") logs/20260222_093100_build_iter0.md | less -R"
    echo ""
    echo "Environment variables:"
    echo "  THINK_MAX_CHARS       Max chars for thinking preview (default: 200)"
    echo "  RESULT_MAX_CHARS      Max chars for tool results (default: 500)"
    echo "  TOOL_ARGS_MAX_CHARS   Max chars for tool args (default: 120)"
    exit 0
fi

# Helper: ensure format-log.sh is available (needed for .log files)
require_formatter() {
    if [ ! -x "$FORMAT_SCRIPT" ]; then
        echo "Error: format-log.sh not found or not executable at $FORMAT_SCRIPT" >&2
        exit 1
    fi
}

if [ -f "$1" ]; then
    # Single file mode: choose handler based on extension
    case "$1" in
        *.md)
            # Already formatted markdown — display directly
            cat "$1"
            ;;
        *.log)
            # Raw JSON — pipe through formatter
            require_formatter
            "$FORMAT_SCRIPT" < "$1"
            ;;
        *)
            # Unknown extension — attempt formatting as fallback
            require_formatter
            "$FORMAT_SCRIPT" < "$1"
            ;;
    esac
elif [ -d "$1" ]; then
    # Directory mode: prefer .md files, fall back to .log
    found=false

    # Check for .md files first
    md_found=false
    for md_file in "$1"/*.md; do
        if [ ! -f "$md_file" ]; then
            continue
        fi
        if [ "$found" = true ]; then
            echo ""
        fi
        found=true
        md_found=true
        echo "---"
        echo "## $(basename "$md_file")"
        echo "---"
        echo ""
        cat "$md_file"
    done

    # Fall back to .log files if no .md found
    if [ "$md_found" = false ]; then
        require_formatter
        for log_file in "$1"/*.log; do
            if [ ! -f "$log_file" ]; then
                continue
            fi
            if [ "$found" = true ]; then
                echo ""
            fi
            found=true
            echo "---"
            echo "## $(basename "$log_file")"
            echo "---"
            echo ""
            "$FORMAT_SCRIPT" < "$log_file"
        done
    fi

    if [ "$found" = false ]; then
        echo "No .md or .log files found in $1" >&2
        exit 1
    fi
else
    echo "Error: $1 is not a file or directory" >&2
    exit 1
fi
