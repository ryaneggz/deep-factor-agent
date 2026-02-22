import type { LanguageModel, ToolSet } from "ai";
import { generateText, streamText, stepCountIs } from "ai";
import type { ModelMessage } from "@ai-sdk/provider-utils";
import { composeMiddleware } from "./middleware.js";
import type { ComposedMiddleware } from "./middleware.js";
import { evaluateStopConditions } from "./stop-conditions.js";
import { ContextManager } from "./context-manager.js";
import type {
  AgentThread,
  AgentResult,
  PendingResult,
  TokenUsage,
  StopCondition,
  DeepFactorAgentSettings,
  ToolCallEvent,
  ToolResultEvent,
  MessageEvent as AgentMessageEvent,
  ErrorEvent,
  CompletionEvent,
  HumanInputRequestedEvent,
  HumanInputReceivedEvent,
  AgentMiddleware,
  MiddlewareContext,
} from "./types.js";

let threadCounter = 0;

function createThreadId(): string {
  return `thread_${Date.now()}_${++threadCounter}`;
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cacheReadTokens:
      (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0) || undefined,
    cacheWriteTokens:
      (a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0) || undefined,
  };
}

function extractUsage(sdkUsage: {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
  inputTokenDetails?: {
    cacheReadTokens?: number | undefined;
    cacheWriteTokens?: number | undefined;
  };
}): TokenUsage {
  return {
    inputTokens: sdkUsage.inputTokens ?? 0,
    outputTokens: sdkUsage.outputTokens ?? 0,
    totalTokens: sdkUsage.totalTokens ?? 0,
    cacheReadTokens:
      sdkUsage.inputTokenDetails?.cacheReadTokens ?? undefined,
    cacheWriteTokens:
      sdkUsage.inputTokenDetails?.cacheWriteTokens ?? undefined,
  };
}

function compactError(error: unknown, maxLen = 500): string {
  const msg =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);
  return msg.length > maxLen ? msg.substring(0, maxLen) + "..." : msg;
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

export class DeepFactorAgent<TTools extends ToolSet = ToolSet> {
  private model: LanguageModel;
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

  constructor(settings: DeepFactorAgentSettings<TTools>) {
    if (typeof settings.model === "string") {
      throw new Error(
        "String model IDs are not supported. Please pass a LanguageModel instance.",
      );
    }
    this.model = settings.model;
    this.modelId =
      typeof settings.model === "object" &&
      "modelId" in settings.model
        ? settings.model.modelId
        : "unknown";
    this.tools = (settings.tools ?? {}) as TTools;
    this.instructions = settings.instructions ?? "";
    this.verifyCompletion = settings.verifyCompletion;
    this.interruptOn = settings.interruptOn ?? [];
    this.onIterationStart = settings.onIterationStart;
    this.onIterationEnd = settings.onIterationEnd;

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

  private buildMessages(thread: AgentThread): {
    system: string | undefined;
    messages: ModelMessage[];
  } {
    const messages: ModelMessage[] = [];

    // Build context injection from summaries
    const contextInjection =
      this.contextManager.buildContextInjection(thread);
    let system: string | undefined;
    if (this.instructions || contextInjection) {
      system = [contextInjection, this.instructions]
        .filter(Boolean)
        .join("\n\n");
    }

    // Convert thread events to messages
    for (const event of thread.events) {
      switch (event.type) {
        case "message": {
          if (event.role === "user") {
            messages.push({ role: "user", content: event.content });
          } else if (event.role === "assistant") {
            messages.push({ role: "assistant", content: event.content });
          } else if (event.role === "system") {
            // System messages injected as user messages with context marker
            messages.push({
              role: "user",
              content: `[System]: ${event.content}`,
            });
          }
          break;
        }
        case "tool_call": {
          // Tool calls are part of assistant messages - we'll let the SDK handle multi-step
          // They are included through the response.messages history
          break;
        }
        case "tool_result": {
          // Tool results are part of tool messages - handled by SDK
          break;
        }
        case "human_input_received": {
          messages.push({
            role: "user",
            content: `[Human Response]: ${event.response}`,
          });
          break;
        }
        case "summary": {
          // Summaries are injected via context injection in the system prompt
          break;
        }
        default:
          break;
      }
    }

    return { system, messages };
  }

  private appendResultEvents(
    thread: AgentThread,
    result: {
      text: string;
      steps: Array<{
        toolCalls: Array<{
          toolCallId: string;
          toolName: string;
          input?: unknown;
          args?: unknown;
        }>;
        toolResults: Array<{
          toolCallId: string;
          toolName?: string;
          output?: unknown;
          result?: unknown;
        }>;
        text: string;
      }>;
    },
    iteration: number,
  ): void {
    const now = Date.now();

    for (const step of result.steps) {
      // Record tool calls
      for (const tc of step.toolCalls) {
        const toolCallEvent: ToolCallEvent = {
          type: "tool_call",
          toolName: tc.toolName,
          toolCallId: tc.toolCallId,
          args: (tc.input ?? tc.args ?? {}) as Record<string, unknown>,
          timestamp: now,
          iteration,
        };
        thread.events.push(toolCallEvent);
      }

      // Record tool results
      for (const tr of step.toolResults) {
        const toolResultEvent: ToolResultEvent = {
          type: "tool_result",
          toolCallId: tr.toolCallId,
          result: tr.output ?? tr.result,
          timestamp: now,
          iteration,
        };
        thread.events.push(toolResultEvent);
      }
    }

    // Record assistant message
    if (result.text) {
      const messageEvent: AgentMessageEvent = {
        type: "message",
        role: "assistant",
        content: result.text,
        timestamp: now,
        iteration,
      };
      thread.events.push(messageEvent);
    }

    thread.updatedAt = now;
  }

  private isPendingHumanInput(thread: AgentThread): boolean {
    // Check if the last relevant event is a human input request without a response
    const requestEvents = thread.events.filter(
      (e) => e.type === "human_input_requested",
    );
    const responseEvents = thread.events.filter(
      (e) => e.type === "human_input_received",
    );
    return requestEvents.length > responseEvents.length;
  }

  private getLastHumanInputRequest(
    thread: AgentThread,
  ): HumanInputRequestedEvent | undefined {
    for (let i = thread.events.length - 1; i >= 0; i--) {
      if (thread.events[i].type === "human_input_requested") {
        return thread.events[i] as HumanInputRequestedEvent;
      }
    }
    return undefined;
  }

  private checkInterruptOn(
    thread: AgentThread,
    iteration: number,
  ): string | null {
    // Check if any tool call in the current iteration matches interruptOn list
    if (this.interruptOn.length === 0) return null;

    for (let i = thread.events.length - 1; i >= 0; i--) {
      const event = thread.events[i];
      if (event.iteration !== iteration) break;
      if (
        event.type === "tool_call" &&
        this.interruptOn.includes(event.toolName)
      ) {
        return event.toolName;
      }
    }
    return null;
  }

  async loop(prompt: string): Promise<AgentResult | PendingResult> {
    const thread = createThread();
    return this.runLoop(thread, prompt, 1);
  }

  private async runLoop(
    thread: AgentThread,
    prompt: string,
    startIteration: number,
  ): Promise<AgentResult | PendingResult> {
    // Push initial user message (only if this is the first call, not a resume)
    if (startIteration === 1) {
      thread.events.push({
        type: "message",
        role: "user",
        content: prompt,
        timestamp: Date.now(),
        iteration: 0,
      });
    }

    let totalUsage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    let iteration = startIteration;
    let consecutiveErrors = 0;
    let lastResponse = "";

    // Merge middleware tools with user tools
    const allTools = {
      ...this.tools,
      ...this.composedMiddleware.tools,
    } as ToolSet;

    while (true) {
      // Callback
      this.onIterationStart?.(iteration);

      // Middleware: beforeIteration
      const middlewareCtx: MiddlewareContext = {
        thread,
        iteration,
        settings: {
          model: this.model,
          tools: this.tools,
          instructions: this.instructions,
        } as DeepFactorAgentSettings,
      };
      await this.composedMiddleware.beforeIteration(middlewareCtx);

      // Context management: check if summarization needed
      if (this.contextManager.needsSummarization(thread)) {
        await this.contextManager.summarize(thread, this.model);
      }

      // Build messages from thread
      const { system, messages } = this.buildMessages(thread);

      try {
        const result = await generateText({
          model: this.model,
          system,
          messages,
          tools: allTools,
          stopWhen: stepCountIs(20),
        });

        // Append events
        this.appendResultEvents(thread, result as any, iteration);

        // Extract and accumulate usage
        const iterUsage = extractUsage(result.totalUsage);
        totalUsage = addUsage(totalUsage, iterUsage);

        lastResponse = result.text;

        // Handle todoMiddleware: store todos in thread metadata
        for (const step of result.steps) {
          for (const tr of step.toolResults as any[]) {
            if (tr.toolName === "write_todos" && tr.output?.todos) {
              thread.metadata.todos = tr.output.todos;
            }
            if (tr.toolName === "read_todos") {
              // Inject current todos into the result
              (tr as any).output = {
                todos: thread.metadata.todos ?? [],
              };
            }
          }
        }

        // Check for requestHumanInput tool call
        let humanInputRequested = false;
        for (const step of result.steps) {
          for (const tc of step.toolCalls as any[]) {
            if (tc.toolName === "requestHumanInput") {
              const args = tc.input ?? tc.args ?? {};
              const hirEvent: HumanInputRequestedEvent = {
                type: "human_input_requested",
                question: args.question ?? "",
                context: args.context,
                urgency: args.urgency,
                format: args.format,
                choices: args.choices,
                timestamp: Date.now(),
                iteration,
              };
              thread.events.push(hirEvent);
              humanInputRequested = true;
            }
          }
        }

        // Reset consecutive errors on success
        consecutiveErrors = 0;

        // Middleware: afterIteration
        await this.composedMiddleware.afterIteration(
          middlewareCtx,
          result,
        );

        // Callback
        this.onIterationEnd?.(iteration, result);

        // Evaluate stop conditions
        const stopResult = evaluateStopConditions(this.stopConditions, {
          iteration,
          usage: totalUsage,
          model: this.modelId,
          thread,
        });

        if (stopResult) {
          return {
            response: lastResponse,
            thread,
            usage: totalUsage,
            iterations: iteration,
            stopReason: "stop_condition",
            stopDetail: stopResult.reason,
          };
        }

        // Check interruptOn
        const interruptedTool = this.checkInterruptOn(thread, iteration);
        if (interruptedTool) {
          thread.events.push({
            type: "human_input_requested",
            question: `Tool "${interruptedTool}" requires approval before execution.`,
            timestamp: Date.now(),
            iteration,
          });

          const pendingResult: PendingResult = {
            response: lastResponse,
            thread,
            usage: totalUsage,
            iterations: iteration,
            stopReason: "human_input_needed",
            stopDetail: `Interrupted: tool "${interruptedTool}" requires approval`,
            resume: async (humanResponse: string) => {
              thread.events.push({
                type: "human_input_received",
                response: humanResponse,
                timestamp: Date.now(),
                iteration,
              });
              return this.runLoop(thread, prompt, iteration + 1);
            },
          };
          return pendingResult;
        }

        // Check human input request
        if (humanInputRequested) {
          const pendingResult: PendingResult = {
            response: lastResponse,
            thread,
            usage: totalUsage,
            iterations: iteration,
            stopReason: "human_input_needed",
            stopDetail: "Human input requested",
            resume: async (humanResponse: string) => {
              thread.events.push({
                type: "human_input_received",
                response: humanResponse,
                timestamp: Date.now(),
                iteration,
              });
              return this.runLoop(thread, prompt, iteration + 1);
            },
          };
          return pendingResult;
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
            thread.events.push(completionEvent);

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
            thread.events.push({
              type: "message",
              role: "user",
              content: `Verification failed: ${verifyResult.reason}. Please try again.`,
              timestamp: Date.now(),
              iteration,
            });
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
          thread.events.push(completionEvent);

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

        const errorEvent: ErrorEvent = {
          type: "error",
          error: compactError(error),
          recoverable: isRecoverable,
          timestamp: Date.now(),
          iteration,
        };
        thread.events.push(errorEvent);

        // Middleware: afterIteration (even on error)
        await this.composedMiddleware.afterIteration(
          middlewareCtx,
          error,
        );

        // Callback
        this.onIterationEnd?.(iteration, error);

        if (!isRecoverable) {
          return {
            response: lastResponse,
            thread,
            usage: totalUsage,
            iterations: iteration,
            stopReason: "max_errors",
            stopDetail: `${consecutiveErrors} consecutive errors`,
          };
        }

        // Continue to retry
      }

      iteration++;
    }
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  stream(prompt: string): ReturnType<typeof streamText> {
    const thread = createThread();

    // Push initial user message
    thread.events.push({
      type: "message",
      role: "user",
      content: prompt,
      timestamp: Date.now(),
      iteration: 0,
    });

    const allTools = {
      ...this.tools,
      ...this.composedMiddleware.tools,
    } as ToolSet;

    const { system, messages } = this.buildMessages(thread);

    return streamText({
      model: this.model,
      system,
      messages,
      tools: allTools,
      stopWhen: stepCountIs(20),
    });
  }
}
