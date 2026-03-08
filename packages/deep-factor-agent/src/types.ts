import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ModelAdapter } from "./providers/types.js";

// --- Event Types ---

export type AgentEventType =
  | "approval"
  | "tool_call"
  | "tool_result"
  | "error"
  | "human_input_requested"
  | "human_input_received"
  | "message"
  | "completion"
  | "plan"
  | "summary";

export type AgentMode = "plan" | "approve" | "yolo";
export type ApprovalDecision = "approve" | "reject" | "edit";
export type HumanInputKind = "question" | "approval" | "plan_review";

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

export interface ApprovalEvent extends BaseEvent {
  type: "approval";
  toolName: string;
  toolCallId: string;
  decision: ApprovalDecision;
  response?: string;
}

export interface ToolResultEvent extends BaseEvent {
  type: "tool_result";
  toolCallId: string;
  result: unknown;
  /** Execution duration in milliseconds (recorded when timing is available). */
  durationMs?: number;
  /** Identifier grouping tool results that executed concurrently in the same parallel batch. */
  parallelGroup?: string;
}

export interface ErrorEvent extends BaseEvent {
  type: "error";
  error: string;
  toolCallId?: string;
  recoverable: boolean;
}

export interface HumanInputRequestedEvent extends BaseEvent {
  type: "human_input_requested";
  kind?: HumanInputKind;
  question: string;
  context?: string;
  urgency?: "low" | "medium" | "high";
  format?: "free_text" | "yes_no" | "multiple_choice";
  choices?: string[];
  approvalRequest?: {
    toolName: string;
    toolCallId: string;
    args: Record<string, unknown>;
    reason: string;
  };
}

export interface HumanInputReceivedEvent extends BaseEvent {
  type: "human_input_received";
  response: string;
  decision?: ApprovalDecision;
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

export interface PlanEvent extends BaseEvent {
  type: "plan";
  content: string;
}

export interface SummaryEvent extends BaseEvent {
  type: "summary";
  summarizedIterations: number[];
  summary: string;
}

export type AgentEvent =
  | ApprovalEvent
  | ToolCallEvent
  | ToolResultEvent
  | ErrorEvent
  | HumanInputRequestedEvent
  | HumanInputReceivedEvent
  | MessageEvent
  | CompletionEvent
  | PlanEvent
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

export interface AgentExecutionUpdate {
  thread: AgentThread;
  usage: TokenUsage;
  iterations: number;
  status: "running" | "pending_input" | "done" | "error";
  lastEvent?: AgentEvent;
  stopReason?: AgentResult["stopReason"] | PlanResult["stopReason"] | PendingResult["stopReason"];
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
  result: string;
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
  /** Custom token estimator replacing the built-in `Math.ceil(text.length / 3.5)` heuristic. */
  tokenEstimator?: (text: string) => number;
}

// --- Middleware ---

export interface MiddlewareContext {
  thread: AgentThread;
  iteration: number;
  settings: DeepFactorAgentSettings;
}

export interface AgentToolMetadata {
  mutatesState?: boolean;
  modeAvailability?: "all" | "plan_only" | "approve_only" | "yolo_only";
}

export interface AgentTool extends StructuredToolInterface {
  metadata?: AgentToolMetadata;
}

export interface AgentMiddleware {
  name: string;
  tools?: StructuredToolInterface[];
  beforeIteration?: (ctx: MiddlewareContext) => Promise<void>;
  afterIteration?: (ctx: MiddlewareContext, result: unknown) => Promise<void>;
}

// --- Agent Settings ---

export interface DeepFactorAgentSettings<
  TTools extends StructuredToolInterface[] = StructuredToolInterface[],
> {
  model: BaseChatModel | ModelAdapter | string;
  tools?: TTools;
  instructions?: string;
  stopWhen?: StopCondition | StopCondition[];
  verifyCompletion?: VerifyCompletion;
  middleware?: AgentMiddleware[];
  interruptOn?: string[];
  contextManagement?: ContextManagementConfig;
  /** Maximum tool-call steps per outer iteration (default: 20). */
  maxToolCallsPerIteration?: number;
  /** Context mode: "standard" converts events to individual LangChain messages; "xml" serializes the full thread into a single XML HumanMessage. Default: "standard". */
  contextMode?: "standard" | "xml";
  /** When true, independent tool calls execute concurrently via Promise.all. HITL and interruptOn tools are excluded from parallel batches. Default: false. */
  parallelToolCalls?: boolean;
  /** Execution mode: "plan" denies mutating tools and expects a plan output, "approve" gates mutating tools on approval, and "yolo" executes normally. Default: "yolo". */
  mode?: AgentMode;
  streamMode?: "final" | "updates";
  onUpdate?: (update: AgentExecutionUpdate) => void;
  onIterationStart?: (iteration: number) => void;
  onIterationEnd?: (iteration: number, result: unknown) => void;
}

// --- Results ---

export interface AgentResult {
  response: string;
  thread: AgentThread;
  usage: TokenUsage;
  iterations: number;
  stopReason: "completed" | "stop_condition" | "max_errors";
  stopDetail?: string;
}

export interface PlanResult {
  mode: "plan";
  plan: string;
  thread: AgentThread;
  usage: TokenUsage;
  iterations: number;
  stopReason: "plan_completed" | "human_input_needed" | "stop_condition" | "max_errors";
  stopDetail?: string;
}

export interface ResumeInput {
  decision?: ApprovalDecision;
  response?: string;
}

export interface PendingResult {
  response: string;
  thread: AgentThread;
  usage: TokenUsage;
  iterations: number;
  stopReason: "human_input_needed";
  stopDetail?: string;
  resume: (input: string | ResumeInput) => Promise<AgentResult | PendingResult | PlanResult>;
}

export function isPendingResult(r: AgentResult | PendingResult | PlanResult): r is PendingResult {
  return r.stopReason === "human_input_needed";
}

export function isPlanResult(r: AgentResult | PendingResult | PlanResult): r is PlanResult {
  return "mode" in r && r.mode === "plan";
}
