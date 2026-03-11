# Create SMOKE_TEST_PLAN.md

## Context

The unified log format (Phases 1-4) has been implemented across all 3 providers (LangChain, Claude CLI, Codex CLI). Previous validation was done ad-hoc via inline commands in the plan file. The project needs a standalone `SMOKE_TEST_PLAN.md` document that formalizes these smoke tests into a repeatable, structured test matrix — covering all providers, complexity levels, and validation criteria.

This document serves as the canonical reference for validating unified log output after any changes to providers, mappers, or the agent loop.

## Approach

Create a single file `SMOKE_TEST_PLAN.md` in the project root that documents:

1. **Test matrix** — 9 scenarios (3 providers x 3 complexity tiers)
2. **Exact CLI commands** — copy-paste ready, outputting to `logs/` directory
3. **Per-scenario validation criteria** — what to check in the JSONL output
4. **Automated validation script** — a single `node` script that validates all smoke test outputs
5. **Known limitations** — gaps deferred to Phase 5+

## Source Material

All scenarios are derived from actual archived smoke test runs in `logs/archive/`:

| Scenario | Provider | Log File | Lines | Description |
|----------|----------|----------|-------|-------------|
| Simple | langchain | `smoke-simple.jsonl` | 7 | Basic math, no tools |
| Simple | claude | `smoke-claude.jsonl` | 8 | Basic math, no tools |
| Simple | codex | `smoke-codex.jsonl` | 7 | Basic math, no tools |
| Tools | langchain | `smoke-parallel.jsonl` | 13 | Parallel file reads |
| Tools | claude | `smoke-claude-tools.jsonl` | 13 | Bash tool use |
| Tools | codex | `smoke-codex-tools.jsonl` | 12 | Multiple bash commands |
| Complex | langchain | `smoke-file-edit.jsonl` | 13 | File create/read/delete lifecycle |
| Complex | claude | `smoke-claude-complex.jsonl` | 26 | Multi-tool file operations |
| Complex | codex | `smoke-codex-complex.jsonl` | 17 | Multi-tool file operations |

## Validation Criteria (all scenarios)

From unified log schema (`packages/deep-factor-agent/src/unified-log.ts`):

- **Structural**: Every line is valid JSON, has `type`, `sessionId`, `timestamp`, `sequence`
- **Monotonic sequences**: `sequence` values strictly increase across all lines
- **Bookend events**: First line is `init`, last line is `result`
- **Session consistency**: All lines share the same `sessionId`
- **No leaked tool JSON**: No `message(assistant)` entries contain raw ````json { "tool_calls" ... }````
- **No consecutive duplicate status lines**: Adjacent status entries differ in at least one key field
- **Provider-specific**: `init.provider` matches the `--provider` flag used

Tool-use scenarios additionally check:
- `tool_call` and `tool_result` entries exist with matching `toolCallId`
- `parallelGroup` present on parallel tool calls/results (LangChain provider)
- `display` metadata present with correct `kind` values

## File to Create

| # | File | Description |
|---|------|-------------|
| 1 | `SMOKE_TEST_PLAN.md` (project root) | Smoke test plan document |

## Document Structure

```
# Smoke Test Plan — Unified Log Format

## Prerequisites
## Test Matrix
## Tier 1: Simple (no tools)
  ### S1: LangChain Simple
  ### S2: Claude Simple
  ### S3: Codex Simple
## Tier 2: Tool Use
  ### S4: LangChain Parallel File Reads
  ### S5: Claude Bash Tool
  ### S6: Codex Multi-Command
## Tier 3: Complex Multi-Step
  ### S7: LangChain File Lifecycle
  ### S8: Claude Complex File Operations
  ### S9: Codex Complex File Operations
## Automated Validation Script
## Known Limitations
```

## Verification

After creating the file:
1. Confirm the file exists at project root and renders correctly
2. Run the automated validation script against `logs/archive/smoke-*.jsonl` to confirm all archived logs pass
