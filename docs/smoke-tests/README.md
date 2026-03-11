# Smoke Tests — Unified Log Format

Validation suite for the unified JSONL log output across all providers (LangChain, Claude CLI, Codex CLI).

## Contents

| File                                                 | Description                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| [SMOKE_TEST_PLAN.md](./SMOKE_TEST_PLAN.md)           | Full test plan: 9 scenarios, CLI commands, validation criteria, known failures |
| [validate-smoke-logs.mjs](./validate-smoke-logs.mjs) | Automated validation script for JSONL log files                                |

## Quick Start

```bash
# Build
pnpm -r build

# Run all 9 smoke tests (outputs to logs/smoke/)
mkdir -p logs/smoke
deepfactor --provider langchain -p -o stream-json "What is 2+2?" > logs/smoke/smoke-simple.jsonl
CLAUDECODE= deepfactor --provider claude -p -o stream-json "What is 2+2?" > logs/smoke/smoke-claude.jsonl
deepfactor --provider codex -p -o stream-json "What is 2+2?" > logs/smoke/smoke-codex.jsonl
# ... see SMOKE_TEST_PLAN.md for all 9 scenarios

# Validate
node docs/smoke-tests/validate-smoke-logs.mjs logs/smoke/smoke-*.jsonl
```

## Log Locations

| Directory       | Purpose                                                      |
| --------------- | ------------------------------------------------------------ |
| `logs/smoke/`   | Fresh smoke test outputs (gitignored, regenerated on demand) |
| `logs/archive/` | Archived baseline logs from initial implementation           |
