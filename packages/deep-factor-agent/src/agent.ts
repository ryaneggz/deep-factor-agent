import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  HumanMessage,
  AIMessage,
  AIMessageChunk,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { initChatModel } from "langchain/chat_models/universal";
import { composeMiddleware, TOOL_NAME_WRITE_TODOS } from "./middleware.js";
import type { ComposedMiddleware } from "./middleware.js";
import { TOOL_NAME_REQUEST_HUMAN_INPUT } from "./human-in-the-loop.js";
import { evaluateStopConditions } from "./stop-conditions.js";
import { ContextManager } from "./context-manager.js";
import { serializeThreadToXml } from "./xml-serializer.js";
import { buildToolCallDisplay, buildToolResultDisplay } from "./tool-display.js";
import { getToolMetadata, toolArrayToMap } from "./tool-adapter.js";
import { performance } from "node:perf_hooks";
import type {
  AgentMode,
  AgentEvent,
  AgentExecutionUpdate,
  AgentThread,
  AgentResult,
  PlanResult,
  PendingResult,
  ResumeInput,
  TokenUsage,
  StopCondition,
  DeepFactorAgentSettings,
  ToolCallEvent,
  ToolResultEvent,
  ErrorEvent,
  CompletionEvent,
  HumanInputRequestedEvent,
  ApprovalDecision,
  AgentMiddleware,
  MiddlewareContext,
  ToolDisplayMetadata,
  ToolExecutionResult,
} from "./types.js";
import type { ModelAdapter, ModelInvocationUpdate } from "./providers/types.js";
import { isModelAdapter } from "./providers/types.js";

let threadCounter = 0;

function createThreadId(): string {
  return `thread_${Date.now()}_${++threadCounter}`;
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cacheReadTokens: (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0) || undefined,
    cacheWriteTokens: (a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0) || undefined,
  };
}

function extractUsage(response: AIMessage): TokenUsage {
  const meta =
    "usage_metadata" in response
      ? (response.usage_metadata as
          | {
              input_tokens?: number;
              output_tokens?: number;
              total_tokens?: number;
            }
          | undefined)
      : undefined;
  return {
    inputTokens: meta?.input_tokens ?? 0,
    outputTokens: meta?.output_tokens ?? 0,
    totalTokens: meta?.total_tokens ?? 0,
  };
}

interface TextContentBlock {
  type: "text";
  text: string;
}

function isTextContentBlock(block: unknown): block is TextContentBlock {
  return (
    typeof block === "object" &&
    block !== null &&
    "type" in block &&
    (block as TextContentBlock).type === "text" &&
    "text" in block
  );
}

function extractTextContent(content: string | unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block: unknown) => {
        if (typeof block === "string") return block;
        if (isTextContentBlock(block)) return block.text;
        return JSON.stringify(block);
      })
      .join("");
  }
  return JSON.stringify(content);
}

function compactError(error: unknown, maxLen = 500): string {
  const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return msg.length > maxLen ? msg.substring(0, maxLen) + "..." : msg;
}

function isToolExecutionResult(value: unknown): value is ToolExecutionResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "content" in value &&
    typeof (value as { content: unknown }).content === "string"
  );
}

function stringifyToolResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (isToolExecutionResult(result)) {
    return result.content;
  }
  return JSON.stringify(result);
}

function resolveToolResultDisplay(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
): ToolDisplayMetadata {
  if (isToolExecutionResult(result) && result.display) {
    return result.display;
  }
  return buildToolResultDisplay(toolName, args, stringifyToolResult(result));
}

interface ParsedPlanBlock {
  block: string;
  content: string;
}

interface ToolExecutionDecision {
  action: "execute" | "deny" | "request_approval";
  reason: string;
}

interface PendingHumanRequest {
  detail: string;
  event: HumanInputRequestedEvent;
}

interface ToolOutcome {
  kind: "continue" | "pending";
  resultEvent: ToolResultEvent;
  toolMessage: ToolMessage;
  pending?: PendingHumanRequest;
}

function parsePlanBlock(text: string): ParsedPlanBlock | null {
  const matches = text.match(/<proposed_plan>[\s\S]*?<\/proposed_plan>/g);
  if (!matches || matches.length !== 1) return null;
  const block = matches[0];
  const content = block
    .replace(/^<proposed_plan>\s*/, "")
    .replace(/\s*<\/proposed_plan>$/, "")
    .trim();
  if (!content) return null;
  return { block, content };
}

function normalizeResumeInput(input: string | ResumeInput): {
  response: string;
  decision?: ApprovalDecision;
} {
  if (typeof input === "string") {
    return { response: input };
  }
  return {
    response: input.response ?? "",
    decision: input.decision,
  };
}

function extractModelId(model: BaseChatModel): string {
  if ("modelName" in model && typeof model.modelName === "string") {
    return model.modelName;
  }
  if ("model" in model && typeof model.model === "string") {
    return model.model;
  }
  if ("name" in model && typeof model.name === "string") {
    return model.name;
  }
  return "unknown";
}

function createThread(): AgentThread {
  const now = Date.now();
  return {
    id: createThreadId(),
    events: [],
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

function createZeroUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

function maxUsageSnapshot(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: Math.max(a.inputTokens, b.inputTokens),
    outputTokens: Math.max(a.outputTokens, b.outputTokens),
    totalTokens: Math.max(a.totalTokens, b.totalTokens),
    cacheReadTokens:
      a.cacheReadTokens !== undefined || b.cacheReadTokens !== undefined
        ? Math.max(a.cacheReadTokens ?? 0, b.cacheReadTokens ?? 0)
        : undefined,
    cacheWriteTokens:
      a.cacheWriteTokens !== undefined || b.cacheWriteTokens !== undefined
        ? Math.max(a.cacheWriteTokens ?? 0, b.cacheWriteTokens ?? 0)
        : undefined,
  };
}

export class DeepFactorAgent<TTools extends StructuredToolInterface[] = StructuredToolInterface[]> {
  private modelOrString: BaseChatModel | ModelAdapter | string;
  private resolvedModel: BaseChatModel | ModelAdapter | null = null;
  private tools: TTools;
  private instructions: string;
  private stopConditions: StopCondition[];
  private verifyCompletion: DeepFactorAgentSettings["verifyCompletion"];
  private composedMiddleware: ComposedMiddleware;
  private interruptOn: string[];
  private contextManager: ContextManager;
  private onIterationStart?: (iteration: number) => void;
  private onIterationEnd?: (iteration: number, result: unknown) => void;
  private modelId: string;
  private maxToolCallsPerIteration: number;
  private contextMode: "standard" | "xml";
  private parallelToolCalls: boolean;
  private mode: AgentMode;
  private streamMode: "final" | "updates";
  private onUpdate?: (update: AgentExecutionUpdate) => void;

  constructor(settings: DeepFactorAgentSettings<TTools>) {
    this.modelOrString = settings.model;

    if (typeof settings.model === "string") {
      this.modelId = settings.model;
    } else if (isModelAdapter(settings.model)) {
      this.modelId = "cli-adapter";
    } else {
      this.modelId = extractModelId(settings.model);
    }

    this.tools = (settings.tools ?? []) as TTools;
    this.instructions = settings.instructions ?? "";
    this.verifyCompletion = settings.verifyCompletion;
    this.interruptOn = settings.interruptOn ?? [];
    this.onIterationStart = settings.onIterationStart;
    this.onIterationEnd = settings.onIterationEnd;
    this.maxToolCallsPerIteration = settings.maxToolCallsPerIteration ?? 20;
    this.contextMode = settings.contextMode ?? "standard";
    this.parallelToolCalls = settings.parallelToolCalls ?? false;
    this.mode = settings.mode ?? "yolo";
    this.streamMode = settings.streamMode ?? "final";
    this.onUpdate = settings.onUpdate;

    // Normalize stopWhen
    if (!settings.stopWhen) {
      this.stopConditions = [];
    } else if (Array.isArray(settings.stopWhen)) {
      this.stopConditions = settings.stopWhen;
    } else {
      this.stopConditions = [settings.stopWhen];
    }

    // Compose middleware
    const middlewareList: AgentMiddleware[] = settings.middleware ?? [];
    this.composedMiddleware = composeMiddleware(middlewareList);

    // Context management
    this.contextManager = new ContextManager(settings.contextManagement);
  }

  private emitUpdate(update: AgentExecutionUpdate): void {
    if (this.streamMode !== "updates" || !this.onUpdate) return;

    try {
      this.onUpdate({
        thread: {
          ...update.thread,
          events: [...update.thread.events],
          metadata: { ...update.thread.metadata },
        },
        usage: { ...update.usage },
        iterations: update.iterations,
        status: update.status,
        lastEvent: update.lastEvent,
        stopReason: update.stopReason,
      });
    } catch {
      // Ignore subscriber failures so UI bugs cannot abort agent execution.
    }
  }

  private appendEvent(
    thread: AgentThread,
    event: AgentEvent,
    update: Omit<AgentExecutionUpdate, "thread" | "lastEvent">,
    emit = true,
  ): void {
    thread.events.push(event);
    thread.updatedAt = event.timestamp;

    if (!emit) return;

    this.emitUpdate({
      thread,
      usage: update.usage,
      iterations: update.iterations,
      status: update.status,
      stopReason: update.stopReason,
      lastEvent: event,
    });
  }

  private emitUsageUpdate(
    thread: AgentThread,
    usage: TokenUsage,
    iterations: number,
    status: AgentExecutionUpdate["status"],
  ): void {
    this.emitUpdate({
      thread,
      usage,
      iterations,
      status,
    });
  }

  private async ensureModel(): Promise<BaseChatModel | ModelAdapter> {
    if (this.resolvedModel) return this.resolvedModel;
    if (typeof this.modelOrString === "string") {
      const resolved = await initChatModel(this.modelOrString);
      this.resolvedModel = resolved;
      return resolved;
    }
    // Both BaseChatModel and ModelAdapter pass through directly
    this.resolvedModel = this.modelOrString;
    return this.resolvedModel;
  }

  private buildMessages(thread: AgentThread): BaseMessage[] {
    const messages: BaseMessage[] = [];

    // Build context injection from summaries
    const contextInjection = this.contextManager.buildContextInjection(thread);
    const parallelHint = this.parallelToolCalls
      ? "When multiple independent tool calls can satisfy the request, batch them in a single response so they execute concurrently."
      : "";
    const modeInstructions = this.getModeInstructions();
    if (this.instructions || contextInjection || parallelHint || modeInstructions) {
      const system = [contextInjection, this.instructions, parallelHint, modeInstructions]
        .filter(Boolean)
        .join("\n\n");
      messages.push(new SystemMessage(system));
    }

    // Convert thread events to messages, batching consecutive tool_calls
    const events = thread.events;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      switch (event.type) {
        case "message": {
          if (event.role === "user") {
            messages.push(new HumanMessage(event.content));
          } else if (event.role === "assistant") {
            messages.push(new AIMessage(event.content));
          } else if (event.role === "system") {
            messages.push(new HumanMessage(`[System]: ${event.content}`));
          }
          break;
        }
        case "human_input_received": {
          messages.push(new HumanMessage(`[Human Response]: ${event.response}`));
          break;
        }
        case "summary": {
          // Summaries are injected via context injection in the system prompt
          break;
        }
        case "tool_call": {
          // Batch consecutive tool_call events into a single AIMessage
          const toolCalls = [{ id: event.toolCallId, name: event.toolName, args: event.args }];
          while (i + 1 < events.length && events[i + 1].type === "tool_call") {
            i++;
            const next = events[i] as ToolCallEvent;
            toolCalls.push({ id: next.toolCallId, name: next.toolName, args: next.args });
          }
          messages.push(
            new AIMessage({
              content: "",
              tool_calls: toolCalls,
            }),
          );
          break;
        }
        case "tool_result": {
          messages.push(
            new ToolMessage({
              tool_call_id: event.toolCallId,
              content: String(event.result),
            }),
          );
          break;
        }
        case "error": {
          const recoverStr = event.recoverable ? "recoverable" : "non-recoverable";
          messages.push(new HumanMessage(`[Error (${recoverStr})]: ${event.error}`));
          break;
        }
        case "completion":
        case "approval":
        case "plan":
        case "human_input_requested":
          break;
      }
    }

    return messages;
  }

  private buildXmlMessages(thread: AgentThread): BaseMessage[] {
    const messages: BaseMessage[] = [];

    // Build system prompt identically to standard mode
    const contextInjection = this.contextManager.buildContextInjection(thread);
    const parallelHint = this.parallelToolCalls
      ? "When multiple independent tool calls can satisfy the request, batch them in a single response so they execute concurrently."
      : "";
    const modeInstructions = this.getModeInstructions();
    if (this.instructions || contextInjection || parallelHint || modeInstructions) {
      const system = [contextInjection, this.instructions, parallelHint, modeInstructions]
        .filter(Boolean)
        .join("\n\n");
      messages.push(new SystemMessage(system));
    }

    // Serialize the entire thread into a single XML HumanMessage
    const xml = serializeThreadToXml(thread.events);
    messages.push(new HumanMessage(xml));

    return messages;
  }

  private getModeInstructions(): string {
    switch (this.mode) {
      case "plan":
        return [
          "Mode: plan.",
          "You are a planning assistant. Your ONLY job is to produce a plan.",
          "Do NOT call any tools that mutate state — they will be blocked.",
          "Read-only tools (e.g. reading files) are allowed when needed to inform the plan.",
          "Go directly to planning — no preamble or explanation outside the plan tags.",
          "Your response must contain exactly one <proposed_plan>...</proposed_plan> block.",
          "Example format:",
          "<proposed_plan>",
          "# Plan Title",
          "",
          "1. Step one",
          "2. Step two",
          "</proposed_plan>",
        ].join("\n");
      case "approve":
        return [
          "Mode: approve.",
          "Read-only tools may run normally.",
          "Mutating tools require user approval before execution.",
          "If a write is rejected or edited, revise your approach using the feedback.",
        ].join(" ");
      case "yolo":
      default:
        return "Mode: yolo. Execute normally.";
    }
  }

  private evaluateToolExecution(
    toolName: string,
    tool?: StructuredToolInterface,
  ): ToolExecutionDecision {
    const metadata = getToolMetadata(tool);
    const mutatesState = metadata?.mutatesState ?? true;

    if (metadata?.modeAvailability === "plan_only" && this.mode !== "plan") {
      return { action: "deny", reason: `Tool "${toolName}" is only available in plan mode.` };
    }
    if (metadata?.modeAvailability === "approve_only" && this.mode !== "approve") {
      return { action: "deny", reason: `Tool "${toolName}" is only available in approve mode.` };
    }
    if (metadata?.modeAvailability === "yolo_only" && this.mode !== "yolo") {
      return { action: "deny", reason: `Tool "${toolName}" is only available in yolo mode.` };
    }

    if (this.mode === "plan" && mutatesState) {
      return {
        action: "deny",
        reason: `Tool "${toolName}" is blocked in plan mode because it may mutate state.`,
      };
    }

    if (this.mode === "approve" && mutatesState) {
      return {
        action: "request_approval",
        reason: `Tool "${toolName}" requires approval before execution because it may mutate state.`,
      };
    }

    return { action: "execute", reason: "Tool execution allowed." };
  }

  private syncTodoMetadata(toolName: string, resultStr: string, thread: AgentThread): void {
    if (toolName !== TOOL_NAME_WRITE_TODOS) return;
    try {
      const parsed = JSON.parse(resultStr);
      if (parsed.todos) {
        thread.metadata.todos = parsed.todos;
      }
    } catch (parseError) {
      console.warn(
        `[deep-factor-agent] Failed to parse write_todos result: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      );
    }
  }

  private async invokeTool(
    tool: StructuredToolInterface,
    args: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    const rawExecutor = (tool as { executeRaw?: (input: unknown) => Promise<unknown> }).executeRaw;
    if (rawExecutor) {
      return rawExecutor(args ?? {});
    }
    return tool.invoke(args);
  }

  private createPendingResult(
    thread: AgentThread,
    usage: TokenUsage,
    iterations: number,
    response: string,
    prompt: string,
    detail: string,
  ): PendingResult {
    this.emitUpdate({
      thread,
      usage,
      iterations,
      status: "pending_input",
      stopReason: "human_input_needed",
    });

    return {
      response,
      thread,
      usage,
      iterations,
      stopReason: "human_input_needed",
      stopDetail: detail,
      resume: async (input: string | ResumeInput) => {
        const normalized = normalizeResumeInput(input);
        this.appendEvent(
          thread,
          {
            type: "human_input_received",
            response: normalized.response,
            decision: normalized.decision,
            timestamp: Date.now(),
            iteration: iterations,
          },
          { usage, iterations, status: "running" },
        );
        if (normalized.decision) {
          const toolCallEvent = [...thread.events]
            .reverse()
            .find((event) => event.type === "tool_call" && event.iteration === iterations);
          if (toolCallEvent?.type === "tool_call") {
            this.appendEvent(
              thread,
              {
                type: "approval",
                toolName: toolCallEvent.toolName,
                toolCallId: toolCallEvent.toolCallId,
                decision: normalized.decision,
                response: normalized.response || undefined,
                timestamp: Date.now(),
                iteration: iterations,
              },
              { usage, iterations, status: "running" },
              false,
            );
          }
          const feedback =
            normalized.decision === "approve"
              ? "Approved. Continue."
              : normalized.decision === "reject"
                ? `Rejected. ${normalized.response}`.trim()
                : `Edit required: ${normalized.response}`.trim();
          this.appendEvent(
            thread,
            {
              type: "message",
              role: "user",
              content: feedback,
              timestamp: Date.now(),
              iteration: iterations,
            },
            { usage, iterations, status: "running" },
          );
        }
        return this.runLoop(thread, prompt, iterations + 1);
      },
    };
  }

  private createPlanPendingResult(
    thread: AgentThread,
    usage: TokenUsage,
    iterations: number,
    planContent: string,
    prompt: string,
  ): PendingResult {
    const hirEvent: HumanInputRequestedEvent = {
      type: "human_input_requested",
      kind: "plan_review",
      question:
        "Review the proposed plan. Type 'approve' to accept, 'reject' to cancel, or provide feedback to revise.",
      format: "multiple_choice",
      choices: ["approve", "reject", "edit"],
      timestamp: Date.now(),
      iteration: iterations,
    };
    this.appendEvent(thread, hirEvent, { usage, iterations, status: "pending_input" });

    this.emitUpdate({
      thread,
      usage,
      iterations,
      status: "pending_input",
      stopReason: "human_input_needed",
    });

    return {
      response: planContent,
      thread,
      usage,
      iterations,
      stopReason: "human_input_needed",
      stopDetail: "Plan proposed — awaiting review",
      resume: async (input: string | ResumeInput) => {
        const normalized = normalizeResumeInput(input);
        const decision = normalized.decision ?? normalized.response;

        this.appendEvent(
          thread,
          {
            type: "human_input_received",
            response: typeof decision === "string" ? decision : normalized.response,
            timestamp: Date.now(),
            iteration: iterations,
          },
          { usage, iterations, status: "running" },
        );

        if (decision === "approve") {
          this.emitUpdate({
            thread,
            usage,
            iterations,
            status: "done",
            stopReason: "plan_completed",
          });

          return {
            mode: "plan" as const,
            plan: planContent,
            thread,
            usage,
            iterations,
            stopReason: "plan_completed" as const,
          };
        }

        if (decision === "reject") {
          this.emitUpdate({
            thread,
            usage,
            iterations,
            status: "done",
            stopReason: "completed",
          });

          return {
            response: planContent,
            thread,
            usage,
            iterations,
            stopReason: "completed" as const,
            stopDetail: "Plan rejected by user",
          };
        }

        // Revision: inject feedback and re-run the loop
        const feedback = normalized.response || (typeof decision === "string" ? decision : "");
        this.appendEvent(
          thread,
          {
            type: "message",
            role: "user",
            content: `Please revise the plan based on this feedback:\n${feedback}`,
            timestamp: Date.now(),
            iteration: iterations,
          },
          { usage, iterations, status: "running" },
        );
        return this.runLoop(thread, prompt, iterations + 1);
      },
    };
  }

  private async executeToolCall(
    tc: { name: string; args?: Record<string, unknown>; id?: string },
    foundTool: StructuredToolInterface | undefined,
    thread: AgentThread,
    iteration: number,
    usage: TokenUsage,
  ): Promise<ToolOutcome> {
    const toolCallId = tc.id ?? `call_${iteration}_${tc.name}`;
    const now = Date.now();

    if (tc.name === TOOL_NAME_REQUEST_HUMAN_INPUT) {
      const args = (tc.args ?? {}) as Record<string, unknown>;
      const hirEvent: HumanInputRequestedEvent = {
        type: "human_input_requested",
        kind: "question",
        question: (args.question as string) ?? "",
        context: args.context as string | undefined,
        urgency: args.urgency as "low" | "medium" | "high" | undefined,
        format: args.format as "free_text" | "yes_no" | "multiple_choice" | undefined,
        choices: args.choices as string[] | undefined,
        timestamp: now,
        iteration,
      };
      const resultEvent: ToolResultEvent = {
        type: "tool_result",
        toolCallId,
        result: "[Waiting for human input]",
        display: buildToolResultDisplay(tc.name, args, "[Waiting for human input]"),
        timestamp: now,
        iteration,
      };
      this.appendEvent(thread, hirEvent, { usage, iterations: iteration, status: "pending_input" });
      this.appendEvent(thread, resultEvent, {
        usage,
        iterations: iteration,
        status: "pending_input",
      });
      return {
        kind: "pending",
        resultEvent,
        toolMessage: new ToolMessage({
          tool_call_id: toolCallId,
          content: "[Waiting for human input]",
        }),
        pending: {
          detail: "Human input requested",
          event: hirEvent,
        },
      };
    }

    if (this.interruptOn.includes(tc.name)) {
      const resultEvent: ToolResultEvent = {
        type: "tool_result",
        toolCallId,
        result: `[Tool "${tc.name}" not executed — interrupted for human approval]`,
        display: buildToolResultDisplay(
          tc.name,
          (tc.args ?? {}) as Record<string, unknown>,
          `[Tool "${tc.name}" not executed — interrupted for human approval]`,
        ),
        timestamp: now,
        iteration,
      };
      const hirEvent: HumanInputRequestedEvent = {
        type: "human_input_requested",
        kind: "approval",
        question: `Tool "${tc.name}" requires approval before execution.`,
        approvalRequest: {
          toolName: tc.name,
          toolCallId,
          args: (tc.args ?? {}) as Record<string, unknown>,
          reason: `Tool "${tc.name}" was interrupted for approval.`,
        },
        timestamp: now,
        iteration,
      };
      this.appendEvent(thread, resultEvent, { usage, iterations: iteration, status: "running" });
      this.appendEvent(thread, hirEvent, { usage, iterations: iteration, status: "pending_input" });
      return {
        kind: "pending",
        resultEvent,
        toolMessage: new ToolMessage({
          tool_call_id: toolCallId,
          content: String(resultEvent.result),
        }),
        pending: {
          detail: `Interrupted: tool "${tc.name}" requires approval`,
          event: hirEvent,
        },
      };
    }

    const decision = this.evaluateToolExecution(tc.name, foundTool);
    if (decision.action === "deny") {
      const resultEvent: ToolResultEvent = {
        type: "tool_result",
        toolCallId,
        result: decision.reason,
        display: buildToolResultDisplay(
          tc.name,
          (tc.args ?? {}) as Record<string, unknown>,
          decision.reason,
        ),
        timestamp: now,
        iteration,
      };
      this.appendEvent(thread, resultEvent, { usage, iterations: iteration, status: "running" });
      return {
        kind: "continue",
        resultEvent,
        toolMessage: new ToolMessage({ tool_call_id: toolCallId, content: decision.reason }),
      };
    }

    if (decision.action === "request_approval") {
      const resultEvent: ToolResultEvent = {
        type: "tool_result",
        toolCallId,
        result: `[Tool "${tc.name}" not executed — awaiting approval]`,
        display: buildToolResultDisplay(
          tc.name,
          (tc.args ?? {}) as Record<string, unknown>,
          `[Tool "${tc.name}" not executed — awaiting approval]`,
        ),
        timestamp: now,
        iteration,
      };
      const hirEvent: HumanInputRequestedEvent = {
        type: "human_input_requested",
        kind: "approval",
        question: `Approve running "${tc.name}"?`,
        format: "multiple_choice",
        choices: ["approve", "reject", "edit"],
        approvalRequest: {
          toolName: tc.name,
          toolCallId,
          args: (tc.args ?? {}) as Record<string, unknown>,
          reason: decision.reason,
        },
        timestamp: now,
        iteration,
      };
      this.appendEvent(thread, resultEvent, { usage, iterations: iteration, status: "running" });
      this.appendEvent(thread, hirEvent, { usage, iterations: iteration, status: "pending_input" });
      return {
        kind: "pending",
        resultEvent,
        toolMessage: new ToolMessage({
          tool_call_id: toolCallId,
          content: String(resultEvent.result),
        }),
        pending: {
          detail: `Approval required for tool "${tc.name}"`,
          event: hirEvent,
        },
      };
    }

    const start = performance.now();
    if (!foundTool) {
      const resultEvent: ToolResultEvent = {
        type: "tool_result",
        toolCallId,
        result: `Tool not found: "${tc.name}"`,
        display: buildToolResultDisplay(
          tc.name,
          (tc.args ?? {}) as Record<string, unknown>,
          `Tool not found: "${tc.name}"`,
        ),
        timestamp: now,
        iteration,
      };
      this.appendEvent(thread, resultEvent, { usage, iterations: iteration, status: "running" });
      return {
        kind: "continue",
        resultEvent,
        toolMessage: new ToolMessage({
          tool_call_id: toolCallId,
          content: String(resultEvent.result),
        }),
      };
    }

    try {
      const toolResult = await this.invokeTool(
        foundTool,
        (tc.args ?? {}) as Record<string, unknown>,
      );
      const resultStr = stringifyToolResult(toolResult);
      const durationMs = Math.round(performance.now() - start);
      this.syncTodoMetadata(tc.name, resultStr, thread);
      const resultEvent: ToolResultEvent = {
        type: "tool_result",
        toolCallId,
        result: resultStr,
        display: resolveToolResultDisplay(
          tc.name,
          (tc.args ?? {}) as Record<string, unknown>,
          toolResult,
        ),
        timestamp: now,
        iteration,
        durationMs,
      };
      this.appendEvent(thread, resultEvent, { usage, iterations: iteration, status: "running" });
      return {
        kind: "continue",
        resultEvent,
        toolMessage: new ToolMessage({ tool_call_id: toolCallId, content: resultStr }),
      };
    } catch (error) {
      const resultEvent: ToolResultEvent = {
        type: "tool_result",
        toolCallId,
        result: `Tool error: ${compactError(error)}`,
        display: buildToolResultDisplay(
          tc.name,
          (tc.args ?? {}) as Record<string, unknown>,
          `Tool error: ${compactError(error)}`,
        ),
        timestamp: now,
        iteration,
        durationMs: Math.round(performance.now() - start),
      };
      this.appendEvent(thread, resultEvent, { usage, iterations: iteration, status: "running" });
      return {
        kind: "continue",
        resultEvent,
        toolMessage: new ToolMessage({
          tool_call_id: toolCallId,
          content: String(resultEvent.result),
        }),
      };
    }
  }

  private checkInterruptOn(thread: AgentThread, iteration: number): string | null {
    if (this.interruptOn.length === 0) return null;

    for (let i = thread.events.length - 1; i >= 0; i--) {
      const event = thread.events[i];
      if (event.iteration !== iteration) break;
      if (event.type === "tool_call" && this.interruptOn.includes(event.toolName)) {
        return event.toolName;
      }
    }
    return null;
  }

  async loop(prompt: string): Promise<AgentResult | PendingResult | PlanResult> {
    const thread = createThread();
    return this.runLoop(thread, prompt, 1);
  }

  /**
   * Continue an existing thread with a new user prompt.
   * Reuses the thread's full conversation history so the model retains
   * multi-turn context across calls.
   */
  async continueLoop(
    thread: AgentThread,
    prompt: string,
  ): Promise<AgentResult | PendingResult | PlanResult> {
    const nextIteration = thread.events.reduce((max, e) => Math.max(max, e.iteration), 0) + 1;
    this.appendEvent(
      thread,
      {
        type: "message",
        role: "user",
        content: prompt,
        timestamp: Date.now(),
        iteration: nextIteration,
      },
      { usage: createZeroUsage(), iterations: nextIteration, status: "running" },
    );
    return this.runLoop(thread, prompt, nextIteration);
  }

  private async runLoop(
    thread: AgentThread,
    prompt: string,
    startIteration: number,
  ): Promise<AgentResult | PendingResult | PlanResult> {
    const model = await this.ensureModel();

    // Push initial user message (only if this is the first call, not a resume)
    if (startIteration === 1) {
      this.appendEvent(
        thread,
        {
          type: "message",
          role: "user",
          content: prompt,
          timestamp: Date.now(),
          iteration: 0,
        },
        { usage: createZeroUsage(), iterations: startIteration, status: "running" },
      );
    }

    let totalUsage: TokenUsage = createZeroUsage();
    let iteration = startIteration;
    let consecutiveErrors = 0;
    let lastResponse = "";

    // Merge middleware tools with user tools
    const allTools: StructuredToolInterface[] = [...this.tools, ...this.composedMiddleware.tools];
    const toolMap = toolArrayToMap(allTools);

    while (true) {
      // Callback
      this.onIterationStart?.(iteration);

      // Middleware: beforeIteration
      const middlewareCtx: MiddlewareContext = {
        thread,
        iteration,
        settings: {
          model: this.modelOrString,
          tools: this.tools,
          instructions: this.instructions,
        } as DeepFactorAgentSettings,
      };
      await this.composedMiddleware.beforeIteration(middlewareCtx);

      // Context management: check if summarization needed
      // Summarization requires BaseChatModel (not ModelAdapter) for LLM calls
      if (this.contextManager.needsSummarization(thread) && !isModelAdapter(model)) {
        const { usage: summarizationUsage } = await this.contextManager.summarize(thread, model);
        totalUsage = addUsage(totalUsage, summarizationUsage);
      }

      // Build messages from thread
      const messages =
        this.contextMode === "xml" ? this.buildXmlMessages(thread) : this.buildMessages(thread);

      let liveErrorMessage: string | null = null;
      let iterationUsage: TokenUsage = createZeroUsage();
      let currentStepUsage: TokenUsage = createZeroUsage();
      let stepCount = 0;
      const emittedToolCallIds = new Set<string>();
      const emittedAssistantContents = new Set<string>();
      const emittedPlanContents = new Set<string>();

      const currentUsageSnapshot = (): TokenUsage =>
        addUsage(totalUsage, addUsage(iterationUsage, currentStepUsage));

      const appendAssistantOrPlanEvent = (
        content: string,
        emitStatus: AgentExecutionUpdate["status"] = "running",
      ): void => {
        const normalized = content.trim();
        if (!normalized) {
          return;
        }

        if (this.mode === "plan") {
          const streamedPlan = parsePlanBlock(normalized);
          if (streamedPlan) {
            if (emittedPlanContents.has(streamedPlan.content)) {
              return;
            }
            emittedPlanContents.add(streamedPlan.content);
            this.appendEvent(
              thread,
              {
                type: "plan",
                content: streamedPlan.content,
                timestamp: Date.now(),
                iteration,
              },
              { usage: currentUsageSnapshot(), iterations: iteration, status: emitStatus },
            );
            return;
          }
        }

        if (emittedAssistantContents.has(normalized)) {
          return;
        }

        emittedAssistantContents.add(normalized);
        this.appendEvent(
          thread,
          {
            type: "message",
            role: "assistant",
            content: normalized,
            timestamp: Date.now(),
            iteration,
          },
          { usage: currentUsageSnapshot(), iterations: iteration, status: emitStatus },
        );
      };

      const appendToolCallIfNew = (
        tc: { name: string; args?: Record<string, unknown>; id?: string },
        timestamp = Date.now(),
      ): void => {
        const toolCallId = tc.id ?? `call_${stepCount}_${tc.name}`;
        if (emittedToolCallIds.has(toolCallId)) {
          return;
        }
        emittedToolCallIds.add(toolCallId);
        this.appendEvent(
          thread,
          {
            type: "tool_call",
            toolName: tc.name,
            toolCallId,
            args: (tc.args ?? {}) as Record<string, unknown>,
            display: buildToolCallDisplay(tc.name, (tc.args ?? {}) as Record<string, unknown>),
            timestamp,
            iteration,
          },
          { usage: currentUsageSnapshot(), iterations: iteration, status: "running" },
        );
      };

      try {
        // Bind tools and run inner tool-calling loop
        const modelWithTools =
          allTools.length > 0 && "bindTools" in model && model.bindTools
            ? model.bindTools(allTools)
            : model;

        let pendingRequest: PendingHumanRequest | null = null;
        let lastAIResponse: AIMessage | null = null;

        while (stepCount < this.maxToolCallsPerIteration) {
          currentStepUsage = createZeroUsage();

          const response =
            isModelAdapter(modelWithTools) &&
            this.streamMode === "updates" &&
            typeof modelWithTools.invokeWithUpdates === "function"
              ? await modelWithTools.invokeWithUpdates(
                  messages,
                  (update: ModelInvocationUpdate) => {
                    switch (update.type) {
                      case "tool_call":
                        appendToolCallIfNew(update.toolCall, Date.now());
                        break;
                      case "assistant_message":
                        appendAssistantOrPlanEvent(update.content);
                        break;
                      case "usage":
                        currentStepUsage = maxUsageSnapshot(currentStepUsage, update.usage);
                        this.emitUsageUpdate(thread, currentUsageSnapshot(), iteration, "running");
                        break;
                      case "final":
                        if (update.usage) {
                          currentStepUsage = maxUsageSnapshot(currentStepUsage, update.usage);
                          this.emitUsageUpdate(
                            thread,
                            currentUsageSnapshot(),
                            iteration,
                            "running",
                          );
                        }
                        break;
                      case "error": {
                        liveErrorMessage = update.error;
                        const recoverable = consecutiveErrors + 1 < 3;
                        this.appendEvent(
                          thread,
                          {
                            type: "error",
                            error: update.error,
                            recoverable,
                            timestamp: Date.now(),
                            iteration,
                          },
                          {
                            usage: currentUsageSnapshot(),
                            iterations: iteration,
                            status: recoverable ? "running" : "error",
                            stopReason: recoverable ? undefined : "max_errors",
                          },
                        );
                        break;
                      }
                    }
                  },
                )
              : ((await modelWithTools.invoke(messages)) as AIMessage);
          messages.push(response);
          lastAIResponse = response;

          // Accumulate usage from this step
          const stepUsage = extractUsage(response);
          currentStepUsage = maxUsageSnapshot(currentStepUsage, stepUsage);

          const toolCalls = response.tool_calls ?? [];
          if (toolCalls.length === 0) break;

          // Record and execute tool calls
          const now = Date.now();

          if (this.parallelToolCalls && toolCalls.length > 0) {
            // --- Parallel execution path ---
            // Partition tool calls into parallel-safe and sequential (HITL / gated writes)
            const parallelBatch: typeof toolCalls = [];
            const sequentialBatch: typeof toolCalls = [];
            for (const tc of toolCalls) {
              const foundTool = toolMap[tc.name];
              const decision = this.evaluateToolExecution(tc.name, foundTool);
              if (
                tc.name === TOOL_NAME_REQUEST_HUMAN_INPUT ||
                this.interruptOn.includes(tc.name) ||
                decision.action !== "execute"
              ) {
                sequentialBatch.push(tc);
              } else {
                parallelBatch.push(tc);
              }
            }

            // Generate a parallelGroup ID for this batch
            const groupId =
              parallelBatch.length > 1 ? `pg_${iteration}_${stepCount}_${Date.now()}` : undefined;

            // Record ToolCallEvents for parallel batch upfront
            for (const tc of parallelBatch) {
              appendToolCallIfNew(tc, now);
            }

            // Execute parallel batch via Promise.all with per-tool timing
            const parallelResults = await Promise.all(
              parallelBatch.map(async (tc) => {
                const toolCallId = tc.id ?? `call_${stepCount}_${tc.name}`;
                const foundTool = toolMap[tc.name];
                const start = performance.now();
                if (foundTool) {
                  try {
                    const toolResult = await this.invokeTool(
                      foundTool,
                      (tc.args ?? {}) as Record<string, unknown>,
                    );
                    const resultStr = stringifyToolResult(toolResult);
                    const durationMs = Math.round(performance.now() - start);
                    this.syncTodoMetadata(tc.name, resultStr, thread);

                    return { toolCallId, result: toolResult, durationMs, tc };
                  } catch (err) {
                    const durationMs = Math.round(performance.now() - start);
                    const errorMsg = `Tool error: ${compactError(err)}`;
                    return { toolCallId, result: errorMsg, durationMs, tc };
                  }
                } else {
                  const durationMs = Math.round(performance.now() - start);
                  const errorMsg = `Tool not found: "${tc.name}"`;
                  return { toolCallId, result: errorMsg, durationMs, tc };
                }
              }),
            );

            // Record ToolResultEvents + push ToolMessages in original order
            for (const pr of parallelResults) {
              const resultStr = stringifyToolResult(pr.result);
              const toolResultEvent: ToolResultEvent = {
                type: "tool_result",
                toolCallId: pr.toolCallId,
                result: resultStr,
                display: resolveToolResultDisplay(
                  pr.tc.name,
                  (pr.tc.args ?? {}) as Record<string, unknown>,
                  pr.result,
                ),
                timestamp: Date.now(),
                iteration,
                durationMs: pr.durationMs,
                parallelGroup: groupId,
              };
              this.appendEvent(thread, toolResultEvent, {
                usage: currentUsageSnapshot(),
                iterations: iteration,
                status: "running",
              });
              messages.push(
                new ToolMessage({
                  tool_call_id: pr.toolCallId,
                  content: resultStr,
                }),
              );
            }

            // Handle sequential tools (HITL / interruptOn) after parallel batch
            for (const tc of sequentialBatch) {
              appendToolCallIfNew(tc, Date.now());
              const outcome = await this.executeToolCall(
                tc,
                toolMap[tc.name],
                thread,
                iteration,
                currentUsageSnapshot(),
              );
              messages.push(outcome.toolMessage);
              if (outcome.kind === "pending") {
                pendingRequest = outcome.pending ?? null;
                break;
              }
            }
          } else {
            // --- Sequential execution path (original logic) ---
            for (const tc of toolCalls) {
              appendToolCallIfNew(tc, now);
              const outcome = await this.executeToolCall(
                tc,
                toolMap[tc.name],
                thread,
                iteration,
                currentUsageSnapshot(),
              );
              messages.push(outcome.toolMessage);
              if (outcome.kind === "pending") {
                pendingRequest = outcome.pending ?? null;
                break;
              }
            }
          }

          if (pendingRequest) break;
          iterationUsage = addUsage(iterationUsage, currentStepUsage);
          currentStepUsage = createZeroUsage();
          stepCount++;
        }

        // Extract response text
        if (lastAIResponse) {
          lastResponse = extractTextContent(lastAIResponse.content);
        }

        const parsedPlan = this.mode === "plan" ? parsePlanBlock(lastResponse) : null;

        if (lastResponse) {
          if (this.mode === "plan" && parsedPlan) {
            if (!emittedPlanContents.has(parsedPlan.content)) {
              emittedPlanContents.add(parsedPlan.content);
              this.appendEvent(
                thread,
                {
                  type: "plan",
                  content: parsedPlan.content,
                  timestamp: Date.now(),
                  iteration,
                },
                { usage: currentUsageSnapshot(), iterations: iteration, status: "running" },
              );
            }
          } else {
            appendAssistantOrPlanEvent(lastResponse);
          }
        }

        // Accumulate usage
        iterationUsage = addUsage(iterationUsage, currentStepUsage);
        currentStepUsage = createZeroUsage();
        totalUsage = addUsage(totalUsage, iterationUsage);
        this.emitUsageUpdate(thread, totalUsage, iteration, "running");

        // Reset consecutive errors on success
        consecutiveErrors = 0;

        // Middleware: afterIteration
        await this.composedMiddleware.afterIteration(middlewareCtx, lastAIResponse);

        // Callback
        this.onIterationEnd?.(iteration, lastAIResponse);

        // Evaluate stop conditions
        const stopResult = evaluateStopConditions(this.stopConditions, {
          iteration,
          usage: totalUsage,
          model: this.modelId,
          thread,
        });

        if (stopResult) {
          this.emitUpdate({
            thread,
            usage: totalUsage,
            iterations: iteration,
            status: "done",
            stopReason: "stop_condition",
          });
          return {
            response: lastResponse,
            thread,
            usage: totalUsage,
            iterations: iteration,
            stopReason: "stop_condition",
            stopDetail: stopResult.reason,
          };
        }

        // Check human input request (must be checked BEFORE interruptOn so
        // the model's actual question/choices take priority over the generic
        // interruptOn message when requestHumanInput is in the interruptOn list)
        if (pendingRequest) {
          return this.createPendingResult(
            thread,
            totalUsage,
            iteration,
            lastResponse,
            prompt,
            pendingRequest.detail,
          );
        }

        // Verification
        if (this.verifyCompletion) {
          const verifyResult = await this.verifyCompletion({
            result: lastResponse,
            iteration,
            thread,
            originalPrompt: prompt,
          });

          if (verifyResult.complete) {
            const completionEvent: CompletionEvent = {
              type: "completion",
              result: lastResponse,
              verified: true,
              timestamp: Date.now(),
              iteration,
            };
            this.appendEvent(thread, completionEvent, {
              usage: totalUsage,
              iterations: iteration,
              status: "done",
              stopReason: "completed",
            });

            this.emitUpdate({
              thread,
              usage: totalUsage,
              iterations: iteration,
              status: "done",
              stopReason: "completed",
            });

            return {
              response: lastResponse,
              thread,
              usage: totalUsage,
              iterations: iteration,
              stopReason: "completed",
            };
          }

          // Verification failed - inject feedback and continue
          if (verifyResult.reason) {
            this.appendEvent(
              thread,
              {
                type: "message",
                role: "user",
                content: `Verification failed: ${verifyResult.reason}. Please try again.`,
                timestamp: Date.now(),
                iteration,
              },
              { usage: totalUsage, iterations: iteration, status: "running" },
            );
          }
        } else {
          // No verification function - single iteration mode
          const completionEvent: CompletionEvent = {
            type: "completion",
            result: lastResponse,
            verified: false,
            timestamp: Date.now(),
            iteration,
          };
          this.appendEvent(thread, completionEvent, {
            usage: totalUsage,
            iterations: iteration,
            status: this.mode === "plan" ? "running" : "done",
            stopReason: this.mode === "plan" ? undefined : "completed",
          });

          if (this.mode === "plan") {
            if (!parsedPlan) {
              this.appendEvent(
                thread,
                {
                  type: "message",
                  role: "user",
                  content:
                    "Plan mode requires exactly one <proposed_plan>...</proposed_plan> block. Try again.",
                  timestamp: Date.now(),
                  iteration,
                },
                { usage: totalUsage, iterations: iteration, status: "running" },
              );
              iteration++;
              continue;
            }
            if (!emittedPlanContents.has(parsedPlan.content)) {
              emittedPlanContents.add(parsedPlan.content);
              this.appendEvent(
                thread,
                {
                  type: "plan",
                  content: parsedPlan.content,
                  timestamp: Date.now(),
                  iteration,
                },
                { usage: totalUsage, iterations: iteration, status: "running" },
              );
            }
            return this.createPlanPendingResult(
              thread,
              totalUsage,
              iteration,
              parsedPlan.content,
              prompt,
            );
          }

          this.emitUpdate({
            thread,
            usage: totalUsage,
            iterations: iteration,
            status: "done",
            stopReason: "completed",
          });

          return {
            response: lastResponse,
            thread,
            usage: totalUsage,
            iterations: iteration,
            stopReason: "completed",
          };
        }
      } catch (error) {
        consecutiveErrors++;
        const isRecoverable = consecutiveErrors < 3;
        const currentError = compactError(error);
        const compactLiveError = liveErrorMessage
          ? compactError(new Error(liveErrorMessage))
          : null;
        const errorUsage = addUsage(iterationUsage, currentStepUsage);
        totalUsage = addUsage(totalUsage, errorUsage);

        if (compactLiveError !== currentError) {
          const errorEvent: ErrorEvent = {
            type: "error",
            error: currentError,
            recoverable: isRecoverable,
            timestamp: Date.now(),
            iteration,
          };
          this.appendEvent(thread, errorEvent, {
            usage: totalUsage,
            iterations: iteration,
            status: isRecoverable ? "running" : "error",
            stopReason: isRecoverable ? undefined : "max_errors",
          });
        }

        // Middleware: afterIteration (even on error)
        await this.composedMiddleware.afterIteration(middlewareCtx, error);

        // Callback
        this.onIterationEnd?.(iteration, error);

        if (!isRecoverable) {
          this.emitUpdate({
            thread,
            usage: totalUsage,
            iterations: iteration,
            status: "error",
            stopReason: "max_errors",
          });
          return {
            response: lastResponse,
            thread,
            usage: totalUsage,
            iterations: iteration,
            stopReason: "max_errors",
            stopDetail: `${consecutiveErrors} consecutive errors: ${liveErrorMessage ?? currentError}`,
          };
        }

        // Continue to retry
      }

      iteration++;
    }
  }

  async stream(prompt: string): Promise<AsyncIterable<AIMessageChunk>> {
    if (this.mode !== "yolo") {
      throw new Error(`Streaming is only supported in yolo mode. Current mode: ${this.mode}.`);
    }
    const model = await this.ensureModel();

    if (isModelAdapter(model)) {
      throw new Error("Streaming is not supported for ModelAdapter providers. Use loop() instead.");
    }

    const thread = createThread();

    // Push initial user message
    thread.events.push({
      type: "message",
      role: "user",
      content: prompt,
      timestamp: Date.now(),
      iteration: 0,
    });

    const allTools: StructuredToolInterface[] = [...this.tools, ...this.composedMiddleware.tools];

    const messages =
      this.contextMode === "xml" ? this.buildXmlMessages(thread) : this.buildMessages(thread);

    const modelWithTools =
      allTools.length > 0 && model.bindTools ? model.bindTools(allTools) : model;

    return modelWithTools.stream(messages);
  }
}
