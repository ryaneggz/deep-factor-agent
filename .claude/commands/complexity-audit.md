# Complexity Audit

Orchestrate a full complexity reduction cycle: branch, score, reduce, benchmark, and ship a draft PR.

> For scoring/analysis only (no branch or PR), use `/complexity-score` instead.

## Arguments

- `mode`: `continue` | `fresh` | `auto` (default: `auto`)
  - `auto`: continues pending patterns if any exist, otherwise runs a fresh audit
  - `continue`: applies only pending patterns from `pattern_recommendations.yaml`
  - `fresh`: re-scores the entire codebase and generates new recommendations
- `scope`: `all` | `agent` | `tui` (default: `all`)
- `patterns`: Max number of patterns to apply this cycle (default: `3`)

**Usage:** `/complexity-audit` or `/complexity-audit mode="fresh" scope="agent" patterns=2`

---

## Phase 0 — SETUP

1. Read project context:
   - `CLAUDE.md` for build/test/type-check commands
   - `.audit/audit-manifest.json` for audit history, current baseline, and **prior reflections**
   - `.audit/pattern_recommendations.yaml` for pattern status

2. **Review prior reflections:**
   - Read the `reflections` object from the most recent entry in `audit-manifest.json`
   - Pay special attention to `next_time` — these are direct instructions from the previous audit
   - Review `surprises` — these flag non-obvious risks that may recur
   - Review `what_failed` — avoid repeating the same approach if it failed before
   - Announce any prior reflections that are relevant to the patterns being attempted this cycle

3. **Determine mode:**
   - If `$ARGUMENTS.mode` is `auto` (or not provided):
     - Count entries in `pattern_recommendations.yaml` where `status: pending`
     - If pending count > 0: use `continue` mode
     - If pending count = 0: use `fresh` mode
   - Otherwise use the explicitly provided mode

4. **Create branch:**
   ```bash
   git checkout -b refactor/complexity-audit-$(date +%Y%m%d)
   ```

5. **Validate green baseline** — the audit MUST NOT start on a broken codebase:
   ```bash
   pnpm -r build && pnpm -r type-check && pnpm -r test
   ```
   If any command fails, **STOP immediately** and report the failure. Do not proceed.

6. Announce the mode, scope, number of patterns to apply, and any relevant prior reflections.

---

## Phase 1 — SCORE (fresh mode) or LOAD (continue mode)

### If mode is `fresh`:

1. Execute the full complexity scoring protocol by reading and following `prompts/complexity-scorer.md`:
   - STUDY: discover project structure, dependencies, test infrastructure
   - SCORE: compute metrics for every file (CC, Cognitive, Coupling, Churn×CC, Duplication, LoL, Type Safety Gap)
   - IDENTIFY: rank files, diagnose root causes, prescribe patterns

2. This regenerates all `.audit/` artifacts:
   - `.audit/rubric.yaml`
   - `.audit/complexity_ranking.md`
   - `.audit/metrics_raw.json`
   - `.audit/compute_ranking.mjs` (updated with fresh metric data)
   - `.audit/pattern_recommendations.yaml` (new patterns, all with `status: pending`)

3. Take baseline snapshot:
   ```bash
   bash .audit/benchmarks/snapshot_metrics.sh > .audit/benchmarks/snapshots/baseline.json
   ```

4. Commit audit artifacts:
   ```bash
   git add .audit/
   git commit -m "chore(audit): baseline metrics for $(date +%Y-%m-%d) complexity audit"
   ```

### If mode is `continue`:

1. Read `.audit/pattern_recommendations.yaml`
2. Filter to entries where `status: pending`
3. If no pending patterns remain, announce this and switch to `fresh` mode (go back to fresh flow above)
4. List the pending patterns for the user

5. Take baseline snapshot (current state is the starting point for this cycle):
   ```bash
   bash .audit/benchmarks/snapshot_metrics.sh > .audit/benchmarks/snapshots/baseline.json
   ```

6. Commit updated baseline:
   ```bash
   git add .audit/benchmarks/snapshots/baseline.json
   git commit -m "chore(audit): capture baseline snapshot for continue-mode audit"
   ```

---

## Phase 2 — REDUCE

For each pending pattern (up to `$ARGUMENTS.patterns` count), ordered by composite score descending:

### Per-pattern cycle:

1. **Announce** which pattern is being applied (number, target file, pattern type)

2. **Apply the refactoring:**
   - Read the target file(s) listed in the pattern entry
   - Apply the prescribed pattern (Extract Method, Guard Clauses, Handler Map, etc.)
   - Follow the description in `pattern_recommendations.yaml` precisely
   - Keep changes minimal — only modify what the pattern prescribes

3. **Validate:**
   ```bash
   pnpm -r build && pnpm -r type-check && pnpm -r test
   ```

4. **On success:**
   - Create an atomic commit:
     ```bash
     git add -A
     git commit -m "refactor(<scope>): <pattern name> — <target file basename>"
     ```
     Example: `refactor(agent): extract executeToolStep + evaluateIterationResult from runLoop — agent.ts`
   - Update the pattern's `status` field in `pattern_recommendations.yaml` to `applied`

5. **On failure:**
   - Revert all uncommitted changes: `git checkout -- .`
   - Update the pattern's `status` field to `skipped`
   - Log the failure reason
   - Continue to the next pattern

6. **Three consecutive failures = STOP the reduce phase.** Move directly to Phase 3.

### After all patterns:

Commit the updated `pattern_recommendations.yaml`:
```bash
git add .audit/pattern_recommendations.yaml
git commit -m "chore(audit): update pattern statuses after reduce phase"
```

---

## Phase 3 — VERIFY

1. **Run the benchmark suite:**
   ```bash
   bash .audit/benchmarks/run_benchmark.sh
   ```

2. **Read the verdict:**
   ```bash
   cat .audit/benchmarks/report.md
   ```

3. **If verdict is PASS:**
   - Rotate baseline:
     ```bash
     bash .audit/rotate-baseline.sh
     ```
   - The new baseline now reflects the post-audit state

4. **If verdict is FAIL:**
   - Do NOT rotate baseline
   - Document which gates failed in the PR body

5. **Update audit manifest** (`.audit/audit-manifest.json`):
   - Add a new entry to the `audits` array with:
     - `id`: today's date as YYYYMMDD
     - `date`: today's ISO date
     - `branch`: current branch name
     - `patterns_total`: total patterns attempted this cycle
     - `patterns_applied`: array of pattern numbers that were applied
     - `patterns_deferred`: array of pattern numbers still pending
     - `baseline_cc`: CC from `baseline.json`
     - `result_cc`: CC from `current.json`
     - `test_count`: test count from `current.json`
     - `verdict`: PASS or FAIL
   - If verdict is PASS, update `current_baseline` with new snapshot path and metrics

6. **Commit verification artifacts:**
   ```bash
   git add .audit/
   git commit -m "audit: benchmark proof — $(cat .audit/benchmarks/report.md | head -3 | tail -1 | tr -d '*')"
   ```

---

## Phase 4 — REFLECT

Capture lessons learned from this audit cycle so the next iteration can improve.

1. **Review what happened this cycle.** For each pattern attempted, assess:
   - Did the prescribed approach from `pattern_recommendations.yaml` work as described?
   - Was the estimated impact accurate? Over- or under-estimated?
   - Were there unexpected side effects, test changes, or dependencies?

2. **Build the reflections object** with four categories:

   - **`what_worked`**: Approaches that succeeded cleanly. Be specific about *why* — e.g., "extracting pure functions first made the handler map refactor trivial" rather than just "Pattern 3 worked."
   - **`what_failed`**: Patterns that were skipped or reverted, with the root cause. Not just "tests failed" but *which* tests and *why* — e.g., "handler map broke streaming tests because event order changed."
   - **`surprises`**: Non-obvious findings — things the scoring phase didn't predict. E.g., hidden coupling between files, metrics that moved in unexpected directions, patterns that were easier/harder than ranked.
   - **`next_time`**: Concrete, actionable instructions for the next audit cycle. These are the highest-value entries — they become direct guidance in the next Phase 0. E.g., "Pattern 5 (log-mappers) should define the shared interface type *before* touching any mapper file."

3. **Add reflections to this audit's entry** in `audit-manifest.json` under the `reflections` key.

4. **Commit:**
   ```bash
   git add .audit/audit-manifest.json
   git commit -m "chore(audit): capture reflections from $(date +%Y-%m-%d) audit cycle"
   ```

---

## Phase 5 — SHIP

1. **Push the branch:**
   ```bash
   git push -u origin $(git branch --show-current)
   ```

2. **Generate PR body** combining:
   - Summary of patterns applied (with before/after metrics)
   - Patterns skipped (with reasons)
   - Patterns still pending
   - Full benchmark report from `.audit/benchmarks/report.md`
   - Validation commands

3. **Create PR:**
   ```bash
   gh pr create \
     --title "refactor: complexity audit — N patterns applied, CC reduced X%" \
     --body-file .audit/pr_body.md \
     --base master \
     --label "refactor" \
     --label "complexity-audit"
   ```
   Replace N with count of applied patterns and X with the actual CC reduction percentage.

4. **Report the PR URL** to the user.

---

## Rules

1. **Measure before you change.** Always take a baseline snapshot before applying patterns.
2. **One pattern, one commit.** Each refactor gets its own atomic commit.
3. **Tests are sacred.** If test count decreases or pass rate drops, the pattern is rejected.
4. **Validate after every pattern.** Build + type-check + test after each change.
5. **Revert on failure.** Never leave the branch in a broken state.
6. **The PR is the deliverable.** The audit is incomplete until a PR exists.
7. **Proof over prose.** The PR body must contain actual benchmark numbers.
8. **Branch-isolated.** All work happens on `refactor/complexity-audit-[YYYYMMDD]`.
9. **Three strikes.** Three consecutive pattern failures = stop reducing, move to verify.
10. **Update state.** Always update `pattern_recommendations.yaml` statuses and `audit-manifest.json`.
11. **Learn from the past.** Always read prior reflections before starting. Always write reflections before shipping.

---

## Validation Commands

```bash
pnpm -r build
pnpm -r type-check
pnpm -r test
bash .audit/benchmarks/run_benchmark.sh
cat .audit/benchmarks/report.md
```

---

## Acceptance Criteria

- [ ] Branch `refactor/complexity-audit-[YYYYMMDD]` created
- [ ] Baseline snapshot captured before any changes
- [ ] Each pattern applied as an isolated atomic commit
- [ ] `pnpm -r build` passes after every pattern
- [ ] `pnpm -r type-check` passes after every pattern
- [ ] `pnpm -r test` passes after every pattern
- [ ] Benchmark report generated with verdict
- [ ] `audit-manifest.json` updated with this run's results
- [ ] `pattern_recommendations.yaml` statuses updated
- [ ] PR created with benchmark results in body
- [ ] Test count >= baseline, pass rate = 100%
- [ ] Reflections captured in `audit-manifest.json` with all four categories populated
