# Ralph — Agent Instructions

## Overview

Ralph is an autonomous AI agent loop that runs AI coding tools (Amp or Claude Code) repeatedly until all PRD items are complete. Each iteration is a fresh instance with clean context.

## Commands

```bash
# Run Ralph loop with Claude Code
./ralph.sh --tool claude [max_iterations]

# Run Ralph loop with Amp (default)
./ralph.sh [max_iterations]
```

## Key Files

-   `ralph.sh` — Ralph loop shell script (supports `--tool amp` or `--tool claude`)
-   `prompt.md` — Amp agent instructions
-   `CLAUDE.md` — Claude Code agent instructions
-   `.ralph/prd.json` — User stories for autonomous execution
-   `prd.json.example` — Example PRD format reference
-   `archives/` — Folder old tasks are archived

## Patterns

-   Each Ralph iteration spawns a fresh AI instance with clean context
-   Memory persists via git history, `progress.txt`, and `prd.json`
-   Stories should be small enough to complete in one context window
-   Always update AGENTS.md with discovered patterns for future iterations
