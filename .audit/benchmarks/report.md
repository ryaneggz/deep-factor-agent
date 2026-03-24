# Benchmark Report

**Verdict: PASS**

| Baseline             | Current              |
| -------------------- | -------------------- |
| f0d8d80              | e4a5030              |
| 2026-03-24T05:08:01Z | 2026-03-24T05:15:21Z |

## Aggregate Gates

| Metric          | Baseline | Current | Delta               | % Change | Gate                          | Status |
| --------------- | -------- | ------- | ------------------- | -------- | ----------------------------- | ------ |
| Total CC        | 700      | 683     | -17                 | -2.4%    | decrease (max regression: 5%) | PASS   |
| Average CC      | 12.3     | 12      | -0.3000000000000007 | -2.4%    | decrease (max regression: 5%) | PASS   |
| Total Cognitive | 2264     | 2217    | -47                 | -2.1%    | decrease (max regression: 5%) | PASS   |
| Duplication %   | 0        | 0       | +0                  | 0.0%     | decrease (max regression: 2%) | PASS   |
| Test Pass Rate  | 1        | 1       | +0                  | 0.0%     | increase (max regression: 0%) | PASS   |
| Test Count      | 440      | 440     | +0                  | 0.0%     | increase (max regression: 0%) | PASS   |

## Per-File Changes (Top Movers)

| File                                       | Status  | CC Delta | Cognitive Delta | Composite Delta |
| ------------------------------------------ | ------- | -------- | --------------- | --------------- |
| packages/deep-factor-tui/src/transcript.ts | CHANGED | -17      | -47             | -5.8            |

## Summary

- Files analyzed: baseline=57, current=57
- Tests: baseline=440, current=440
- Total CC: baseline=700, current=683
- Verdict: **PASS**
