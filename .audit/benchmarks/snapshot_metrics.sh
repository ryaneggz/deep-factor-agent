#!/usr/bin/env bash
# Captures complexity metrics into a JSON snapshot.
# Usage: bash .audit/benchmarks/snapshot_metrics.sh > .audit/benchmarks/snapshots/baseline.json
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

GIT_SHA=$(git rev-parse --short HEAD)
GIT_MSG=$(git log -1 --format='%s')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Run tests and capture counts
AGENT_TEST_OUTPUT=$(pnpm -C packages/deep-factor-agent test 2>&1 || true)
TUI_TEST_OUTPUT=$(pnpm -C packages/deep-factor-tui test 2>&1 || true)

# Strip ANSI escape codes, then extract summary "Tests" line
strip_ansi() { sed 's/\x1b\[[0-9;]*m//g'; }
AGENT_CLEAN=$(echo "$AGENT_TEST_OUTPUT" | strip_ansi)
TUI_CLEAN=$(echo "$TUI_TEST_OUTPUT" | strip_ansi)

AGENT_TESTS=$(echo "$AGENT_CLEAN" | grep 'Tests' | grep -oP '\d+(?= passed)' | tail -1 || echo "0")
TUI_TESTS=$(echo "$TUI_CLEAN" | grep 'Tests' | grep -oP '\d+(?= passed)' | tail -1 || echo "0")
TOTAL_TESTS=$((AGENT_TESTS + TUI_TESTS))

# Check for failures
AGENT_FAILED=$(echo "$AGENT_CLEAN" | grep 'Tests' | grep -oP '\d+(?= failed)' | tail -1 || echo "0")
TUI_FAILED=$(echo "$TUI_CLEAN" | grep 'Tests' | grep -oP '\d+(?= failed)' | tail -1 || echo "0")
TOTAL_FAILED=$((AGENT_FAILED + TUI_FAILED))

if [ "$TOTAL_FAILED" -gt 0 ] || [ "$TOTAL_TESTS" -eq 0 ]; then
  PASS_RATE="0.0"
else
  PASS_RATE="1.0"
fi

# Run the complexity metrics script
node .audit/compute_ranking.mjs > /dev/null 2>&1

# Read the metrics JSON
METRICS_JSON=$(cat .audit/metrics_raw.json)

# Build snapshot JSON using node for reliable JSON construction
node -e "
const metrics = JSON.parse(process.argv[1]);
const snapshot = {
  timestamp: '$TIMESTAMP',
  git_sha: '$GIT_SHA',
  git_message: '$GIT_MSG',
  totals: {
    ...metrics.totals,
    test_count: $TOTAL_TESTS,
    test_pass_rate: $PASS_RATE,
    test_failures: $TOTAL_FAILED,
  },
  files: metrics.files,
};
console.log(JSON.stringify(snapshot, null, 2));
" "$METRICS_JSON"
