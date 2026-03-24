# Complexity Ranking — 2026-03-23 Fresh Audit #3

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
Total LOC:       ~8,800 (logic lines)
Total CC:        683
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
  5  | tui/components/PendingInputPanel.tsx             |    31.0   |   27 |   90 |    0.83  |      54  |  263
  6  | agent/tool-display.ts                            |    29.4   |   44 |  103 |    0.50  |     132  |  329
  7  | tui/hooks/useAgent.ts                            |    29.1   |   31 |   93 |    0.50  |     651  |  460
  8  | agent/log-mappers/replay.ts                      |    28.2   |   31 |   83 |    0.67  |      62  |  283
  9  | agent/providers/messages-to-xml.ts               |    28.2   |   22 |   73 |    0.80  |      66  |  132
 10  | agent/log-mappers/langchain-mapper.ts            |    28.0   |   21 |   77 |    0.80  |      42  |  233
 11  | tui/events-to-messages.ts                        |    27.2   |   27 |   90 |    0.67  |      27  |  208
 12  | agent/log-mappers/claude-mapper.ts               |    27.0   |   21 |   84 |    0.75  |      21  |  167
 13  | tui/transcript.ts                                |    26.3   |   23 |   46 |    0.75  |     115  |  308
 14  | tui/hooks/useTextInput.ts                        |    25.6   |   21 |   56 |    0.71  |     147  |  160
 15  | tui/session-logger.ts                            |    25.3   |   17 |   51 |    0.75  |     170  |  222
 16  | tui/cli.tsx                                      |    23.5   |   18 |   48 |    0.64  |     252  |  232
 17  | agent/context-manager.ts                         |    23.4   |   12 |   36 |    0.80  |      48  |  109
 18  | tui/components/TranscriptSegment.tsx             |    23.0   |   14 |   37 |    0.73  |     126  |  189
 19  | agent/log-mappers/codex-mapper.ts                |    22.7   |   13 |   43 |    0.75  |      13  |  123
 20  | tui/print.ts                                     |    22.5   |   12 |   32 |    0.75  |     108  |  165
```

## Key Observations

1. **agent.ts still dominates** — CC=111 (16% of total 683), cognitive=481. Extensively refactored in prior audits (Extract Method patterns). Further extraction has diminishing returns on aggregate CC.
2. **CLI providers share duplicated utilities** — claude-cli.ts (CC=62) and codex-cli.ts (CC=29) share 6 utility functions: createZeroUsage, normalizeUsage, extractTextFromUnknown, stripToolCallJsonBlock, toUsageMetadata, and TOOL_CALL_FORMAT. Combined duplication contributes ~18 redundant CC.
3. **events-to-messages.ts has switch-case dispatch** — 10 cases in eventsToChatMessages, 6 of which are simple push-and-continue patterns suitable for handler map extraction.
4. **tool-display.ts has 4 Set-based if-chains** — normalizeToolKind uses 4 sequential Set.has() checks that could be a single Map lookup.
5. **Prior audit insight: DRY and handler maps reduce aggregate CC; Extract Method does not.** This audit targets only patterns that genuinely remove branches.
