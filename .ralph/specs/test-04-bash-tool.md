# SPEC-04: Bash Tool Tests

> Priority: **Medium** — isolated, mechanical, no dependencies on other specs

## Goal

Test `packages/deep-factor-cli/src/tools/bash.ts` with mocked `child_process`.

## File to Create

`packages/deep-factor-cli/__tests__/tools/bash.test.ts`

## Mock Strategy

```ts
import { vi } from "vitest";

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));
```

Import the mock after setup to control `execSync` behavior per-test.

## Test Cases (14)

### Metadata (3 tests)

| # | Test | Assert |
|---|------|--------|
| 1 | Tool name is `"bash"` | `bashTool.name === "bash"` |
| 2 | Has a description | `bashTool.description.length > 0` |
| 3 | Schema requires `command` string field | Zod schema check |

### Success Path (4 tests)

| # | Test | Assert |
|---|------|--------|
| 4 | Calls `execSync` with the command string | First arg matches |
| 5 | Passes `encoding: "utf8"` | Options arg check |
| 6 | Passes `timeout: 30_000` | Options arg check |
| 7 | Passes `maxBuffer: 1048576` (1MB) | Options arg check |
| 8 | Returns stdout string | Return value matches mock |

### Error Handling (6 tests)

| # | Test | Assert |
|---|------|--------|
| 9 | Throws on non-zero exit code | `execSync` throws → tool throws |
| 10 | Propagates error message | Error message preserved |
| 11 | Timeout error propagated | ETIMEDOUT-like error |
| 12 | Max buffer error propagated | ENOMEM/maxBuffer error |
| 13 | Command not found error | Specific error message |
| 14 | Empty command still invokes execSync | Called with `""` |

## Implementation Notes

- The bash tool uses `createLangChainTool()` from `deep-factor-agent`. The returned tool has `.invoke()` for testing.
- Call `bashTool.invoke({ command: "echo hello" })` to trigger execution.
- Reset mocks between tests with `vi.clearAllMocks()` in `beforeEach`.
