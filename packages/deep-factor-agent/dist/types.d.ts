import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ModelAdapter } from "./providers/types.js";
export type AgentEventType = "tool_call" | "tool_result" | "error" | "human_input_requested" | "human_input_received" | "message" | "completion" | "summary";
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
export type AgentEvent = ToolCallEvent | ToolResultEvent | ErrorEvent | HumanInputRequestedEvent | HumanInputReceivedEvent | MessageEvent | CompletionEvent | SummaryEvent;
export interface AgentThread {
    id: string;
    events: AgentEvent[];
    metadata: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
}
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}
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
export interface ContextManagementConfig {
    maxContextTokens?: number;
    keepRecentIterations?: number;
    /** Custom token estimator replacing the built-in `Math.ceil(text.length / 3.5)` heuristic. */
    tokenEstimator?: (text: string) => number;
}
export interface MiddlewareContext {
    thread: AgentThread;
    iteration: number;
    settings: DeepFactorAgentSettings;
}
export interface AgentMiddleware {
    name: string;
    tools?: StructuredToolInterface[];
    beforeIteration?: (ctx: MiddlewareContext) => Promise<void>;
    afterIteration?: (ctx: MiddlewareContext, result: unknown) => Promise<void>;
}
export interface DeepFactorAgentSettings<TTools extends StructuredToolInterface[] = StructuredToolInterface[]> {
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
    onIterationStart?: (iteration: number) => void;
    onIterationEnd?: (iteration: number, result: unknown) => void;
}
export interface AgentResult {
    response: string;
    thread: AgentThread;
    usage: TokenUsage;
    iterations: number;
    stopReason: "completed" | "stop_condition" | "max_errors";
    stopDetail?: string;
}
export interface PendingResult {
    response: string;
    thread: AgentThread;
    usage: TokenUsage;
    iterations: number;
    stopReason: "human_input_needed";
    stopDetail?: string;
    resume: (humanResponse: string) => Promise<AgentResult | PendingResult>;
}
export declare function isPendingResult(r: AgentResult | PendingResult): r is PendingResult;
//# sourceMappingURL=types.d.ts.map