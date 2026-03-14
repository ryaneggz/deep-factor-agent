#!/usr/bin/env bash
# Single entry point for the complexity benchmark suite.
# 1. Captures current metrics snapshot
# 2. Compares against baseline
# 3. Generates report
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "=== Complexity Benchmark Suite ==="
echo ""

# Step 1: Capture current snapshot
echo "[1/3] Capturing current metrics snapshot..."
bash .audit/benchmarks/snapshot_metrics.sh > .audit/benchmarks/snapshots/current.json
echo "  -> Saved to .audit/benchmarks/snapshots/current.json"
echo ""

# Step 2: Check baseline exists
if [ ! -f .audit/benchmarks/snapshots/baseline.json ]; then
  echo "[ERROR] No baseline snapshot found at .audit/benchmarks/snapshots/baseline.json"
  echo "  Create one with: bash .audit/benchmarks/snapshot_metrics.sh > .audit/benchmarks/snapshots/baseline.json"
  exit 1
fi

# Step 3: Compare snapshots
echo "[2/3] Comparing baseline vs current..."
node .audit/benchmarks/compare_snapshots.mjs
echo ""

echo "[3/3] Report generated at .audit/benchmarks/report.md"
echo ""
echo "=== Done ==="
