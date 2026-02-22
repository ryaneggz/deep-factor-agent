import type { LanguageModel, ToolSet } from "ai";

// --- Event Types ---

export type AgentEventType =
  | "tool_call"
  | "tool_result"
  | "error"
  | "human_input_requested"
  | "human_input_received"
  | "message"
  | "completion"
  | "summary";

export interface BaseEvent {
  type: AgentEventType;
  timestamp: number;
  iteration: number;
}

export interface ToolCallEvent extends BaseEvent {
  type: "tool_call";
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
}

export interface ToolResultEvent extends BaseEvent {
  type: "tool_result";
  toolCallId: string;
  result: unknown;
}

export interface ErrorEvent extends BaseEvent {
  type: "error";
  error: string;
  toolCallId?: string;
  recoverable: boolean;
}

export interface HumanInputRequestedEvent extends BaseEvent {
  type: "human_input_requested";
  question: string;
  context?: string;
  urgency?: "low" | "medium" | "high";
  format?: "free_text" | "yes_no" | "multiple_choice";
  choices?: string[];
}

export interface HumanInputReceivedEvent extends BaseEvent {
  type: "human_input_received";
  response: string;
}

export interface MessageEvent extends BaseEvent {
  type: "message";
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CompletionEvent extends BaseEvent {
  type: "completion";
  result: string;
  verified: boolean;
}

export interface SummaryEvent extends BaseEvent {
  type: "summary";
  summarizedIterations: number[];
  summary: string;
}

export type AgentEvent =
  | ToolCallEvent
  | ToolResultEvent
  | ErrorEvent
  | HumanInputRequestedEvent
  | HumanInputReceivedEvent
  | MessageEvent
  | CompletionEvent
  | SummaryEvent;

// --- Thread ---

export interface AgentThread {
  id: string;
  events: AgentEvent[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

// --- Token Usage ---

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

// --- Stop Conditions ---

export interface StopConditionContext {
  iteration: number;
  usage: TokenUsage;
  model: string;
  thread: AgentThread;
}

export interface StopConditionResult {
  stop: boolean;
  reason?: string;
}

export type StopCondition = (ctx: StopConditionContext) => StopConditionResult;

// --- Verification ---

export interface VerifyContext {
  result: unknown;
  iteration: number;
  thread: AgentThread;
  originalPrompt: string;
}

export interface VerifyResult {
  complete: boolean;
  reason?: string;
}

export type VerifyCompletion = (ctx: VerifyContext) => Promise<VerifyResult>;

// --- Context Management ---

export interface ContextManagementConfig {
  maxContextTokens?: number;
  keepRecentIterations?: number;
}

// --- Middleware ---

export interface MiddlewareContext {
  thread: AgentThread;
  iteration: number;
  settings: DeepFactorAgentSettings;
}

export interface AgentMiddleware {
  name: string;
  tools?: ToolSet;
  beforeIteration?: (ctx: MiddlewareContext) => Promise<void>;
  afterIteration?: (
    ctx: MiddlewareContext,
    result: unknown,
  ) => Promise<void>;
}

// --- Agent Settings ---

export interface DeepFactorAgentSettings<
  TTools extends ToolSet = ToolSet,
> {
  model: LanguageModel | string;
  tools?: TTools;
  instructions?: string;
  stopWhen?: StopCondition | StopCondition[];
  verifyCompletion?: VerifyCompletion;
  middleware?: AgentMiddleware[];
  interruptOn?: string[];
  contextManagement?: ContextManagementConfig;
  onIterationStart?: (iteration: number) => void;
  onIterationEnd?: (iteration: number, result: unknown) => void;
}

// --- Results ---

export interface AgentResult {
  response: string;
  thread: AgentThread;
  usage: TokenUsage;
  iterations: number;
  stopReason:
    | "completed"
    | "stop_condition"
    | "max_errors"
    | "human_input_needed";
  stopDetail?: string;
}

export interface PendingResult extends AgentResult {
  stopReason: "human_input_needed";
  resume: (humanResponse: string) => Promise<AgentResult>;
}
