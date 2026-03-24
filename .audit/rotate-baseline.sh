#!/usr/bin/env bash
# Promotes current.json to baseline.json after a successful audit.
# Archives the old baseline for historical reference.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SNAPSHOTS=".audit/benchmarks/snapshots"
ARCHIVE="$SNAPSHOTS/archive"
DATE=$(date +%Y%m%d)

# Ensure archive directory exists
mkdir -p "$ARCHIVE"

# Archive the old baseline (if it exists)
if [ -f "$SNAPSHOTS/baseline.json" ]; then
  cp "$SNAPSHOTS/baseline.json" "$ARCHIVE/${DATE}-baseline.json"
  echo "Archived old baseline to $ARCHIVE/${DATE}-baseline.json"
fi

# Promote current to baseline
if [ ! -f "$SNAPSHOTS/current.json" ]; then
  echo "[ERROR] No current snapshot found at $SNAPSHOTS/current.json"
  exit 1
fi

cp "$SNAPSHOTS/current.json" "$SNAPSHOTS/baseline.json"
echo "Promoted current.json -> baseline.json"
echo "New baseline is now active."
