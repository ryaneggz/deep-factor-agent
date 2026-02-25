# Plan: Delete logs instead of archiving; retain .claude/plans

## Context

Logs are bulky and not worth archiving. `.claude/plans/*.md` files are useful context and should be kept across phases. Currently `archive.sh` does the opposite: moves logs into the archive and deletes plans.

## File

`.ralph/archive.sh`

## Changes

### 1. Remove the `PLANS_DIR` variable and all `.claude/plans` logic

- Delete `PLANS_DIR="$REPO_ROOT/.claude/plans"` (line 19)
- Delete the `REPO_ROOT` variable (line 14) — no longer needed
- Delete the `plan_count` counting block (lines 220-232, preview section)
- Delete the `rm -f "$PLANS_DIR"/*.md` execution block (lines 281-284)
- Delete the `Plans: deleted` summary line (line 297)

### 2. Change logs from "move to archive" to "delete in place"

- **Preview section** (lines 210-218): Change the `logs/` line from showing "→ archive" to showing "Delete: logs/ (N files)"
- **Execute section** (lines 271-279): Replace `mv` with `rm` — delete log files instead of moving them to `$TARGET_DIR/logs/`
- **Summary section**: Change `Logs: moved` to `Logs: deleted`

### 3. Update safety check

- Line 181: The check `if [ "$has_specs" = false ] && [ "$has_logs" = false ]` currently requires specs OR logs. Since logs are being deleted rather than archived, the safety gate should only require specs (the only thing actually being archived). Change to: `if [ "$has_specs" = false ]`

### 4. Update header comment

- Line 4: Remove mention of "deletes ephemeral .claude/plans/*.md"
- Add mention of "deletes logs/"

## Verification

1. `bash -n .ralph/archive.sh` — syntax check
2. `.ralph/archive.sh --help` — prints usage
3. `echo n | .ralph/archive.sh` — preview shows "Delete: logs/" instead of moving them, no mention of `.claude/plans`
