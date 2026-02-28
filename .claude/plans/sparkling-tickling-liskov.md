# Plan: Generate specs for Issue #2 — Example 12: Interactive HITL with Multiple Choice

## Context

GitHub Issue [#2](https://github.com/ryaneggz/deep-factor-agent/issues/2) requests a new example (`examples/12-hitl-multiple-choice.ts`) that combines the interactive multi-turn streaming chat + bash tool from Example 11 with the `requestHumanInput` tool's `multiple_choice` format. The `.huntley/specs/` directory was empty — specs and an implementation plan have been drafted.

## Files Created

| File | Purpose |
|------|---------|
| `.huntley/specs/SPEC-01-hitl-multiple-choice-example.md` | Full spec for Example 12 — context, implementation details with code, design decisions, acceptance criteria |
| `.huntley/IMPLEMENTATION_PLAN.md` | Build order and verification steps |

## Spec Summary (SPEC-01)

Fork Example 11, add these changes:

1. **Add `requestHumanInput` to tools** alongside `bashTool`
2. **New `collectHumanInput()` helper** — parses tool result JSON, displays numbered choices, collects via `rl.question()`, resolves numbered selection or free-text fallback
3. **HITL branch in `runToolLoop()`** — detects `requestHumanInput` calls, records `human_input_requested`/`human_input_received` events, pushes `ToolMessage` with response
4. **Updated system prompt** — instructs model to use `multiple_choice` for preferences, `free_text` for open-ended
5. **Pass `rl` to `runToolLoop()`** — enables mid-turn prompting
6. **Update `examples/README.md`** — add Example 12 entry

## Implementation Deliverables

| File | Change |
|------|--------|
| `packages/deep-factor-agent/examples/12-hitl-multiple-choice.ts` | **New** — the example |
| `packages/deep-factor-agent/examples/README.md` | Add Example 12 row |

## Verification

```bash
pnpm -C packages/deep-factor-agent build
cd packages/deep-factor-agent && npx tsx examples/12-hitl-multiple-choice.ts
```
Then manually test: multiple-choice display, selection by number, free-text fallback, streaming, bash tool, XML thread with HITL events, quit/Ctrl+C.
