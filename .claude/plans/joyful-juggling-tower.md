# Repeatable Complexity Reduction Workflow

## Context

The codebase has mature but disconnected complexity tooling: a `/complexity-score` command for analysis, a benchmark suite for validation, and an issue template describing the full audit protocol. However, running an audit requires manually orchestrating ~15 steps across these tools (create branch, score, baseline, reduce, benchmark, PR). The goal is a single `/complexity-audit` command that automates the full lifecycle so any developer can run it monthly/quarterly with one invocation.

Prior audit (2026-03-14) applied 2 of 5 patterns. 3 remain pending. The workflow must support both "continue pending patterns" and "fresh re-score" modes.

## Implementation

### Step 1: Add status tracking to pattern_recommendations.yaml

**File:** `.audit/pattern_recommendations.yaml`

Add a `status` field to each pattern entry: `applied`, `pending`, or `skipped`. Backfill from the prior audit:
- Pattern 1 (agent.ts runLoop): `pending`
- Pattern 2 (agent.ts executeToolCall): `applied`
- Pattern 3 (claude-cli.ts stream): `pending`
- Pattern 4 (useAgent.ts extraction): `applied`
- Pattern 5 (log-mappers template): `pending`

This enables the orchestrator to detect whether to continue or start fresh.

### Step 2: Create audit manifest for history tracking

**File:** `.audit/audit-manifest.json` (new)

```json
{
  "audits": [
    {
      "id": "20260314",
      "date": "2026-03-14",
      "branch": "refactor/complexity-audit-run-20260314",
      "pr": 24,
      "patterns_total": 5,
      "patterns_applied": [2, 4],
      "patterns_deferred": [1, 3, 5],
      "baseline_cc": 694,
      "result_cc": 636,
      "test_count": 440,
      "verdict": "PASS"
    }
  ],
  "current_baseline": {
    "snapshot": ".audit/benchmarks/snapshots/baseline.json",
    "total_cc": 636,
    "test_count": 440
  }
}
```

### Step 3: Create baseline rotation script

**File:** `.audit/rotate-baseline.sh` (new)

Short shell script that:
1. Archives old baseline to `.audit/benchmarks/snapshots/archive/<date>-baseline.json`
2. Copies `current.json` to `baseline.json`
3. Prints confirmation

This gets called after a successful audit to update the baseline for future runs.

### Step 4: Create the `/complexity-audit` orchestrator command

**File:** `.claude/commands/complexity-audit.md` (new)

This is the primary deliverable. A Claude command that orchestrates the full cycle.

**Arguments:**
- `mode`: `continue` | `fresh` | `auto` (default: `auto` - continues if pending patterns exist, else fresh)
- `scope`: `all` | `agent` | `tui` (default: `all`)
- `patterns`: Max patterns to apply per run (default: `3`)

**Phases:**

**Phase 0 - SETUP:**
1. Read `.audit/audit-manifest.json` and `.audit/pattern_recommendations.yaml`
2. Auto-detect mode: if pending patterns exist and mode is `auto`, use `continue`; otherwise `fresh`
3. Create branch: `refactor/complexity-audit-[YYYYMMDD]`
4. Validate green baseline: `pnpm -r build && pnpm -r type-check && pnpm -r test`
5. If baseline fails, STOP

**Phase 1 - SCORE (fresh only) / LOAD (continue):**
- Fresh: Invoke the existing `/complexity-score` protocol (reads `prompts/complexity-scorer.md`), regenerate all `.audit/` artifacts
- Continue: Read existing `pattern_recommendations.yaml`, filter to `status: pending`
- Take baseline snapshot via `bash .audit/benchmarks/snapshot_metrics.sh`
- Commit audit artifacts

**Phase 2 - REDUCE:**
- For each pattern (up to `$patterns`), in composite score order:
  1. Apply the refactoring
  2. Validate: `pnpm -r build && pnpm -r type-check && pnpm -r test`
  3. On success: atomic commit `refactor(<scope>): <pattern> -- <file>`, update status to `applied`
  4. On failure: revert, mark `skipped`, move to next
- Commit updated `pattern_recommendations.yaml`

**Phase 3 - VERIFY:**
1. Run `bash .audit/benchmarks/run_benchmark.sh`
2. Read verdict from `report.md`
3. If PASS: run `bash .audit/rotate-baseline.sh`
4. Update `audit-manifest.json` with run results
5. Commit verification artifacts

**Phase 4 - SHIP:**
1. Push branch
2. Create draft PR via `gh pr create` with benchmark results in body
3. Report PR URL

### Step 5: Add CI complexity gate

**File:** `.github/workflows/complexity-gate.yml` (new)

Separate workflow triggered on PRs to master:

```yaml
name: Complexity Gate
on:
  pull_request:
    branches: [master]
jobs:
  complexity-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r build
      - run: pnpm -r test
      - name: Capture current metrics
        run: bash .audit/benchmarks/snapshot_metrics.sh > .audit/benchmarks/snapshots/current.json
      - name: Compare against baseline
        run: node .audit/benchmarks/compare_snapshots.mjs
```

The existing `compare_snapshots.mjs` already exits non-zero on gate failure (line 114), so the CI job naturally fails on regression.

### Step 6: Update documentation cross-references

**Files:**
- `.claude/commands/complexity-score.md` - Add note: "For the full audit cycle (branch, reduce, benchmark, PR), use `/complexity-audit`"
- `CLAUDE.md` - Add "Complexity Audit Workflow" section under Operational Notes

## Critical Files

| File | Action | Purpose |
|------|--------|---------|
| `.claude/commands/complexity-audit.md` | CREATE | Orchestrator command (primary entry point) |
| `.audit/audit-manifest.json` | CREATE | Audit history and state tracking |
| `.audit/rotate-baseline.sh` | CREATE | Baseline rotation after successful audits |
| `.github/workflows/complexity-gate.yml` | CREATE | CI regression prevention |
| `.audit/pattern_recommendations.yaml` | MODIFY | Add `status` field per pattern |
| `.claude/commands/complexity-score.md` | MODIFY | Cross-reference to new command |
| `CLAUDE.md` | MODIFY | Document the workflow |

## Existing code to reuse (no changes needed)

- `prompts/complexity-scorer.md` - Scoring methodology (invoked by the orchestrator via `/complexity-score`)
- `.audit/benchmarks/run_benchmark.sh` - Benchmark entry point
- `.audit/benchmarks/compare_snapshots.mjs` - Gate logic with exit codes
- `.audit/benchmarks/snapshot_metrics.sh` - Metric capture
- `.github/ISSUE_TEMPLATE/complexity_audit.md` - Issue template (unchanged)

## Verification

1. Run `/complexity-audit mode="continue" patterns=1` to test with one pending pattern
2. Verify branch `refactor/complexity-audit-[date]` is created
3. Verify pattern applied with atomic commit
4. Verify `pnpm -r build && pnpm -r type-check && pnpm -r test` all pass
5. Verify benchmark report generated with PASS verdict
6. Verify draft PR created with benchmark results
7. Verify `audit-manifest.json` updated with new run entry
8. Verify `pattern_recommendations.yaml` status fields updated
