# SPEC-08: Makefile & Documentation Updates

## CONTEXT

### Problem Statement

The Makefile and CLAUDE.md currently only reference `packages/deep-factor-agent`. With the new CLI package, both need workspace-wide targets and CLI-specific documentation.

### RELEVANT FILES
- `/Makefile` — current targets all use `pnpm -C packages/deep-factor-agent`
- `/CLAUDE.md` → `/AGENTS.md` (symlink) — current build/test docs

---

## OVERVIEW

Add CLI-specific and workspace-wide targets to the Makefile. Update CLAUDE.md with CLI build/test commands and codebase patterns.

---

## USER STORIES

### US-01: Makefile Targets

**As a** developer
**I want** make targets for the CLI package and the whole workspace
**So that** I can build/test individual packages or everything at once

#### New Targets

```makefile
# CLI package targets
install-cli:     ## Install CLI deps
	pnpm -C packages/deep-factor-cli install

build-cli:       ## Build CLI (tsc + shebang)
	pnpm -C packages/deep-factor-cli build

dev-cli:         ## Dev CLI (tsc --watch)
	pnpm -C packages/deep-factor-cli dev

test-cli:        ## Test CLI (vitest run)
	pnpm -C packages/deep-factor-cli test

type-check-cli:  ## Type-check CLI (tsc --noEmit)
	pnpm -C packages/deep-factor-cli type-check

# Workspace-wide targets
install-all:     ## Install all packages
	pnpm install

build-all:       ## Build all packages
	pnpm -r build

test-all:        ## Test all packages
	pnpm -r test

check-all:       ## Type-check + test all packages
	pnpm -r type-check && pnpm -r test
```

#### Acceptance Criteria
- [ ] All CLI targets work: `make install-cli build-cli test-cli type-check-cli dev-cli`
- [ ] All workspace targets work: `make install-all build-all test-all check-all`
- [ ] Existing agent targets unchanged
- [ ] `.PHONY` updated with new targets
- [ ] Help comments on all targets

---

### US-02: CLAUDE.md / AGENTS.md Updates

**As a** developer or agent
**I want** documentation for CLI package commands and patterns
**So that** I know how to build, test, and navigate the CLI code

#### Additions

**Build & Run section — add:**
```markdown
## CLI Package (deep-factor-cli)

- Install deps: `pnpm -C packages/deep-factor-cli install`
- Build: `pnpm -C packages/deep-factor-cli build`
- Dev mode: `pnpm -C packages/deep-factor-cli dev`
- Run: `node packages/deep-factor-cli/dist/cli.js "your prompt"`
- Run (interactive): `node packages/deep-factor-cli/dist/cli.js --interactive`

## Workspace

- Install all: `pnpm install` (from root)
- Build all: `pnpm -r build`
- Test all: `pnpm -r test`
```

**Codebase Patterns section — add:**
```markdown
### CLI Codebase Patterns

- Entry point: `packages/deep-factor-cli/src/cli.tsx` (meow + ink render)
- App shell: `packages/deep-factor-cli/src/app.tsx` (root component)
- Agent hook: `packages/deep-factor-cli/src/hooks/useAgent.ts` (React state bridge)
- Components: `packages/deep-factor-cli/src/components/` (Chat, StatusBar, Spinner, ToolCall, HumanInput, PromptInput)
- Bash tool: `packages/deep-factor-cli/src/tools/bash.ts` (optional, --bash flag)
- Tests: `packages/deep-factor-cli/__tests__/` (ink-testing-library)
- CLI types: `packages/deep-factor-cli/src/types.ts` (ChatMessage, AgentStatus)
```

#### Acceptance Criteria
- [ ] CLI build/run/test commands documented
- [ ] Workspace commands documented
- [ ] CLI codebase patterns documented
- [ ] Interactive mode documented
- [ ] `--bash` flag documented

---

## DEPENDENCY ORDER

```
All other SPECs complete → SPEC-08 (docs update)
```
