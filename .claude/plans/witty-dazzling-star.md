# Plan: Sandbox Rules for Agent Tool Execution

## Context

The agent currently has no restrictions on tool execution — the bash tool runs arbitrary commands via `execSync` with no validation, and there are no guardrails preventing access to sensitive files or network resources. This plan adds a sandbox rules engine that:

1. **Prevents reads from `.env*` files** (`.env`, `.env.local`, `.env.production`, etc.)
2. **Disables network access** (blocks curl, wget, nc, ssh, etc. in bash commands)
3. **Allows read + write to a workspace directory** (restricts file operations to a workspace root)

The approach is **layered defense**: application-level rule evaluation in the agent loop (catches tool args before execution) combined with bash tool hardening (env var stripping, `cwd` restriction, optional OS-level network isolation via `unshare --net` on Linux).

## Files to Modify/Create

| File | Action | Purpose |
|---|---|---|
| `packages/deep-factor-agent/src/types.ts` | Modify | Add `SandboxConfig`, `SandboxRule`, `SandboxRuleResult`, `SandboxDenyEvent` types |
| `packages/deep-factor-agent/src/sandbox.ts` | **Create** | Rules engine: built-in rules + evaluator |
| `packages/deep-factor-agent/src/agent.ts` | Modify | Insert sandbox check before `foundTool.invoke()` at line 456 |
| `packages/deep-factor-agent/src/create-agent.ts` | Modify | Pass through `sandbox` config |
| `packages/deep-factor-agent/src/xml-serializer.ts` | Modify | Handle `sandbox_deny` event type |
| `packages/deep-factor-agent/src/index.ts` | Modify | Export sandbox types and functions |
| `packages/deep-factor-cli/src/tools/bash.ts` | Modify | Harden with `spawnSync`, env stripping, workspace cwd, optional `unshare --net` |
| `packages/deep-factor-agent/__tests__/sandbox.test.ts` | **Create** | Unit tests for rules engine |

## Implementation Steps

### Step 1: Types (`types.ts`)

Add to `AgentEventType` union: `"sandbox_deny"`

Add new types after existing event interfaces:

```typescript
export interface SandboxDenyEvent extends BaseEvent {
  type: "sandbox_deny";
  toolName: string;
  toolCallId: string;
  ruleName: string;
  reason: string;
}
```

Add `SandboxDenyEvent` to the `AgentEvent` union.

Add sandbox configuration types:

```typescript
export interface SandboxRule {
  name: string;
  tools: string[] | "*";               // Which tools this applies to
  evaluate: (toolName: string, args: Record<string, unknown>) => SandboxRuleResult;
}

export interface SandboxRuleResult {
  action: "allow" | "deny";
  reason?: string;
}

export interface SandboxConfig {
  workspaceRoot?: string;
  rules?: SandboxRule[];                // Custom rules appended after built-ins
  onDeny?: "error" | "skip";           // Default: "error" (returns error ToolMessage to model)
  stripEnvVars?: string[];             // Extra env vars to strip from bash child processes
  networkIsolation?: boolean;          // Use unshare --net on Linux (default: false)
}
```

Add `sandbox?: SandboxConfig` to `DeepFactorAgentSettings`.

### Step 2: Rules Engine (`sandbox.ts` — new file)

Create `packages/deep-factor-agent/src/sandbox.ts` with:

- **`envFileBlockRule()`** — Blocks `.env*` file access. Checks bash `command` arg for patterns like `cat .env`, `head .env.local`, `source .env.production`. Also checks generic `file_path`/`path`/`filename` args on any tool.
- **`networkBlockRule()`** — Blocks network commands in bash: `curl`, `wget`, `nc`, `ssh`, `scp`, `telnet`, `ping`, `dig`, `nslookup`, plus `https?://` URL patterns. Only applies to `bash` tool.
- **`workspaceBoundaryRule(workspaceRoot)`** — Validates `file_path`/`path` args resolve within workspace root. Checks `cwd` arg on bash tool.
- **`evaluateSandboxRules(rules, toolName, args)`** — Iterates rules, returns first deny or allow. Includes `ruleName` in deny results.
- **`buildSandboxRules(config)`** — Assembles built-in rules + custom rules from `SandboxConfig`.

### Step 3: Agent Loop Integration (`agent.ts`)

Insert sandbox check between the `interruptOn` check (line 454) and `findToolByName` (line 456):

```
line 454:  continue; }
           ↓ INSERT SANDBOX CHECK HERE ↓
line 456:  const foundTool = findToolByName(...)
```

The check:
1. If `sandboxRules.length > 0`, call `evaluateSandboxRules(rules, tc.name, tc.args)`
2. If denied: push `SandboxDenyEvent` to thread, push error `ToolResultEvent` + `ToolMessage` (in "error" mode), then `continue` to skip execution
3. If allowed: proceed to `findToolByName` + `invoke` as normal

Also add `sandbox_deny` as a no-op case in `buildMessages()` switch (the paired `tool_result` event already produces the `ToolMessage`).

Constructor changes: build sandbox rules from `settings.sandbox` and store as `private sandboxRules: SandboxRule[]`.

### Step 4: XML Serializer (`xml-serializer.ts`)

Add a `case "sandbox_deny"` to the switch in `serializeThreadToXml()`:

```typescript
case "sandbox_deny":
  lines.push(
    `  <event type="sandbox_deny" id="${id}" tool="${escapeXml(event.toolName)}" rule="${escapeXml(event.ruleName)}" iteration="${iteration}">${escapeXml(event.reason)}</event>`
  );
  break;
```

### Step 5: Factory (`create-agent.ts`)

Add `sandbox: settings.sandbox` to the `resolvedSettings` spread (pass-through, no defaults needed — `undefined` means no sandbox).

### Step 6: Exports (`index.ts`)

Add exports:
```typescript
export { evaluateSandboxRules, buildSandboxRules, envFileBlockRule, networkBlockRule, workspaceBoundaryRule } from "./sandbox.js";
export type { SandboxConfig, SandboxRule, SandboxRuleResult, SandboxDenyEvent } from "./types.js";
```

### Step 7: Bash Tool Hardening (`packages/deep-factor-cli/src/tools/bash.ts`)

Replace the simple `bashTool` export with a `createBashTool(options?)` factory:

- Replace `execSync` with `spawnSync` for better control
- **Env stripping**: Remove `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AWS_SECRET_ACCESS_KEY`, etc. from child process env
- **Workspace cwd**: Set `cwd` to `sandbox.workspaceRoot` if provided
- **Network isolation**: If `sandbox.networkIsolation && platform() === "linux"`, wrap command in `unshare --net --map-root-user bash -c <command>`
- Keep backward-compatible `export const bashTool = createBashTool()` default

### Step 8: Tests (`__tests__/sandbox.test.ts`)

Unit tests covering:
- `envFileBlockRule`: blocks `cat .env`, `cat .env.local`, `head .env.production`, `source .env`; allows `cat README.md`, `ls`
- `networkBlockRule`: blocks `curl`, `wget`, `nc`, `ssh`, URLs; allows `echo`, `ls`, `cat`; only applies to bash tool
- `workspaceBoundaryRule`: allows paths within root; blocks `../` traversal and absolute paths outside root
- `evaluateSandboxRules`: returns first deny; skips non-matching tool filters; handles wildcard `*`
- `buildSandboxRules`: includes all built-ins + custom rules

## Usage Example

```typescript
import { createDeepFactorAgent } from "deep-factor-agent";

const agent = createDeepFactorAgent({
  model: "openai:gpt-4o",
  tools: [createBashTool({ sandbox: { workspaceRoot: "/workspace", networkIsolation: true } })],
  sandbox: {
    workspaceRoot: "/workspace",
    networkIsolation: true,
    onDeny: "error",
  },
});
```

## Verification

1. **Build**: `pnpm -C packages/deep-factor-agent build` — no type errors
2. **Unit tests**: `pnpm -C packages/deep-factor-agent test` — sandbox.test.ts passes
3. **Manual test**: Run CLI with sandbox enabled, ask agent to `cat .env` — should see `[SANDBOX DENIED]` in output
4. **Manual test**: Ask agent to `curl https://example.com` — should see network denied
5. **Manual test**: Ask agent to `ls /workspace` — should succeed
6. **Backward compat**: Run agent without `sandbox` config — no behavior change
