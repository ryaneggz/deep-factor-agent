# SPEC-02: Core Types & Interfaces

## CONTEXT

This spec defines the type system that all components depend on. Types must be designed to support the 12-factor agent principles -- particularly Factor 5 (unified state) and Factor 12 (stateless reducer).

### DEPENDENCIES
- SPEC-01 (project initialized, dependencies installed)

---

## TYPES

### AgentEvent (Discriminated Union)

The atomic unit of the unified event log. Every action, result, and error is an event.

```ts
type AgentEventType =
  | "tool_call"
  | "tool_result"
  | "error"
  | "human_input_requested"
  | "human_input_received"
  | "message"
  | "completion"
  | "summary";

interface BaseEvent {
  type: AgentEventType;
  timestamp: number;
  iteration: number;
}

interface ToolCallEvent extends BaseEvent {
  type: "tool_call";
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
}

interface ToolResultEvent extends BaseEvent {
  type: "tool_result";
  toolCallId: string;
  result: unknown;
}

interface ErrorEvent extends BaseEvent {
  type: "error";
  error: string;
  toolCallId?: string;
  recoverable: boolean;
}

interface HumanInputRequestedEvent extends BaseEvent {
  type: "human_input_requested";
  question: string;
  context?: string;
  urgency?: "low" | "medium" | "high";
  format?: "free_text" | "yes_no" | "multiple_choice";
  choices?: string[];
}

interface HumanInputReceivedEvent extends BaseEvent {
  type: "human_input_received";
  response: string;
}

interface MessageEvent extends BaseEvent {
  type: "message";
  role: "user" | "assistant" | "system";
  content: string;
}

interface CompletionEvent extends BaseEvent {
  type: "completion";
  result: string;
  verified: boolean;
}

interface SummaryEvent extends BaseEvent {
  type: "summary";
  summarizedIterations: number[];
  summary: string;
}

type AgentEvent =
  | ToolCallEvent
  | ToolResultEvent
  | ErrorEvent
  | HumanInputRequestedEvent
  | HumanInputReceivedEvent
  | MessageEvent
  | CompletionEvent
  | SummaryEvent;
```

### AgentThread

The unified state container (Factor 5). The complete history of agent execution.

```ts
interface AgentThread {
  id: string;
  events: AgentEvent[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}
```

### TokenUsage

Tracks token consumption across iterations.

```ts
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}
```

### StopCondition

Factory-returned function that decides when to halt.

```ts
interface StopConditionContext {
  iteration: number;
  usage: TokenUsage;
  model: string;
  thread: AgentThread;
}

interface StopConditionResult {
  stop: boolean;
  reason?: string;
}

type StopCondition = (ctx: StopConditionContext) => StopConditionResult;
```

### VerifyCompletion

Async function that checks if the agent's work is done.

```ts
interface VerifyContext {
  result: unknown;
  iteration: number;
  thread: AgentThread;
  originalPrompt: string;
}

interface VerifyResult {
  complete: boolean;
  reason?: string;
}

type VerifyCompletion = (ctx: VerifyContext) => Promise<VerifyResult>;
```

### AgentMiddleware

Extensible hook interface for the middleware pipeline.

```ts
interface MiddlewareContext {
  thread: AgentThread;
  iteration: number;
  settings: DeepFactorAgentSettings;
}

interface AgentMiddleware {
  name: string;
  tools?: ToolSet;
  beforeIteration?: (ctx: MiddlewareContext) => Promise<void>;
  afterIteration?: (ctx: MiddlewareContext, result: unknown) => Promise<void>;
}
```

### DeepFactorAgentSettings

Configuration for the factory function.

```ts
interface DeepFactorAgentSettings<TTools extends ToolSet = ToolSet> {
  /** LLM model - string ID or LanguageModel instance */
  model: LanguageModel | string;
  /** User-defined tools */
  tools?: TTools;
  /** System prompt / instructions */
  instructions?: string;
  /** Outer loop stop conditions (OR semantics) */
  stopWhen?: StopCondition | StopCondition[];
  /** Verification function called after each iteration */
  verifyCompletion?: VerifyCompletion;
  /** Middleware pipeline */
  middleware?: AgentMiddleware[];
  /** Tools that require human approval before execution */
  interruptOn?: string[];
  /** Context management settings */
  contextManagement?: ContextManagementConfig;
  /** Lifecycle callbacks */
  onIterationStart?: (iteration: number) => void;
  onIterationEnd?: (iteration: number, result: unknown) => void;
}
```

### AgentResult

Returned from `.loop()` and `.stream()`.

```ts
interface AgentResult {
  /** Final text response */
  response: string;
  /** Complete event log */
  thread: AgentThread;
  /** Aggregated token usage */
  usage: TokenUsage;
  /** Number of outer loop iterations */
  iterations: number;
  /** Why the agent stopped */
  stopReason: "completed" | "stop_condition" | "max_errors" | "human_input_needed";
  /** Detail on stop reason */
  stopDetail?: string;
}

interface PendingResult extends AgentResult {
  stopReason: "human_input_needed";
  /** Resume execution after human provides input */
  resume: (humanResponse: string) => Promise<AgentResult>;
}
```

### ContextManagementConfig

```ts
interface ContextManagementConfig {
  /** Max total tokens before summarization triggers (default: 150000) */
  maxContextTokens?: number;
  /** Number of recent iterations to keep in full (default: 3) */
  keepRecentIterations?: number;
}
```

---

## ACCEPTANCE CRITERIA

- [ ] All types defined in `src/types.ts`
- [ ] All types exported from `src/index.ts`
- [ ] `pnpm type-check` passes with no errors
- [ ] No runtime dependencies added (types only)
- [ ] Types use Vercel AI SDK's `LanguageModel` and `ToolSet` types where applicable
