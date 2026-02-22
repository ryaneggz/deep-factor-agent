#!/bin/bash
# archive.sh — Archive current implementation phase
# Moves IMPLEMENTATION_PLAN.md, specs/, and logs/ into archive/NNNN-name/,
# deletes ephemeral .claude/plans/*.md, and resets IMPLEMENTATION_PLAN.md
# to a fresh template.
#
# Usage:
#   ./archive.sh                    # Derive name from git branch
#   ./archive.sh my-feature         # Explicit name
#   ./archive.sh --yes              # Skip confirmation
#   ./archive.sh my-feature --yes   # Both

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
IMPL_PLAN="$SCRIPT_DIR/IMPLEMENTATION_PLAN.md"
SPECS_DIR="$SCRIPT_DIR/specs"
LOGS_DIR="$SCRIPT_DIR/logs"
PLANS_DIR="$REPO_ROOT/.claude/plans"

# ── Parse arguments ──────────────────────────────────────────

NAME=""
AUTO_YES=false

for arg in "$@"; do
    case "$arg" in
        --yes|-y)
            AUTO_YES=true
            ;;
        --help|-h)
            echo "Usage: $(basename "$0") [name] [--yes|-y] [--help|-h]"
            echo ""
            echo "Archive the current implementation phase."
            echo ""
            echo "  name     Archive slug (default: derived from git branch)"
            echo "  --yes    Skip confirmation prompt"
            echo "  --help   Show this help"
            echo ""
            echo "Examples:"
            echo "  $(basename "$0")                    # Derive name from branch"
            echo "  $(basename "$0") my-feature         # Explicit name"
            echo "  $(basename "$0") --yes              # Skip prompt"
            echo "  $(basename "$0") my-feature --yes   # Both"
            exit 0
            ;;
        *)
            NAME="$arg"
            ;;
    esac
done

# ── Helper functions ─────────────────────────────────────────

derive_name_from_branch() {
    local branch
    branch=$(git branch --show-current 2>/dev/null)
    if [ -z "$branch" ]; then
        echo "unknown"
        return
    fi
    # Strip username/ prefix (e.g. ryaneggz/0001-clean-up-loop-log → 0001-clean-up-loop-log)
    local slug="${branch##*/}"
    # Strip leading NNNN- prefix (e.g. 0001-clean-up-loop-log → clean-up-loop-log)
    slug=$(echo "$slug" | sed 's/^[0-9]\{1,\}-//')
    echo "$slug"
}

sanitize_name() {
    local name="$1"
    # Lowercase
    name=$(echo "$name" | tr '[:upper:]' '[:lower:]')
    # Non-alphanumeric → hyphens
    name=$(echo "$name" | sed 's/[^a-z0-9]/-/g')
    # Collapse multiple hyphens
    name=$(echo "$name" | sed 's/-\{2,\}/-/g')
    # Trim leading/trailing hyphens
    name=$(echo "$name" | sed 's/^-//;s/-$//')
    echo "$name"
}

detect_next_number() {
    local max=0
    if [ -d "$ARCHIVE_DIR" ]; then
        for dir in "$ARCHIVE_DIR"/[0-9][0-9][0-9][0-9]-*/; do
            [ -d "$dir" ] || continue
            local base
            base=$(basename "$dir")
            local num="${base%%-*}"
            # Force decimal (avoid octal interpretation)
            num=$((10#$num))
            if [ "$num" -gt "$max" ]; then
                max=$num
            fi
        done
    fi
    printf '%04d' $((max + 1))
}

write_fresh_template() {
    local today
    today=$(date +%Y-%m-%d)
    cat > "$IMPL_PLAN" <<EOF
# IMPLEMENTATION PLAN

> Last updated: $today
> Status: **IN PROGRESS**

---

## Status Summary

_Describe the current work phase and its goals._

---

## In Progress

_Items currently being worked on._

---

## Completed Items

_Items finished in this phase._

---

## Low Priority / Deferred

_Items that can wait._

---

## Notes

_Observations, learnings, decisions._
EOF
}

# ── Derive and validate name ─────────────────────────────────

if [ -z "$NAME" ]; then
    NAME=$(derive_name_from_branch)
fi
NAME=$(sanitize_name "$NAME")

if [ -z "$NAME" ]; then
    echo "Error: Could not derive archive name. Provide one explicitly." >&2
    exit 1
fi

# ── Detect next number ───────────────────────────────────────

NUMBER=$(detect_next_number)
TARGET_DIR="$ARCHIVE_DIR/${NUMBER}-${NAME}"

# ── Safety checks ────────────────────────────────────────────

if [ ! -f "$IMPL_PLAN" ]; then
    echo "Error: IMPLEMENTATION_PLAN.md not found." >&2
    exit 1
fi

# Check that at least one of specs/ or logs/ has content
has_specs=false
has_logs=false

if [ -d "$SPECS_DIR" ]; then
    for f in "$SPECS_DIR"/*.md; do
        [ -f "$f" ] && has_specs=true && break
    done
fi

if [ -d "$LOGS_DIR" ]; then
    for f in "$LOGS_DIR"/*; do
        [ -f "$f" ] && [ "$(basename "$f")" != ".gitkeep" ] && has_logs=true && break
    done
fi

if [ "$has_specs" = false ] && [ "$has_logs" = false ]; then
    echo "Error: No specs or logs to archive." >&2
    exit 1
fi

if [ -d "$TARGET_DIR" ]; then
    echo "Error: Target already exists: $TARGET_DIR" >&2
    exit 1
fi

# ── Preview ──────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════"
echo "║ ARCHIVE PREVIEW"
echo "║ Target: $TARGET_DIR/"
echo "╠══════════════════════════════════════════"

echo "║"
echo "║ Move:"
echo "║   IMPLEMENTATION_PLAN.md → ${NUMBER}-${NAME}/IMPLEMENTATION_PLAN.md"

if [ "$has_specs" = true ]; then
    for f in "$SPECS_DIR"/*.md; do
        [ -f "$f" ] || continue
        echo "║   specs/$(basename "$f") → ${NUMBER}-${NAME}/specs/$(basename "$f")"
    done
fi

if [ "$has_logs" = true ]; then
    local_count=0
    for f in "$LOGS_DIR"/*; do
        [ -f "$f" ] || continue
        [ "$(basename "$f")" = ".gitkeep" ] && continue
        local_count=$((local_count + 1))
    done
    echo "║   logs/ ($local_count files) → ${NUMBER}-${NAME}/logs/"
fi

# Ephemeral plans
plan_count=0
if [ -d "$PLANS_DIR" ]; then
    for f in "$PLANS_DIR"/*.md; do
        [ -f "$f" ] || continue
        plan_count=$((plan_count + 1))
    done
fi
if [ "$plan_count" -gt 0 ]; then
    echo "║"
    echo "║ Delete:"
    echo "║   .claude/plans/*.md ($plan_count files)"
fi

echo "║"
echo "║ Reset:"
echo "║   IMPLEMENTATION_PLAN.md → fresh template"
echo "╚══════════════════════════════════════════"
echo ""

# ── Confirm ──────────────────────────────────────────────────

if [ "$AUTO_YES" = false ]; then
    printf "Proceed? [y/N] "
    read -r answer
    case "$answer" in
        [yY]|[yY][eE][sS]) ;;
        *)
            echo "Aborted."
            exit 0
            ;;
    esac
fi

# ── Execute ──────────────────────────────────────────────────

# Create target directories
mkdir -p "$TARGET_DIR"

# Move IMPLEMENTATION_PLAN.md
mv "$IMPL_PLAN" "$TARGET_DIR/IMPLEMENTATION_PLAN.md"

# Move specs
if [ "$has_specs" = true ]; then
    mkdir -p "$TARGET_DIR/specs"
    for f in "$SPECS_DIR"/*.md; do
        [ -f "$f" ] || continue
        mv "$f" "$TARGET_DIR/specs/"
    done
fi

# Move logs (except .gitkeep)
if [ "$has_logs" = true ]; then
    mkdir -p "$TARGET_DIR/logs"
    for f in "$LOGS_DIR"/*; do
        [ -f "$f" ] || continue
        [ "$(basename "$f")" = ".gitkeep" ] && continue
        mv "$f" "$TARGET_DIR/logs/"
    done
fi

# Delete ephemeral plans
if [ "$plan_count" -gt 0 ]; then
    rm -f "$PLANS_DIR"/*.md
fi

# Write fresh template
write_fresh_template

# ── Summary ──────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════"
echo "║ ARCHIVE COMPLETE"
echo "║ Archived to: $TARGET_DIR/"
[ "$has_specs" = true ] && echo "║ Specs:       moved"
[ "$has_logs" = true ]  && echo "║ Logs:        moved"
[ "$plan_count" -gt 0 ] && echo "║ Plans:       deleted ($plan_count files)"
echo "║ Template:    reset"
echo "╚══════════════════════════════════════════"
