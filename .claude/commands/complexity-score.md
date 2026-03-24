# Complexity Score

> For the full audit cycle (branch, reduce, benchmark, PR), use `/complexity-audit` instead.

Study the current project, build a complexity scoring rubric, rank all files, identify anti-patterns, and remove complexity without breaking functionality.

## Arguments

- `scope`: Which package(s) to analyze (default: all). Options: `all`, `agent`, `tui`
- `phase`: Stop after a specific phase (default: all). Options: `study`, `score`, `identify`, `reduce`, `verify`

**Usage:** `/complexity-score` or `/complexity-score scope="agent" phase="identify"`

---

## Workflow

1. Read `prompts/complexity-scorer.md` from the project root
2. Execute the full protocol: `STUDY -> SCORE -> IDENTIFY -> REDUCE -> VERIFY`
3. If `$ARGUMENTS.phase` is specified, stop after that phase
4. If `$ARGUMENTS.scope` is specified, limit analysis to that package:
   - `agent` → `packages/deep-factor-agent/src/`
   - `tui` → `packages/deep-factor-tui/src/`
   - `all` → both packages
5. Write all artifacts to `.audit/`

## Validation Commands

```bash
pnpm -r build
pnpm -r type-check
pnpm -r test
```

## Output

- `.audit/rubric.yaml` — Generated scoring rubric with justified weights
- `.audit/complexity_ranking.md` — Ranked table of all files by composite score
- `.audit/metrics_raw.json` — Machine-readable raw metrics
- `.audit/pattern_recommendations.yaml` — Anti-patterns found with prescribed fixes
- `.audit/verification_report.md` — Before/after comparison (if reduce phase ran)
