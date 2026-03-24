# Complexity Ranking — 2026-03-23 Fresh Audit

## Project Profile

```
PROJECT PROFILE
===============
Project:         deep-factor-agent monorepo
Languages:       TypeScript (100%)
Framework:       LangChain (agent), Ink/React (TUI)
Package Manager: pnpm (workspaces)
Build System:    tsc
Test Runner:     vitest (pnpm -r test)
Type System:     typed (TypeScript strict)
Paradigm:        mixed (OOP agent + functional React)
Git History:     6+ months
Source Files:    57
Test Files:      32
Total LOC:       ~10,200 (logic lines)
Total CC:        700
Total Tests:     440 (351 agent + 89 TUI)
```

## Ranking (top 20 by composite score)

```
RANK | FILE / MODULE                                  | COMPOSITE |  CC  | COG  | COUPLING | CHURN×CC | LOC
-----+--------------------------------------------------+-----------+------+------+----------+----------+------
  1  | agent/agent.ts                                   |    86.6   |  111 |  481 |    0.74  |    2109  | 1421
  2  | agent/providers/claude-cli.ts                    |    47.9   |   62 |  207 |    0.73  |     558  |  678
  3  | agent/providers/claude-agent-sdk.ts              |    42.5   |   51 |  187 |    0.83  |      51  |  359
  4  | agent/providers/codex-cli.ts                     |    34.4   |   29 |  106 |    0.89  |     145  |  406
  5  | tui/transcript.ts                                |    32.1   |   40 |   93 |    0.67  |     200  |  357
  6  | tui/components/PendingInputPanel.tsx             |    31.0   |   27 |   90 |    0.83  |      54  |  263
  7  | agent/tool-display.ts                            |    29.4   |   44 |  103 |    0.50  |     132  |  329
  8  | tui/hooks/useAgent.ts                            |    29.1   |   31 |   93 |    0.50  |     651  |  460
  9  | agent/log-mappers/replay.ts                      |    28.2   |   31 |   83 |    0.67  |      62  |  283
 10  | agent/providers/messages-to-xml.ts               |    28.2   |   22 |   73 |    0.80  |      66  |  132
 11  | agent/log-mappers/langchain-mapper.ts            |    28.0   |   21 |   77 |    0.80  |      42  |  233
 12  | tui/events-to-messages.ts                        |    27.2   |   27 |   90 |    0.67  |      27  |  208
 13  | agent/log-mappers/claude-mapper.ts               |    27.0   |   21 |   84 |    0.75  |      21  |  167
 14  | tui/hooks/useTextInput.ts                        |    25.6   |   21 |   56 |    0.71  |     147  |  160
 15  | tui/session-logger.ts                            |    25.3   |   17 |   51 |    0.75  |     170  |  222
 16  | tui/cli.tsx                                      |    23.5   |   18 |   48 |    0.64  |     252  |  232
 17  | agent/context-manager.ts                         |    23.4   |   12 |   36 |    0.80  |      48  |  109
 18  | tui/components/TranscriptSegment.tsx             |    23.0   |   14 |   37 |    0.73  |     126  |  189
 19  | agent/log-mappers/codex-mapper.ts                |    22.7   |   13 |   43 |    0.75  |      13  |  123
 20  | tui/print.ts                                     |    22.5   |   12 |   32 |    0.75  |     108  |  165
```

## Key Observations

1. **agent.ts dominates** — CC=111 (16% of total 700), cognitive=481, highest churn×CC=2109. The runLoop method alone is ~600 lines with 10 levels of nesting.
2. **Provider files cluster in top 4** — claude-cli.ts, claude-agent-sdk.ts, codex-cli.ts share similar stream-parsing patterns.
3. **TUI complexity is distributed** — No single TUI file exceeds composite 32, but 6 files rank in top 15.
4. **Type safety is excellent** — Only 5 `any` usages across 57 files.
5. **Duplication is near zero** — Prior audit's 2.6% in useAgent.ts was resolved.
6. **Total CC increased from 636 to 700** since last audit due to new feature code (events-to-messages.ts, PendingInputPanel.tsx, expanded codex-cli.ts).
