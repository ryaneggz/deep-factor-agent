# Plan: Add Claude CLI & Codex CLI as Model Providers + Test Logging

## Context

The deep-factor-agent currently delegates to LLMs exclusively through LangChain's `initChatModel` / `BaseChatModel` API. The user wants to **additively** support Claude CLI (`claude -p`) and Codex CLI (`codex exec`) as **model providers** — not tools. They are input/output adapters: prompt goes in, response comes out. No interactivity, no internal tool calling from the CLIs. All tool calling is handled by our agent loop.

## Architecture Decision: Simple Functions vs BaseChatModel

The agent loop (`agent.ts:404-423`) uses exactly **2 methods** from the model:

```typescript
// line 407-409: tool binding (optional — guarded by `&& model.bindTools`)
const modelWithTools = allTools.length > 0 && model.bindTools
  ? model.bindTools(allTools) : model;

// line 421: invocation
const response = (await modelWithTools.invoke(messages)) as AIMessage;
```

### Option A: Simple adapter functions (RECOMMENDED)

Create simple functions per CLI that handle I/O mapping. Define a minimal `ModelAdapter` interface with just `invoke()` and optional `bindTools()`. Extend `DeepFactorAgentSettings.model` to accept this new type.

```typescript
// Minimal interface — NOT BaseChatModel
interface ModelAdapter {
  invoke(messages: BaseMessage[]): Promise<AIMessage>;
  bindTools?(tools: StructuredToolInterface[]): ModelAdapter;
}

// Simple factory functions
function createClaudeCliProvider(opts?: { model?: string }): ModelAdapter { ... }
function createCodexCliProvider(opts?: { model?: string }): ModelAdapter { ... }
```

**Why this is best:**
- Simple, testable functions — easy to reason about
- No LangChain inheritance hierarchy or abstract methods to implement
- Matches the actual interface the agent loop needs (2 methods)
- Easy to add new CLI providers in the future
- The adapter functions focus on the hard part: **output parsing**
- Type change to `DeepFactorAgentSettings.model` is minimal (union type addition)

**Tradeoff:**
- Requires a small type change in `types.ts` and `agent.ts` (add `ModelAdapter` to the union)
- `ensureModel()` needs a 3rd branch for the new type

### Option B: Extend BaseChatModel

Create `ClaudeCliModel extends BaseChatModel` and `CodexCliModel extends BaseChatModel`.

**Why NOT this:**
- BaseChatModel has 10+ abstract/required methods (`_generate`, `_llmType`, `_modelType`, `invocationParams`, constructor requirements, serialization methods)
- Most of these methods are irrelevant for CLI wrappers
- Heavy coupling to LangChain's internal type system
- The agent only calls 2 methods — implementing the full abstract class is wasted effort

### Option C: Modify agent loop to accept raw functions

Change `model` to accept `(messages: BaseMessage[]) => Promise<AIMessage>`.

**Why NOT this:**
- Too loose — no structure for tool binding
- Harder to configure (model name, CLI options, etc.)
- Less composable than an interface

## Approach

Generate **4 spec files** in `.huntley/specs/`:

| Spec | Description | New Files |
|------|-------------|-----------|
| SPEC-01 | Model Adapter Interface + Claude CLI Provider | `src/providers/types.ts`, `src/providers/claude-cli.ts`, `__tests__/providers/claude-cli.test.ts` |
| SPEC-02 | Codex CLI Provider | `src/providers/codex-cli.ts`, `__tests__/providers/codex-cli.test.ts` |
| SPEC-03 | Test Logging Infrastructure | `src/test-logger.ts`, `__tests__/test-logger.test.ts` |
| SPEC-04 | Example 14 (delegation demo) | `examples/14-claude-codex-delegation.ts` |

### Key Design Decisions

1. **Model providers, not tools** — Claude/Codex CLIs are alternative model backends. They plug into the `model` setting, not the `tools` array.
2. **Simple `ModelAdapter` interface** — Just `invoke()` + optional `bindTools()`. No BaseChatModel inheritance.
3. **Input/output only, no interactivity** — Pure prompt→response pipes:
   - Claude CLI: `claude -p "prompt" --tools ""` — print mode, built-in tools disabled
   - Codex CLI: `codex exec "prompt" --full-auto --sandbox read-only` — non-interactive, read-only
4. **Tool calling via prompt engineering** — When `bindTools()` is called, tool definitions are embedded in the system prompt. The CLI model is instructed to respond with a specific JSON format for tool calls. The adapter parses tool calls from the response text and constructs `AIMessage` with proper `tool_calls` array.
5. **Output parsing is the hard part** — Each adapter must:
   - Detect if the response contains tool calls (JSON block in response)
   - Parse tool call name, id, and args
   - Construct `AIMessage` with `tool_calls` for the agent loop
   - Handle plain text responses (no tool calls)
6. **`execFile` not `exec`** — Avoids shell injection.

### Files Modified

- `packages/deep-factor-agent/src/types.ts` — Add `ModelAdapter` interface, extend `model` union
- `packages/deep-factor-agent/src/agent.ts` — Update `ensureModel()` to handle `ModelAdapter`
- `packages/deep-factor-agent/src/index.ts` — Export new providers
- `packages/deep-factor-agent/examples/README.md` — Add Example 14
- `.gitignore` — Add `logs/`

### Reference Files

- `packages/deep-factor-agent/src/agent.ts:186-194` — `ensureModel()` resolution
- `packages/deep-factor-agent/src/agent.ts:404-423` — Model usage in agent loop
- `packages/deep-factor-agent/src/types.ts:165-182` — `DeepFactorAgentSettings`
- `packages/deep-factor-cli/src/tools/bash.ts` — `execFile` / child_process pattern

## Steps

1. Write `SPEC-01-claude-cli-provider.md` to `.huntley/specs/`
2. Write `SPEC-02-codex-cli-provider.md` to `.huntley/specs/`
3. Write `SPEC-03-test-logging.md` to `.huntley/specs/`
4. Write `SPEC-04-example-delegation.md` to `.huntley/specs/`

## Verification

- Specs follow the established format from `.huntley/archive/` (CONTEXT → OVERVIEW → IMPLEMENTATION → FILE STRUCTURE → DESIGN DECISIONS → ACCEPTANCE CRITERIA)
- All acceptance criteria are checkboxes that can be verified during implementation
- Implementation code snippets are complete and follow existing patterns

## Manual Smoke Tests

After implementation, a reviewer should run these steps to verify:

### 1. Build & Typecheck
```bash
pnpm -r build
pnpm -r type-check
```

### 2. Unit Tests (logs output to `./logs/`)
```bash
pnpm -r test
ls -la logs/   # Should contain JSON log files
cat logs/agent-*-claude-cli.json | head -30   # Verify log format
```

### 3. Claude CLI Provider — Direct Test
```bash
claude --version   # Verify claude is available

# Test provider directly — pass a prompt, get a response
node --input-type=module -e "
  import { createClaudeCliProvider } from './packages/deep-factor-agent/dist/providers/claude-cli.js';
  import { HumanMessage } from '@langchain/core/messages';
  const provider = createClaudeCliProvider();
  const response = await provider.invoke([new HumanMessage('Say hello in one word')]);
  console.log('Response:', response.content);
  console.log('Tool calls:', response.tool_calls);
"
```

### 4. Codex CLI Provider — Direct Test
```bash
codex --version   # Verify codex is available

node --input-type=module -e "
  import { createCodexCliProvider } from './packages/deep-factor-agent/dist/providers/codex-cli.js';
  import { HumanMessage } from '@langchain/core/messages';
  const provider = createCodexCliProvider();
  const response = await provider.invoke([new HumanMessage('What is 2+2?')]);
  console.log('Response:', response.content);
"
```

### 5. Agent Loop Integration — Claude CLI as Model
```bash
cd packages/deep-factor-agent

# Test with createDeepFactorAgent using Claude CLI provider
node --input-type=module -e "
  import { createDeepFactorAgent, createClaudeCliProvider, maxIterations } from './dist/index.js';
  const agent = createDeepFactorAgent({
    model: createClaudeCliProvider({ model: 'sonnet' }),
    tools: [],
    instructions: 'Be concise.',
    stopWhen: [maxIterations(1)],
    middleware: [],
  });
  const result = await agent.loop('What is the capital of France?');
  console.log('Response:', result.response);
  console.log('Iterations:', result.iterations);
  console.log('Stop reason:', result.stopReason);
"
```

### 6. Agent Loop Integration — Codex CLI as Model
```bash
cd packages/deep-factor-agent

node --input-type=module -e "
  import { createDeepFactorAgent, createCodexCliProvider, maxIterations } from './dist/index.js';
  const agent = createDeepFactorAgent({
    model: createCodexCliProvider({ model: 'o4-mini' }),
    tools: [],
    instructions: 'Be concise.',
    stopWhen: [maxIterations(1)],
    middleware: [],
  });
  const result = await agent.loop('What is 2+2?');
  console.log('Response:', result.response);
"
```

### 7. Agent Loop with Tool Calling — Provider Must Parse Tool Calls
```bash
cd packages/deep-factor-agent

# This is the critical test: does the provider correctly return tool_calls
# so the agent loop can execute them?
npx tsx examples/14-claude-codex-delegation.ts
# Expected: Agent uses Claude CLI as model, makes tool calls, gets results
```

### 8. Error Cases — Missing CLI
```bash
# Provider gracefully handles missing CLI
PATH_BACKUP=$PATH
export PATH=$(echo $PATH | tr ':' '\n' | grep -v claude | tr '\n' ':')
node --input-type=module -e "
  import { createClaudeCliProvider } from './packages/deep-factor-agent/dist/providers/claude-cli.js';
  import { HumanMessage } from '@langchain/core/messages';
  const provider = createClaudeCliProvider();
  try {
    await provider.invoke([new HumanMessage('hello')]);
  } catch (e) {
    console.log('Expected error:', e.message);
  }
"
export PATH=$PATH_BACKUP
```

### 9. Test Logs Verification
```bash
pnpm -r test
for f in logs/*.json; do
  echo "--- $f ---"
  python3 -c "import json; d=json.load(open('$f')); print(f'  suite={d[\"suite\"]} passed={d[\"passed\"]} failed={d[\"failed\"]}')"
done
```
