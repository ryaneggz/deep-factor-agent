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
import { toolArrayToMap } from "./tool-adapter.js";
import { performance } from "node:perf_hooks";
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
  AgentMiddleware,
  MiddlewareContext,
} from "./types.js";
import type { ModelAdapter } from "./providers/types.js";
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
    if (this.instructions || contextInjection || parallelHint) {
      const system = [contextInjection, this.instructions, parallelHint]
        .filter(Boolean)
        .join("\n\n");
      messages.push(new SystemMessage(system));
    }

    // Convert thread events to messages
    for (const event of thread.events) {
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
          messages.push(
            new AIMessage({
              content: "",
              tool_calls: [
                {
                  id: event.toolCallId,
                  name: event.toolName,
                  args: event.args,
                },
              ],
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
    if (this.instructions || contextInjection || parallelHint) {
      const system = [contextInjection, this.instructions, parallelHint]
        .filter(Boolean)
        .join("\n\n");
      messages.push(new SystemMessage(system));
    }

    // Serialize the entire thread into a single XML HumanMessage
    const xml = serializeThreadToXml(thread.events);
    messages.push(new HumanMessage(xml));

    return messages;
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

  async loop(prompt: string): Promise<AgentResult | PendingResult> {
    const thread = createThread();
    return this.runLoop(thread, prompt, 1);
  }

  /**
   * Continue an existing thread with a new user prompt.
   * Reuses the thread's full conversation history so the model retains
   * multi-turn context across calls.
   */
  async continueLoop(thread: AgentThread, prompt: string): Promise<AgentResult | PendingResult> {
    const nextIteration = thread.events.reduce((max, e) => Math.max(max, e.iteration), 0) + 1;
    thread.events.push({
      type: "message",
      role: "user",
      content: prompt,
      timestamp: Date.now(),
      iteration: nextIteration,
    });
    thread.updatedAt = Date.now();
    return this.runLoop(thread, prompt, nextIteration);
  }

  private async runLoop(
    thread: AgentThread,
    prompt: string,
    startIteration: number,
  ): Promise<AgentResult | PendingResult> {
    const model = await this.ensureModel();

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

      try {
        // Bind tools and run inner tool-calling loop
        const modelWithTools =
          allTools.length > 0 && "bindTools" in model && model.bindTools
            ? model.bindTools(allTools)
            : model;

        let stepCount = 0;
        let iterationUsage: TokenUsage = {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        };
        let humanInputRequested = false;
        let lastAIResponse: AIMessage | null = null;

        while (stepCount < this.maxToolCallsPerIteration) {
          const response = (await modelWithTools.invoke(messages)) as AIMessage;
          messages.push(response);
          lastAIResponse = response;

          // Accumulate usage from this step
          const stepUsage = extractUsage(response);
          iterationUsage = addUsage(iterationUsage, stepUsage);

          const toolCalls = response.tool_calls ?? [];
          if (toolCalls.length === 0) break;

          // Record and execute tool calls
          const now = Date.now();

          if (this.parallelToolCalls && toolCalls.length > 0) {
            // --- Parallel execution path ---
            // Partition tool calls into parallel-safe and sequential (HITL / interruptOn)
            const parallelBatch: typeof toolCalls = [];
            const sequentialBatch: typeof toolCalls = [];
            for (const tc of toolCalls) {
              if (tc.name === TOOL_NAME_REQUEST_HUMAN_INPUT || this.interruptOn.includes(tc.name)) {
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
              const toolCallEvent: ToolCallEvent = {
                type: "tool_call",
                toolName: tc.name,
                toolCallId: tc.id ?? `call_${stepCount}_${tc.name}`,
                args: (tc.args ?? {}) as Record<string, unknown>,
                timestamp: now,
                iteration,
              };
              thread.events.push(toolCallEvent);
            }

            // Execute parallel batch via Promise.all with per-tool timing
            const parallelResults = await Promise.all(
              parallelBatch.map(async (tc) => {
                const toolCallId = tc.id ?? `call_${stepCount}_${tc.name}`;
                const foundTool = toolMap[tc.name];
                const start = performance.now();
                if (foundTool) {
                  try {
                    const toolResult = await foundTool.invoke(tc.args);
                    const resultStr =
                      typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
                    const durationMs = Math.round(performance.now() - start);

                    // Handle todoMiddleware special cases
                    if (tc.name === TOOL_NAME_WRITE_TODOS) {
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

                    return { toolCallId, result: resultStr, durationMs, tc };
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
              const toolResultEvent: ToolResultEvent = {
                type: "tool_result",
                toolCallId: pr.toolCallId,
                result: pr.result,
                timestamp: Date.now(),
                iteration,
                durationMs: pr.durationMs,
                parallelGroup: groupId,
              };
              thread.events.push(toolResultEvent);
              messages.push(
                new ToolMessage({
                  tool_call_id: pr.toolCallId,
                  content: pr.result,
                }),
              );
            }

            // Handle sequential tools (HITL / interruptOn) after parallel batch
            for (const tc of sequentialBatch) {
              const toolCallEvent: ToolCallEvent = {
                type: "tool_call",
                toolName: tc.name,
                toolCallId: tc.id ?? `call_${stepCount}_${tc.name}`,
                args: (tc.args ?? {}) as Record<string, unknown>,
                timestamp: Date.now(),
                iteration,
              };
              thread.events.push(toolCallEvent);

              if (tc.name === TOOL_NAME_REQUEST_HUMAN_INPUT) {
                const args = (tc.args ?? {}) as Record<string, unknown>;
                const hirEvent: HumanInputRequestedEvent = {
                  type: "human_input_requested",
                  question: (args.question as string) ?? "",
                  context: args.context as string | undefined,
                  urgency: args.urgency as "low" | "medium" | "high" | undefined,
                  format: args.format as "free_text" | "yes_no" | "multiple_choice" | undefined,
                  choices: args.choices as string[] | undefined,
                  timestamp: Date.now(),
                  iteration,
                };
                thread.events.push(hirEvent);

                // Add synthetic tool_result so every tool_call has a matching ToolMessage
                const hitlToolCallId = tc.id ?? `call_${stepCount}_${tc.name}`;
                const hitlResult = `[Waiting for human input]`;
                thread.events.push({
                  type: "tool_result",
                  toolCallId: hitlToolCallId,
                  result: hitlResult,
                  timestamp: Date.now(),
                  iteration,
                });
                messages.push(
                  new ToolMessage({
                    tool_call_id: hitlToolCallId,
                    content: hitlResult,
                  }),
                );

                humanInputRequested = true;
                break;
              }

              if (this.interruptOn.includes(tc.name)) {
                const interruptedToolCallId = tc.id ?? `call_${stepCount}_${tc.name}`;
                const interruptedResult = `[Tool "${tc.name}" not executed — interrupted for human approval]`;
                const toolResultEvent: ToolResultEvent = {
                  type: "tool_result",
                  toolCallId: interruptedToolCallId,
                  result: interruptedResult,
                  timestamp: Date.now(),
                  iteration,
                };
                thread.events.push(toolResultEvent);
                messages.push(
                  new ToolMessage({
                    tool_call_id: interruptedToolCallId,
                    content: interruptedResult,
                  }),
                );
                continue;
              }
            }
          } else {
            // --- Sequential execution path (original logic) ---
            for (const tc of toolCalls) {
              // Record tool call event
              const toolCallEvent: ToolCallEvent = {
                type: "tool_call",
                toolName: tc.name,
                toolCallId: tc.id ?? `call_${stepCount}_${tc.name}`,
                args: (tc.args ?? {}) as Record<string, unknown>,
                timestamp: now,
                iteration,
              };
              thread.events.push(toolCallEvent);

              // Check for requestHumanInput
              if (tc.name === TOOL_NAME_REQUEST_HUMAN_INPUT) {
                const args = (tc.args ?? {}) as Record<string, unknown>;
                const hirEvent: HumanInputRequestedEvent = {
                  type: "human_input_requested",
                  question: (args.question as string) ?? "",
                  context: args.context as string | undefined,
                  urgency: args.urgency as "low" | "medium" | "high" | undefined,
                  format: args.format as "free_text" | "yes_no" | "multiple_choice" | undefined,
                  choices: args.choices as string[] | undefined,
                  timestamp: now,
                  iteration,
                };
                thread.events.push(hirEvent);

                // Add synthetic tool_result so every tool_call has a matching ToolMessage
                const hitlToolCallId = tc.id ?? `call_${stepCount}_${tc.name}`;
                const hitlResult = `[Waiting for human input]`;
                const hitlToolResultEvent: ToolResultEvent = {
                  type: "tool_result",
                  toolCallId: hitlToolCallId,
                  result: hitlResult,
                  timestamp: now,
                  iteration,
                };
                thread.events.push(hitlToolResultEvent);
                messages.push(
                  new ToolMessage({
                    tool_call_id: hitlToolCallId,
                    content: hitlResult,
                  }),
                );

                humanInputRequested = true;
                // Don't execute the tool, just break
                break;
              }

              // Check interruptOn before executing
              if (this.interruptOn.includes(tc.name)) {
                // Push a synthetic tool_result so the message sequence stays valid
                // (every AIMessage tool_call must have a matching ToolMessage)
                const interruptedToolCallId = tc.id ?? `call_${stepCount}_${tc.name}`;
                const interruptedResult = `[Tool "${tc.name}" not executed — interrupted for human approval]`;
                const toolResultEvent: ToolResultEvent = {
                  type: "tool_result",
                  toolCallId: interruptedToolCallId,
                  result: interruptedResult,
                  timestamp: now,
                  iteration,
                };
                thread.events.push(toolResultEvent);
                messages.push(
                  new ToolMessage({
                    tool_call_id: interruptedToolCallId,
                    content: interruptedResult,
                  }),
                );
                continue;
              }

              // Find and execute the tool (O(1) map lookup)
              const foundTool = toolMap[tc.name];
              if (foundTool) {
                const start = performance.now();
                const toolResult = await foundTool.invoke(tc.args);
                const durationMs = Math.round(performance.now() - start);
                const resultStr =
                  typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);

                // Handle todoMiddleware special cases
                if (tc.name === TOOL_NAME_WRITE_TODOS) {
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

                // Record tool result event
                const toolResultEvent: ToolResultEvent = {
                  type: "tool_result",
                  toolCallId: tc.id ?? `call_${stepCount}_${tc.name}`,
                  result: resultStr,
                  timestamp: now,
                  iteration,
                  durationMs,
                };
                thread.events.push(toolResultEvent);

                messages.push(
                  new ToolMessage({
                    tool_call_id: tc.id ?? `call_${stepCount}_${tc.name}`,
                    content: resultStr,
                  }),
                );
              } else {
                // Tool not found — record error to keep message sequence consistent
                const errorMsg = `Tool not found: "${tc.name}"`;
                const toolCallId = tc.id ?? `call_${stepCount}_${tc.name}`;
                const toolResultEvent: ToolResultEvent = {
                  type: "tool_result",
                  toolCallId,
                  result: errorMsg,
                  timestamp: now,
                  iteration,
                };
                thread.events.push(toolResultEvent);
                messages.push(
                  new ToolMessage({
                    tool_call_id: toolCallId,
                    content: errorMsg,
                  }),
                );
              }
            }
          }

          if (humanInputRequested) break;
          stepCount++;
        }

        // Extract response text
        if (lastAIResponse) {
          lastResponse = extractTextContent(lastAIResponse.content);
        }

        // Record assistant message
        if (lastResponse) {
          const messageEvent: AgentMessageEvent = {
            type: "message",
            role: "assistant",
            content: lastResponse,
            timestamp: Date.now(),
            iteration,
          };
          thread.events.push(messageEvent);
        }

        // Accumulate usage
        totalUsage = addUsage(totalUsage, iterationUsage);

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
        await this.composedMiddleware.afterIteration(middlewareCtx, error);

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

  async stream(prompt: string): Promise<AsyncIterable<AIMessageChunk>> {
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
