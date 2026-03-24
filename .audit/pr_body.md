## Summary

- **Pattern 1: CLI shared utility extraction** — Extracted 6 duplicated utility functions (`createZeroUsage`, `normalizeUsage`, `extractTextFromUnknown`, `stripToolCallJsonBlock`, `toUsageMetadata`, `TOOL_CALL_FORMAT`) from `claude-cli.ts` and `codex-cli.ts` into new `cli-shared.ts`. Unified `normalizeUsage` handles all provider field name variants. CC impact: -29 (claude-cli) + -22 (codex-cli) + +32 (cli-shared) = **-19 CC net**.
- **Pattern 2: events-to-messages.ts handler map** — Replaced 6 simple switch cases (error, plan, summary, completion, approval, human_input_requested) with `SIMPLE_EVENT_BUILDERS` handler map. CC impact: **-4 CC**.
- **Pattern 3: tool-display.ts unified tool name map** — Replaced 4 `Set` constants + 4 `if`-block dispatch in `normalizeToolKind` with single `Map<string, ToolDisplayKind>` lookup. CC impact: **-4 CC**.

## Benchmark Report

**Verdict: PASS**

| Metric          | Baseline | Current | Delta | % Change  |
| --------------- | -------- | ------- | ----- | --------- |
| Total CC        | 683      | 656     | -27   | **-4.0%** |
| Average CC      | 12       | 11.3    | -0.7  | -5.8%     |
| Total Cognitive | 2217     | 2102    | -115  | -5.2%     |
| Test Count      | 440      | 440     | 0     | 0.0%      |
| Test Pass Rate  | 100%     | 100%    | 0     | 0.0%      |

### Per-File Changes

| File                          | CC Delta | Cognitive Delta |
| ----------------------------- | -------- | --------------- |
| providers/cli-shared.ts (NEW) | +32      | +85             |
| providers/claude-cli.ts       | -29      | -97             |
| providers/codex-cli.ts        | -22      | -80             |
| events-to-messages.ts         | -4       | -13             |
| tool-display.ts               | -4       | -10             |

## Test plan

- [x] `pnpm -r build` passes
- [x] `pnpm -r type-check` passes
- [x] `pnpm -r test` passes (440 tests, 100% pass rate)
- [x] Benchmark suite passes with CC reduction verified
- [x] Each pattern applied as isolated atomic commit
- [x] No test changes required

## Validation Commands

```bash
pnpm -r build
pnpm -r type-check
pnpm -r test
bash .audit/benchmarks/run_benchmark.sh
cat .audit/benchmarks/report.md
```

Generated with [Claude Code](https://claude.com/claude-code)
