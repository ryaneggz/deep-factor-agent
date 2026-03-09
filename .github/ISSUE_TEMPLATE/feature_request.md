---
name: Feature Request
about: Propose a feature with enough detail for agent or maintainer implementation
title: "feat: "
labels: ["feature"]
assignees: ""
---

## Metadata

> **IMPORTANT**: The very first step should _ALWAYS_ be validating this metadata section to maintain a **CLEAN** development workflow.

```yml
pull_request_title: "FROM feat/[issue#]-[shortdesc] TO master"
branch: "feat/[issue#]-[shortdesc]"
worktree_path: "$WORKSPACE/.worktrees/feat-[issue#]"
```

---

## User Stories

- As a ..., I want ..., so that ...
- As a ..., I want ..., so that ...
- As a ..., I want ..., so that ...

## Problem / Opportunity

Explain why this should exist now.

## Proposed Outcome

Describe the desired behavior at both the user level and the system level.

## Scope

Package:

- [ ] `deep-factor-agent`
- [ ] `deep-factor-tui`
- [ ] `workspace/docs/tooling`

Impact:

- [ ] `public TS API`
- [ ] `CLI flags`
- [ ] `TUI behavior`
- [ ] `provider adapter`
- [ ] `middleware/tooling`
- [ ] `examples`
- [ ] `tests`
- [ ] `docs`

Provider applicability: `langchain` | `claude` | `codex` | `all` | `n/a`

Mode applicability: `plan` | `approve` | `yolo` | `all` | `n/a`

Sandbox applicability: `workspace` | `local` | `docker` | `all` | `n/a`

## Public Interface Changes

| Surface                   | Current state | Proposed change | Compatibility impact |
| ------------------------- | ------------- | --------------- | -------------------- |
| Exports / types           |               |                 |                      |
| CLI flags                 |               |                 |                      |
| Transcript / event shapes |               |                 |                      |
| Defaults                  |               |                 |                      |
| Docs / examples           |               |                 |                      |

## Integration Points

<!-- Seed examples: src/agent.ts, src/providers/*, src/types.ts, src/cli.tsx, src/hooks/useAgent.ts, src/components/*, src/tools/bash.ts -->

| File / module area | Expected change | Rationale |
| ------------------ | --------------- | --------- |
|                    |                 |           |

## Behavior Details

Success path:

- ...

Failure modes:

- ...

Edge cases:

- ...

Out-of-scope items:

- ...

## Validation Plan

Exact commands to run:

```bash
pnpm -r build
pnpm -r test
pnpm -C packages/deep-factor-agent build
pnpm -C packages/deep-factor-agent test
pnpm -C packages/deep-factor-agent type-check
pnpm -C packages/deep-factor-tui build
pnpm -C packages/deep-factor-tui test
pnpm -C packages/deep-factor-tui type-check
```

Expected tests to add or update:

- ...

Manual verification commands, if CLI/TUI/provider-facing:

```bash
# Paste exact commands for manual verification here.
```

## Manual Human Review Steps

List the manual review steps a human should perform to confirm the feature in the real interface or workflow.

1. ...
2. ...
3. ...

Expected human-observable result:

```text
# Describe what the reviewer should see or confirm.
```

## Acceptance Criteria

- [ ] Requested behavior is described concretely enough to implement without guessing.
- [ ] Public API/CLI changes are explicitly listed.
- [ ] Tests are identified for the affected package(s).
- [ ] `pnpm -r build` passes.
- [ ] `pnpm -r test` passes.
- [ ] Examples/docs/manual-test instructions are updated when user-facing behavior changes.
- [ ] Manual human review steps are documented for user-facing behavior.
- [ ] Additional feature-specific criteria: ...

## Design Principles

- Keep the feature aligned with existing package boundaries.
- Prefer extending current abstractions over introducing parallel ones.
- Preserve backwards compatibility unless the issue explicitly authorizes a breaking change.
- Keep agent/provider/mode behavior explicit rather than implicit.
