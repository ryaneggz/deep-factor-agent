# Plan Mode: Approve/Reject/Revise Workflow

## Context

When running `deepfactor --mode plan "Plan simple expressjs app"`, the output is noisy and unclear:
1. The LLM outputs a plain-text plan first, gets re-prompted to use `<proposed_plan>` tags, then outputs again — duplicate output
2. Raw `<proposed_plan>` XML tags are visible in the rendered plan
3. Plan mode immediately completes with no way to approve, reject, or request revisions
4. Blocked tool calls (`write_todos`) add clutter

The goal is to make plan mode a clean, human-prompted refinement loop: propose plan → user reviews → approve / reject / revise with feedback.

---

## Changes

### 1. Better plan mode system prompt
**File:** `packages/deep-factor-agent/src/agent.ts` — `getModeInstructions()` (line 348)

Replace terse one-liner with structured instructions:
- Explicitly forbid calling mutating tools (eliminates `write_todos` noise)
- Emphasize the `<proposed_plan>` tag requirement with examples
- Instruct to go directly to planning (no preamble outside tags)

### 2. Strip XML tags from plan content
**File:** `packages/deep-factor-agent/src/agent.ts` (lines 1043, 1049)

Use `parsedPlan.content` (already tag-stripped) instead of `parsedPlan.block` in:
- The `plan` event pushed to thread
- The `PlanResult` return value

### 3. Plan review via PendingResult (core change)
**File:** `packages/deep-factor-agent/src/agent.ts` (lines 1028-1055)

When a valid plan is parsed, instead of returning `PlanResult` immediately:
- Push a `human_input_requested` event with `kind: "plan_review"`
- Return a `PendingResult` with a `resume()` function that handles three paths:
  - **approve** → return `PlanResult` with clean plan content
  - **reject** → return `AgentResult` with `stopDetail: "Plan rejected by user"`
  - **revise** (any other text) → inject feedback as user message, call `this.runLoop()` to continue the loop for a revised plan

Add private method `createPlanPendingResult()` (after existing `createPendingResult` ~line 477).

### 4. Add `"plan_review"` to HumanInputKind
**File:** `packages/deep-factor-agent/src/types.ts` (line 21)

```typescript
export type HumanInputKind = "question" | "approval" | "plan_review";
```

### 5. TUI: Plan review rendering
**File:** `packages/deep-factor-tui/src/components/Content.tsx`

- When `pending_input` + `plan_review`: show plan with review instructions (approve/reject/revise)
- When `done` + plan exists: show final approved plan
- Guard existing plan display to avoid double-rendering

### 6. TUI: useAgent hook updates
**File:** `packages/deep-factor-tui/src/hooks/useAgent.ts`

**handleResult:** When `PendingResult` has `kind === "plan_review"`, extract the plan event and set `plan` state.

**submitHumanInput:** When `humanInputRequest.kind === "plan_review"`, translate plain string input:
- `"approve"` → `{ decision: "approve" }`
- `"reject"` → `{ decision: "reject" }`
- anything else → `{ decision: "edit", response: input }` (revision feedback)

**eventsToChatMessages:** Filter out noise:
- Skip tool_call/tool_result pairs where result contains "blocked in plan mode"
- Skip user messages containing "Plan mode requires exactly one"

### 7. Print mode: auto-approve
**File:** `packages/deep-factor-tui/src/print.ts`

Plan mode now returns `PendingResult` instead of `PlanResult`. In non-interactive print mode, auto-approve:
- Check for `human_input_needed` stop reason + plan mode
- Call `result.resume({ decision: "approve" })`
- Output the approved plan

### 8. Update tests
**File:** `packages/deep-factor-agent/__tests__/agent.test.ts`

- Update existing "plan mode returns PlanResult" test to account for `PendingResult` → `resume({ decision: "approve" })` → `PlanResult` flow
- Add test: plan revision cycle (propose → feedback → revised plan → approve)
- Add test: plan rejection returns AgentResult
- Add test: plan content has no XML tags
- Update "does not duplicate" test for new flow

---

## Verification

1. `pnpm -r type-check` — all packages pass
2. `pnpm -C packages/deep-factor-agent test` — agent tests pass (including updated plan tests)
3. `pnpm -C packages/deep-factor-tui test` — TUI tests pass
4. Manual: `deepfactor --mode plan "Plan simple expressjs app"`
   - Should show clean plan (no XML tags, no blocked tool noise)
   - Should prompt for approve/reject/revise
   - Typing "approve" completes with plan shown
   - Typing feedback triggers a revised plan
   - Typing "reject" exits
5. Manual: `deepfactor -p --mode plan "Plan simple expressjs app"`
   - Should auto-approve and output clean plan to stdout
