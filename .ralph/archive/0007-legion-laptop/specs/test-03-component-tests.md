# SPEC-03: Component Tests

> Priority: **Medium** — parallelizable with SPEC-02, pure prop-driven components

## Goal

Unit test 4 untested components + extend existing Chat tests. All components are pure/prop-driven — no mocks needed beyond `ink-testing-library`.

## Files to Create

### 1. `__tests__/components/ToolCall.test.tsx` (9 tests)

Source: `src/components/ToolCall.tsx` — renders tool name + truncated args.

| # | Test | Assert |
|---|------|--------|
| 1 | Renders tool name in bold | Contains name text |
| 2 | Renders JSON-stringified args | Contains arg key/value |
| 3 | Truncates string values >120 chars | Ends with `...` |
| 4 | Preserves string values <=120 chars | Full value present |
| 5 | Handles empty args object `{}` | Renders `{}` |
| 6 | Handles multi-key args | All keys present |
| 7 | Handles non-string values (number) | Stringified |
| 8 | Handles nested object values | JSON.stringify fallback |
| 9 | Handles null/undefined arg values | No crash |

### 2. `__tests__/components/Spinner.test.tsx` (7 tests)

Source: `src/components/Spinner.tsx` — animated "Thinking..." with cycling dots (300ms interval).

| # | Test | Assert |
|---|------|--------|
| 1 | Renders "Thinking" text | Contains "Thinking" |
| 2 | Starts with 1 dot | Contains "Thinking." |
| 3 | After 300ms shows 2 dots | `vi.advanceTimersByTime(300)` → "Thinking.." |
| 4 | After 600ms shows 3 dots | "Thinking..." |
| 5 | After 900ms cycles back to 1 dot | "Thinking." |
| 6 | Cleanup: no interval leak on unmount | `unmount()` then advance — no error |
| 7 | Multiple cycles remain stable | Advance 3000ms — no crash |

**Note:** Use `vi.useFakeTimers()` and `vi.useRealTimers()` in beforeEach/afterEach.

### 3. `__tests__/components/HumanInput.test.tsx` (16 tests)

Source: `src/components/HumanInput.tsx` — interactive text input for human-in-the-loop.

| # | Test | Assert |
|---|------|--------|
| 1 | Renders question text | Contains question string |
| 2 | Renders choices when provided | Contains "1. choice1" etc. |
| 3 | Does not render choices section when absent | No numbered list |
| 4 | Appends character on keypress | "a" → input shows "a" |
| 5 | Appends multiple characters | "abc" → shows "abc" |
| 6 | Backspace removes last character | "ab" + backspace → "a" |
| 7 | Delete removes last character | "ab" + delete → "a" |
| 8 | Backspace on empty input — no crash | "" + backspace → "" |
| 9 | Ignores ctrl key combos | ctrl+a → no change |
| 10 | Ignores meta key combos | meta+a → no change |
| 11 | Enter submits non-empty input | `onSubmit` called with trimmed value |
| 12 | Enter on empty input — no submit | `onSubmit` not called |
| 13 | Clears input after submit | Display resets |
| 14 | Trims whitespace before submit | "  hello  " → "hello" |
| 15 | Renders cursor indicator | Contains cursor character |
| 16 | Renders input prefix | Contains ">" or equivalent |

**Note:** Use `stdin.write("a")` for character input, `stdin.write("\r")` for Enter.

### 4. `__tests__/components/PromptInput.test.tsx` (10 tests)

Source: `src/components/PromptInput.tsx` — same keyboard logic as HumanInput but with "> " prompt.

| # | Test | Assert |
|---|------|--------|
| 1 | Renders "> " prefix | Contains "> " |
| 2 | Appends character on keypress | Shows typed char |
| 3 | Appends multiple characters | Shows all chars |
| 4 | Backspace removes last character | Correct removal |
| 5 | Delete removes last character | Same as backspace |
| 6 | Backspace on empty — no crash | Stable |
| 7 | Ignores ctrl key combos | No change |
| 8 | Ignores meta key combos | No change |
| 9 | Enter submits non-empty input | `onSubmit` called |
| 10 | Enter on empty — no submit | Not called |

### 5. Extend `__tests__/components/Chat.test.tsx` (+3 tests)

| # | Test | Assert |
|---|------|--------|
| 1 | Renders tool_call messages via ToolCall component | Tool name visible |
| 2 | Renders tool_result with verbose=true | Content visible |
| 3 | Truncates tool_result content at 200 chars | Ends with "..." |
