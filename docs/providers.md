# Provider System

The agent supports multiple model backends through a provider abstraction layer.

## Provider Types

### 1. LangChain (default)

Pass a string model ID or a `BaseChatModel` instance. Requires the corresponding LangChain provider package installed.

```typescript
// String ID — resolved via initChatModel
const agent = createDeepFactorAgent({ model: "openai:gpt-4.1-mini" });

// BaseChatModel instance
import { initChatModel } from "langchain/chat_models/universal";
const model = await initChatModel("gpt-4.1-mini", { modelProvider: "openai" });
const agent = createDeepFactorAgent({ model });
```

**Default model:** `gpt-4.1-mini`

### 2. Claude CLI

Shells out to the `claude` CLI binary. Tool calling is handled via prompt engineering with JSON code blocks.

```typescript
import { createClaudeCliProvider } from "deep-factor-agent";

const provider = createClaudeCliProvider({
  model: "sonnet", // "sonnet" | "opus" (default: "sonnet")
  permissionMode: "bypassPermissions", // see table below
  cliPath: "claude", // path to binary
  timeout: 120_000, // ms
  maxBuffer: 10_485_760, // bytes (10 MB)
  inputEncoding: "xml", // "xml" | "text"
  outputFormat: "json", // "json" | "stream-json"
  disableBuiltInTools: true, // disable CLI's built-in tools
  verbose: false, // include verbose stream events
  includePartialMessages: false,
});

const agent = createDeepFactorAgent({ model: provider });
```

**Permission modes:**

| Value               | Behavior                              |
| ------------------- | ------------------------------------- |
| `bypassPermissions` | Skip all permission prompts (default) |
| `acceptEdits`       | Auto-accept file edits                |
| `plan`              | Planning only, no execution           |
| `dontAsk`           | Don't ask for confirmation            |
| `default`           | Use CLI defaults                      |
| `auto`              | Automatic                             |

**Note:** When running Claude CLI from inside a Claude Code session, unset `CLAUDECODE`:

```bash
CLAUDECODE= deepfactor --provider claude ...
```

### 3. Codex CLI

Shells out to the `codex` CLI binary. Parses JSONL event streams.

```typescript
import { createCodexCliProvider } from "deep-factor-agent";

const provider = createCodexCliProvider({
  model: "gpt-5.4", // default model
  cliPath: "codex", // path to binary
  timeout: 120_000, // ms
  maxBuffer: 10_485_760, // bytes
  inputEncoding: "xml", // "xml" | "text"
  outputFormat: "text", // "text" | "jsonl"
  sandbox: "read-only", // "read-only" | "workspace-write" | "danger-full-access"
  skipGitRepoCheck: true,
});

const agent = createDeepFactorAgent({ model: provider });
```

### 4. Claude Agent SDK

Uses the Claude Agent SDK as an optional peer dependency, loaded dynamically at runtime.

```typescript
import { createClaudeAgentSdkProvider } from "deep-factor-agent";

const provider = createClaudeAgentSdkProvider({
  model: "claude-opus-4-6",
  permissionMode: "bypassPermissions",
  cwd: process.cwd(),
  maxTurns: 1,
  thinking: { type: "adaptive" }, // or { type: "enabled", budgetTokens: 10000 }
  effort: "high", // "low" | "medium" | "high" | "max"
  mcpServers: {}, // MCP server definitions
  allowedTools: [], // tool whitelist
  disallowedTools: [], // tool blacklist
  systemPrompt: "...",
  persistSession: false,
  timeout: 120_000,
});
```

**Install the SDK separately:**

```bash
pnpm add @anthropic-ai/claude-agent-sdk
```

## ModelAdapter Interface

All CLI/SDK providers implement `ModelAdapter`:

```typescript
interface ModelAdapter {
  invoke(messages: BaseMessage[]): Promise<AIMessage>;
  invokeWithUpdates?(
    messages: BaseMessage[],
    onUpdate: (update: ModelInvocationUpdate) => void,
  ): Promise<AIMessage>;
  bindTools?(tools: StructuredToolInterface[]): ModelAdapter;
}
```

The optional `invokeWithUpdates` method enables streaming updates to the TUI during model invocation.

**Update types:**

| Type                | Payload                                 |
| ------------------- | --------------------------------------- |
| `tool_call`         | `{ name, id, args }`                    |
| `assistant_message` | text content                            |
| `usage`             | `TokenUsage` + optional `rawStopReason` |
| `error`             | error string + `rawStopReason`          |
| `final`             | completion with optional content, usage |

## TUI Provider Resolution

The TUI maps `--provider` flag and `--mode` flag to provider configuration:

| Provider    | Default Model  | Mode Mapping                                           |
| ----------- | -------------- | ------------------------------------------------------ |
| `langchain` | `gpt-4.1-mini` | Direct pass-through                                    |
| `claude`    | `sonnet`       | plan→plan, approve→acceptEdits, yolo→bypassPermissions |
| `codex`     | `gpt-5.4`      | Direct pass-through                                    |
