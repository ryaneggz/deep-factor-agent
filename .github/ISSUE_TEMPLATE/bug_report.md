---
name: Bug Report
about: Report a reproducible defect with enough detail for agent or maintainer diagnosis
title: "fix: "
labels: ["bug"]
assignees: ""
---

## User Impact

- As a ..., I expect ..., but instead ...
- As a ..., I expect ..., but instead ...
- As a ..., I expect ..., but instead ...

## Summary

Short technical summary of the defect.

Severity:

- [ ] Critical
- [ ] High
- [ ] Medium
- [ ] Low

## Affected Surface

Package:

- [ ] `deep-factor-agent`
- [ ] `deep-factor-tui`
- [ ] `workspace/docs/tooling`

Interface:

- [ ] `library API`
- [ ] `interactive TUI`
- [ ] `print mode`
- [ ] `resume/session`
- [ ] `provider integration`
- [ ] `bash tool`
- [ ] `examples/docs`
- [ ] `tests/CI`

Provider: `langchain` | `claude` | `codex` | `n/a`

Mode: `plan` | `approve` | `yolo` | `n/a`

Sandbox: `workspace` | `local` | `docker` | `n/a`

If this involves `deep-factor-tui` and the bash tool, state whether the issue is about CLI flag semantics, bash-tool creation, or actual command execution.

## Steps to Reproduce

List the exact steps in order. Reproduction steps are required and should be minimal enough for another person to follow without guessing.

Reproduction status:

- [ ] Reproduced in the current workspace
- [ ] Reproduced from a clean install/build flow
- [ ] Not yet reproduced, but evidence is attached

1. ...
2. ...
3. ...

Exact command(s) used:

```bash
# Paste the exact command(s) required to reproduce the bug.
```

Prompt or input, if relevant:

```text
# Paste the exact prompt, stdin, or interactive input that triggers the issue.
```

## Expected Behavior

Describe the expected result in concrete terms.

## Actual Behavior

Describe the actual result. Include logs, stack trace, transcript excerpt, or note that a screenshot is attached.

```text
# Paste the smallest relevant excerpt here.
```

## Environment

| Field              | Value |
| ------------------ | ----- |
| Branch / commit    |       |
| OS                 |       |
| Shell              |       |
| Node version       |       |
| pnpm version       |       |
| Package under test |       |
| Provider           |       |
| Model              |       |
| Mode               |       |
| Sandbox            |       |
| Auth / setup notes |       |

## Suspected Scope

Use `Unknown` when you do not know.

| File / path | Function / component / type | Reason it may be involved |
| ----------- | --------------------------- | ------------------------- |
| Unknown     | Unknown                     | Unknown                   |

## Validation Performed

For each item, keep one status (`Pass`, `Fail`, or `Not run`) and paste only the relevant output.

- [ ] `pnpm -r build` Pass
- [ ] `pnpm -r build` Fail
- [ ] `pnpm -r build` Not run
- [ ] `pnpm -r test` Pass
- [ ] `pnpm -r test` Fail
- [ ] `pnpm -r test` Not run
- [ ] `pnpm -C packages/deep-factor-agent build` Pass
- [ ] `pnpm -C packages/deep-factor-agent build` Fail
- [ ] `pnpm -C packages/deep-factor-agent build` Not run
- [ ] `pnpm -C packages/deep-factor-agent test` Pass
- [ ] `pnpm -C packages/deep-factor-agent test` Fail
- [ ] `pnpm -C packages/deep-factor-agent test` Not run
- [ ] `pnpm -C packages/deep-factor-agent type-check` Pass
- [ ] `pnpm -C packages/deep-factor-agent type-check` Fail
- [ ] `pnpm -C packages/deep-factor-agent type-check` Not run
- [ ] `pnpm -C packages/deep-factor-tui build` Pass
- [ ] `pnpm -C packages/deep-factor-tui build` Fail
- [ ] `pnpm -C packages/deep-factor-tui build` Not run
- [ ] `pnpm -C packages/deep-factor-tui test` Pass
- [ ] `pnpm -C packages/deep-factor-tui test` Fail
- [ ] `pnpm -C packages/deep-factor-tui test` Not run
- [ ] `pnpm -C packages/deep-factor-tui type-check` Pass
- [ ] `pnpm -C packages/deep-factor-tui type-check` Fail
- [ ] `pnpm -C packages/deep-factor-tui type-check` Not run
- [ ] Manual CLI/TUI repro command Pass
- [ ] Manual CLI/TUI repro command Fail
- [ ] Manual CLI/TUI repro command Not run

Relevant output:

```text
# Paste only the command output needed to confirm the validation result.
```

## Manual Human Review Steps

List the manual review steps a human should perform before closing the fix, especially for CLI, TUI, provider, docs, or behavior changes.

1. ...
2. ...
3. ...

Expected human-observable result:

```text
# Describe what the reviewer should see, not just what command should run.
```

## Constraints and Non-Goals

State what must not change while fixing this bug.

## Acceptance Criteria

- [ ] Bug is reproducible from the issue before the fix.
- [ ] Root cause is identified or narrowed to a specific subsystem.
- [ ] A regression test is added or an existing test is extended in the correct package.
- [ ] `pnpm -r build` passes.
- [ ] `pnpm -r test` passes.
- [ ] If provider-specific, unaffected providers are explicitly considered.
- [ ] If TUI/CLI-facing, docs or manual-test instructions are updated when behavior changes.
- [ ] Manual human review steps are documented and completed when the fix changes observable behavior.
- [ ] Additional bug-specific criteria: ...

## Design Principles

- Fix the root cause, not only the visible symptom.
- Prefer the smallest change that matches existing package boundaries and patterns.
- Preserve provider abstraction boundaries and mode semantics unless the issue explicitly changes them.
- Add verification in the package closest to the defect.
