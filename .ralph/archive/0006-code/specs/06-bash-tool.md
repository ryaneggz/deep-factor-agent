# SPEC-06: Bash Execution Tool

## CONTEXT

### Problem Statement

The CLI needs an optional bash execution tool that allows the agent to run shell commands, enabled only when the user passes the `--bash` flag. This uses `createLangChainTool()` from `deep-factor-agent` to create a LangChain-compatible tool.

### RELEVANT FILES
- `packages/deep-factor-agent/src/tool-adapter.ts` — `createLangChainTool(name, { description, schema, execute })`
- `packages/deep-factor-agent/__tests__/tool-adapter.test.ts` — usage examples

---

## OVERVIEW

Implement `src/tools/bash.ts` — a tool that executes shell commands and returns stdout/stderr.

---

## USER STORIES

### US-01: Bash Tool Implementation

**As a** user
**I want** the agent to execute shell commands when I enable `--bash`
**So that** the agent can interact with my filesystem and dev tools

#### Tool Definition

```ts
import { z } from "zod";
import { createLangChainTool } from "deep-factor-agent";
import { execSync } from "child_process";

const bashSchema = z.object({
  command: z.string().describe("The bash command to execute"),
});

export const bashTool = createLangChainTool("bash", {
  description: "Execute a bash command and return stdout/stderr",
  schema: bashSchema,
  execute: async ({ command }) => {
    const result = execSync(command, {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    return result;
  },
});
```

#### Safety Constraints
- 30-second timeout via `execSync` timeout option
- 1MB max output buffer
- Uses `execSync` for simplicity (blocks Node but agent is already awaiting)
- **No sandboxing** — user accepts responsibility by passing `--bash`

#### Error Handling
- `execSync` throws on non-zero exit codes — caught by agent error recovery middleware
- Timeout errors surface as tool errors in the agent loop

#### Acceptance Criteria
- [ ] Uses `createLangChainTool` from `deep-factor-agent`
- [ ] Schema requires `command` string
- [ ] Executes via `execSync` with 30s timeout
- [ ] Returns stdout as string
- [ ] Throws on error (non-zero exit, timeout) — let agent handle it
- [ ] Exported as named export for conditional inclusion in tool array
- [ ] Only included in agent tools when `--bash` flag is passed

---

## DEPENDENCY ORDER

```
SPEC-02 (scaffold) → SPEC-06 (bash tool) → SPEC-04 (useAgent includes it conditionally)
```
