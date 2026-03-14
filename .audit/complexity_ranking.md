# Complexity Ranking — deep-factor-agent + deep-factor-tui

**Date:** 2026-03-14
**Git SHA:** 7391d5cba4d90edd9398a0ae7c9d1a56c69cca1a
**Branch:** refactor/complexity-audit-run-20260314

## Methodology

Metrics collected via manual AST analysis of all 56 TypeScript/TSX source files across both packages, supplemented by automated tooling:
- **Cyclomatic Complexity (CC):** Decision point count (if/else/switch/for/while) per file
- **Cognitive Complexity (COG):** CC × (1 + max_nesting_depth / 3) — penalizes deeply nested control flow
- **Coupling Instability:** Ce / (Ca + Ce) where Ce = import count, Ca = estimated from churn/usage
- **Churn × CC:** git log (6 months) change count × CC score — identifies hot spots
- **Duplication:** jscpd with min-lines=5, min-tokens=50
- **Type Safety Gap:** `any` type usage audit

### Composite Score Formula

```
Composite = (CC_normalized × 0.30)
          + (Cognitive_normalized × 0.25)
          + (Coupling_normalized × 0.20)
          + (Churn×CC_normalized × 0.15)
          + (Duplication_normalized × 0.10)
```

All metrics normalized to 0–100 across scanned files before weighting.

## Baseline Test Results

| Package | Test Files | Tests | Pass Rate |
|---------|-----------|-------|-----------|
| deep-factor-agent | 25 | 351 | 100% |
| deep-factor-tui | 7 | 89 | 100% |
| **Total** | **32** | **440** | **100%** |

## Aggregate Metrics

| Metric | Value |
|--------|-------|
| Files analyzed | 56 |
| Total CC (decision points) | 694 |
| Average CC | 12.4 |
| Max CC | 105 (agent.ts) |
| Total Cognitive | 1,725 |
| Total LOC (logic lines) | 9,209 |
| Duplication | 0.05% (1 clone, 13 lines in useAgent.ts) |
| `any` type usage | 4 instances (agent.ts ×1, claude-cli.ts ×1, codex-cli.ts ×1, context-manager.ts ×1) |

## Ranked Complexity Table

Files with composite score > 15 (meaningful complexity):

```
RANK | FILE / MODULE                              | COMPOSITE |  CC  | COG  | COUPLING | CHURN×CC | DUP%  | LOC  | PRIMARY ISSUE
-----+--------------------------------------------+-----------+------+------+----------+----------+-------+------+-----------------------------------------------
  1  | agent/agent.ts                             |    86.6   |  105 |  455 |   0.74   |   1890   |   0%  | 1492 | God-class: 10-level nesting, 120 functions,
     |                                            |           |      |      |          |          |       |      | tool exec + middleware + context + modes
  2  | agent/providers/claude-cli.ts              |    47.2   |   57 |  190 |   0.73   |    513   |   0%  |  708 | Stream parsing mega-function, 15+ event
     |                                            |           |      |      |          |          |       |      | type dispatch, 7-level nesting
  3  | tui/hooks/useAgent.ts                      |    43.7   |   31 |   72 |   0.71   |    620   |  2.6% |  468 | State orchestration, 15 imports, high
     |                                            |           |      |      |          |          |       |      | churn, duplicated handler blocks
  4  | agent/providers/claude-agent-sdk.ts        |    38.3   |   52 |   87 |   0.83   |      0   |   0%  |  378 | 52 decision points for SDK msg conversion,
     |                                            |           |      |      |          |          |       |      | large switch for content block types
  5  | agent/providers/codex-cli.ts               |    35.9   |   34 |  113 |   0.89   |      0   |   0%  |  431 | JSONL event handling, nested Promise/
     |                                            |           |      |      |          |          |       |      | callback chains, 7-level nesting
  6  | agent/tool-display.ts                      |    29.0   |   43 |  100 |   0.50   |      0   |   0%  |  330 | 9 regex patterns, scattered type-detection
     |                                            |           |      |      |          |          |       |      | conditionals for formatting
  7  | agent/log-mappers/replay.ts                |    28.1   |   33 |   66 |   0.67   |      0   |   0%  |  296 | 16-type switch statement for log-to-thread
     |                                            |           |      |      |          |          |       |      | reconstruction
  8  | tui/transcript.ts                          |    27.5   |   18 |   42 |   0.86   |     90   |   0%  |  413 | Complex grouping/aggregation logic for
     |                                            |           |      |      |          |          |       |      | file read batching and formatting
  9  | agent/log-mappers/langchain-mapper.ts      |    27.1   |   23 |   46 |   0.80   |      0   |   0%  |  252 | Multi-case event mapping switch
 10  | agent/providers/messages-to-xml.ts         |    27.1   |   23 |   46 |   0.80   |      0   |   0%  |  162 | Message serialization with 5 type handlers
 11  | tui/components/PendingInputPanel.tsx        |    25.3   |   16 |   37 |   0.83   |      0   |   0%  |  241 | Mixed state + keyboard input + conditional
     |                                            |           |      |      |          |          |       |      | rendering for 3 panel types
 12  | tui/tools/file-utils.ts                    |    24.6   |   11 |   26 |   0.89   |      0   |   0%  |  191 | File manipulation + diff preview logic
 13  | agent/log-mappers/claude-mapper.ts         |    24.4   |   19 |   38 |   0.75   |      0   |   0%  |  180 | Nested type guards in content block loop
 14  | tui/session-logger.ts                      |    23.0   |   13 |   26 |   0.75   |    130   |   0%  |  288 | Session file I/O with legacy format
     |                                            |           |      |      |          |          |       |      | conversion, moderate churn
 15  | agent/context-manager.ts                   |    22.9   |   11 |   33 |   0.80   |      0   |   0%  |  123 | Summarization loop with try-catch,
     |                                            |           |      |      |          |          |       |      | 6-level nesting
 16  | agent/middleware.ts                        |    22.7   |   11 |   29 |   0.80   |      0   |   0%  |  117 | Tool conflict detection, closured state
 17  | tui/hooks/useTextInput.ts                  |    22.7   |   13 |   26 |   0.75   |     91   |   0%  |  199 | Key handling with history management
 18  | tui/print.ts                               |    21.9   |   11 |   29 |   0.73   |     99   |   0%  |  196 | Async agent exec with conditional output
 19  | agent/log-mappers/codex-mapper.ts          |    21.6   |   12 |   24 |   0.75   |      0   |   0%  |  136 | Event type dispatch switch
 20  | tui/cli.tsx                                |    20.7   |   15 |   40 |   0.56   |    210   |   0%  |  264 | Print/TUI mode branching, session resume
```

## Files Below Threshold (composite ≤ 15)

36 files with minimal complexity — pure type definitions, barrel exports, simple wrappers, and thin React components. No refactoring recommended.

## Key Findings

1. **agent.ts is a clear outlier** — composite score 86.6 is nearly 2× the next file (47.2). It has the highest CC (105), deepest nesting (10 levels), most functions (120), and highest churn×CC (1890). This is the primary refactoring target.

2. **CLI providers share structural similarity** — claude-cli.ts and codex-cli.ts both have the same pattern: stream parsing with large event dispatch switches and deeply nested Promise chains.

3. **useAgent.ts is the TUI's complexity hotspot** — highest churn (20 commits), most imports (15), and the only file with code duplication.

4. **Type safety is excellent** — only 4 `any` usages across 9,200 LOC.

5. **Duplication is negligible** — 0.05% overall, one 13-line clone in useAgent.ts.

6. **Log mappers follow a repetitive pattern** — replay.ts, langchain-mapper.ts, claude-mapper.ts, and codex-mapper.ts all use large switch statements for event type dispatch. This is a candidate for Template Method or Strategy pattern.
