# Benchmark Report

**Verdict: PASS**

| Baseline             | Current              |
| -------------------- | -------------------- |
| b047d5b              | ef93cab              |
| 2026-03-24T05:31:07Z | 2026-03-24T05:39:06Z |

## Aggregate Gates

| Metric          | Baseline | Current | Delta               | % Change | Gate                          | Status |
| --------------- | -------- | ------- | ------------------- | -------- | ----------------------------- | ------ |
| Total CC        | 683      | 656     | -27                 | -4.0%    | decrease (max regression: 5%) | PASS   |
| Average CC      | 12       | 11.3    | -0.6999999999999993 | -5.8%    | decrease (max regression: 5%) | PASS   |
| Total Cognitive | 2217     | 2102    | -115                | -5.2%    | decrease (max regression: 5%) | PASS   |
| Duplication %   | 0        | 0       | +0                  | 0.0%     | decrease (max regression: 2%) | PASS   |
| Test Pass Rate  | 1        | 1       | +0                  | 0.0%     | increase (max regression: 0%) | PASS   |
| Test Count      | 440      | 440     | +0                  | 0.0%     | increase (max regression: 0%) | PASS   |

## Per-File Changes (Top Movers)

| File                                                   | Status  | CC Delta | Cognitive Delta | Composite Delta |
| ------------------------------------------------------ | ------- | -------- | --------------- | --------------- |
| packages/deep-factor-agent/src/providers/cli-shared.ts | NEW     | +32      | +85             | +29.7           |
| packages/deep-factor-agent/src/providers/claude-cli.ts | CHANGED | -29      | -97             | -14.5           |
| packages/deep-factor-agent/src/providers/codex-cli.ts  | CHANGED | -22      | -80             | -10.9           |
| packages/deep-factor-tui/src/events-to-messages.ts     | CHANGED | -4       | -13             | -1.9            |
| packages/deep-factor-agent/src/tool-display.ts         | CHANGED | -4       | -10             | -1.8            |

## Summary

- Files analyzed: baseline=57, current=58
- Tests: baseline=440, current=440
- Total CC: baseline=683, current=656
- Verdict: **PASS**
