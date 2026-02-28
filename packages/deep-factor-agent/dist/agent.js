import { HumanMessage, AIMessage, SystemMessage, ToolMessage, } from "@langchain/core/messages";
import { initChatModel } from "langchain/chat_models/universal";
import { composeMiddleware, TOOL_NAME_WRITE_TODOS } from "./middleware.js";
import { TOOL_NAME_REQUEST_HUMAN_INPUT } from "./human-in-the-loop.js";
import { evaluateStopConditions } from "./stop-conditions.js";
import { ContextManager } from "./context-manager.js";
import { serializeThreadToXml } from "./xml-serializer.js";
import { toolArrayToMap } from "./tool-adapter.js";
import { isModelAdapter } from "./providers/types.js";
let threadCounter = 0;
function createThreadId() {
    return `thread_${Date.now()}_${++threadCounter}`;
}
export function addUsage(a, b) {
    return {
        inputTokens: a.inputTokens + b.inputTokens,
        outputTokens: a.outputTokens + b.outputTokens,
        totalTokens: a.totalTokens + b.totalTokens,
        cacheReadTokens: (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0) || undefined,
        cacheWriteTokens: (a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0) || undefined,
    };
}
function extractUsage(response) {
    const meta = "usage_metadata" in response
        ? response.usage_metadata
        : undefined;
    return {
        inputTokens: meta?.input_tokens ?? 0,
        outputTokens: meta?.output_tokens ?? 0,
        totalTokens: meta?.total_tokens ?? 0,
    };
}
function isTextContentBlock(block) {
    return (typeof block === "object" &&
        block !== null &&
        "type" in block &&
        block.type === "text" &&
        "text" in block);
}
function extractTextContent(content) {
    if (typeof content === "string")
        return content;
    if (Array.isArray(content)) {
        return content
            .map((block) => {
            if (typeof block === "string")
                return block;
            if (isTextContentBlock(block))
                return block.text;
            return JSON.stringify(block);
        })
            .join("");
    }
    return JSON.stringify(content);
}
function compactError(error, maxLen = 500) {
    const msg = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    return msg.length > maxLen ? msg.substring(0, maxLen) + "..." : msg;
}
function extractModelId(model) {
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
function createThread() {
    const now = Date.now();
    return {
        id: createThreadId(),
        events: [],
        metadata: {},
        createdAt: now,
        updatedAt: now,
    };
}
export class DeepFactorAgent {
    modelOrString;
    resolvedModel = null;
    tools;
    instructions;
    stopConditions;
    verifyCompletion;
    composedMiddleware;
    interruptOn;
    contextManager;
    onIterationStart;
    onIterationEnd;
    modelId;
    maxToolCallsPerIteration;
    contextMode;
    constructor(settings) {
        this.modelOrString = settings.model;
        if (typeof settings.model === "string") {
            this.modelId = settings.model;
        }
        else if (isModelAdapter(settings.model)) {
            this.modelId = "cli-adapter";
        }
        else {
            this.modelId = extractModelId(settings.model);
        }
        this.tools = (settings.tools ?? []);
        this.instructions = settings.instructions ?? "";
        this.verifyCompletion = settings.verifyCompletion;
        this.interruptOn = settings.interruptOn ?? [];
        this.onIterationStart = settings.onIterationStart;
        this.onIterationEnd = settings.onIterationEnd;
        this.maxToolCallsPerIteration = settings.maxToolCallsPerIteration ?? 20;
        this.contextMode = settings.contextMode ?? "standard";
        // Normalize stopWhen
        if (!settings.stopWhen) {
            this.stopConditions = [];
        }
        else if (Array.isArray(settings.stopWhen)) {
            this.stopConditions = settings.stopWhen;
        }
        else {
            this.stopConditions = [settings.stopWhen];
        }
        // Compose middleware
        const middlewareList = settings.middleware ?? [];
        this.composedMiddleware = composeMiddleware(middlewareList);
        // Context management
        this.contextManager = new ContextManager(settings.contextManagement);
    }
    async ensureModel() {
        if (this.resolvedModel)
            return this.resolvedModel;
        if (typeof this.modelOrString === "string") {
            const resolved = await initChatModel(this.modelOrString);
            this.resolvedModel = resolved;
            return resolved;
        }
        // Both BaseChatModel and ModelAdapter pass through directly
        this.resolvedModel = this.modelOrString;
        return this.resolvedModel;
    }
    buildMessages(thread) {
        const messages = [];
        // Build context injection from summaries
        const contextInjection = this.contextManager.buildContextInjection(thread);
        if (this.instructions || contextInjection) {
            const system = [contextInjection, this.instructions]
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
                    }
                    else if (event.role === "assistant") {
                        messages.push(new AIMessage(event.content));
                    }
                    else if (event.role === "system") {
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
                    messages.push(new AIMessage({
                        content: "",
                        tool_calls: [
                            {
                                id: event.toolCallId,
                                name: event.toolName,
                                args: event.args,
                            },
                        ],
                    }));
                    break;
                }
                case "tool_result": {
                    messages.push(new ToolMessage({
                        tool_call_id: event.toolCallId,
                        content: String(event.result),
                    }));
                    break;
                }
                case "error": {
                    const recoverStr = event.recoverable
                        ? "recoverable"
                        : "non-recoverable";
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
    buildXmlMessages(thread) {
        const messages = [];
        // Build system prompt identically to standard mode
        const contextInjection = this.contextManager.buildContextInjection(thread);
        if (this.instructions || contextInjection) {
            const system = [contextInjection, this.instructions]
                .filter(Boolean)
                .join("\n\n");
            messages.push(new SystemMessage(system));
        }
        // Serialize the entire thread into a single XML HumanMessage
        const xml = serializeThreadToXml(thread.events);
        messages.push(new HumanMessage(xml));
        return messages;
    }
    checkInterruptOn(thread, iteration) {
        if (this.interruptOn.length === 0)
            return null;
        for (let i = thread.events.length - 1; i >= 0; i--) {
            const event = thread.events[i];
            if (event.iteration !== iteration)
                break;
            if (event.type === "tool_call" &&
                this.interruptOn.includes(event.toolName)) {
                return event.toolName;
            }
        }
        return null;
    }
    async loop(prompt) {
        const thread = createThread();
        return this.runLoop(thread, prompt, 1);
    }
    /**
     * Continue an existing thread with a new user prompt.
     * Reuses the thread's full conversation history so the model retains
     * multi-turn context across calls.
     */
    async continueLoop(thread, prompt) {
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
    async runLoop(thread, prompt, startIteration) {
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
        let totalUsage = {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
        };
        let iteration = startIteration;
        let consecutiveErrors = 0;
        let lastResponse = "";
        // Merge middleware tools with user tools
        const allTools = [
            ...this.tools,
            ...this.composedMiddleware.tools,
        ];
        const toolMap = toolArrayToMap(allTools);
        while (true) {
            // Callback
            this.onIterationStart?.(iteration);
            // Middleware: beforeIteration
            const middlewareCtx = {
                thread,
                iteration,
                settings: {
                    model: this.modelOrString,
                    tools: this.tools,
                    instructions: this.instructions,
                },
            };
            await this.composedMiddleware.beforeIteration(middlewareCtx);
            // Context management: check if summarization needed
            // Summarization requires BaseChatModel (not ModelAdapter) for LLM calls
            if (this.contextManager.needsSummarization(thread) &&
                !isModelAdapter(model)) {
                const { usage: summarizationUsage } = await this.contextManager.summarize(thread, model);
                totalUsage = addUsage(totalUsage, summarizationUsage);
            }
            // Build messages from thread
            const messages = this.contextMode === "xml"
                ? this.buildXmlMessages(thread)
                : this.buildMessages(thread);
            try {
                // Bind tools and run inner tool-calling loop
                const modelWithTools = allTools.length > 0 && "bindTools" in model && model.bindTools
                    ? model.bindTools(allTools)
                    : model;
                let stepCount = 0;
                let iterationUsage = {
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0,
                };
                let humanInputRequested = false;
                let lastAIResponse = null;
                while (stepCount < this.maxToolCallsPerIteration) {
                    const response = (await modelWithTools.invoke(messages));
                    messages.push(response);
                    lastAIResponse = response;
                    // Accumulate usage from this step
                    const stepUsage = extractUsage(response);
                    iterationUsage = addUsage(iterationUsage, stepUsage);
                    const toolCalls = response.tool_calls ?? [];
                    if (toolCalls.length === 0)
                        break;
                    // Record and execute tool calls
                    const now = Date.now();
                    for (const tc of toolCalls) {
                        // Record tool call event
                        const toolCallEvent = {
                            type: "tool_call",
                            toolName: tc.name,
                            toolCallId: tc.id ?? `call_${stepCount}_${tc.name}`,
                            args: (tc.args ?? {}),
                            timestamp: now,
                            iteration,
                        };
                        thread.events.push(toolCallEvent);
                        // Check for requestHumanInput
                        if (tc.name === TOOL_NAME_REQUEST_HUMAN_INPUT) {
                            const args = (tc.args ?? {});
                            const hirEvent = {
                                type: "human_input_requested",
                                question: args.question ?? "",
                                context: args.context,
                                urgency: args.urgency,
                                format: args.format,
                                choices: args.choices,
                                timestamp: now,
                                iteration,
                            };
                            thread.events.push(hirEvent);
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
                            const toolResultEvent = {
                                type: "tool_result",
                                toolCallId: interruptedToolCallId,
                                result: interruptedResult,
                                timestamp: now,
                                iteration,
                            };
                            thread.events.push(toolResultEvent);
                            messages.push(new ToolMessage({
                                tool_call_id: interruptedToolCallId,
                                content: interruptedResult,
                            }));
                            continue;
                        }
                        // Find and execute the tool (O(1) map lookup)
                        const foundTool = toolMap[tc.name];
                        if (foundTool) {
                            const toolResult = await foundTool.invoke(tc.args);
                            const resultStr = typeof toolResult === "string"
                                ? toolResult
                                : JSON.stringify(toolResult);
                            // Handle todoMiddleware special cases
                            if (tc.name === TOOL_NAME_WRITE_TODOS) {
                                try {
                                    const parsed = JSON.parse(resultStr);
                                    if (parsed.todos) {
                                        thread.metadata.todos = parsed.todos;
                                    }
                                }
                                catch (parseError) {
                                    console.warn(`[deep-factor-agent] Failed to parse write_todos result: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
                                }
                            }
                            // Record tool result event
                            const toolResultEvent = {
                                type: "tool_result",
                                toolCallId: tc.id ?? `call_${stepCount}_${tc.name}`,
                                result: resultStr,
                                timestamp: now,
                                iteration,
                            };
                            thread.events.push(toolResultEvent);
                            messages.push(new ToolMessage({
                                tool_call_id: tc.id ?? `call_${stepCount}_${tc.name}`,
                                content: resultStr,
                            }));
                        }
                        else {
                            // Tool not found — record error to keep message sequence consistent
                            const errorMsg = `Tool not found: "${tc.name}"`;
                            const toolCallId = tc.id ?? `call_${stepCount}_${tc.name}`;
                            const toolResultEvent = {
                                type: "tool_result",
                                toolCallId,
                                result: errorMsg,
                                timestamp: now,
                                iteration,
                            };
                            thread.events.push(toolResultEvent);
                            messages.push(new ToolMessage({
                                tool_call_id: toolCallId,
                                content: errorMsg,
                            }));
                        }
                    }
                    if (humanInputRequested)
                        break;
                    stepCount++;
                }
                // Extract response text
                if (lastAIResponse) {
                    lastResponse = extractTextContent(lastAIResponse.content);
                }
                // Record assistant message
                if (lastResponse) {
                    const messageEvent = {
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
                // Check interruptOn
                const interruptedTool = this.checkInterruptOn(thread, iteration);
                if (interruptedTool) {
                    thread.events.push({
                        type: "human_input_requested",
                        question: `Tool "${interruptedTool}" requires approval before execution.`,
                        timestamp: Date.now(),
                        iteration,
                    });
                    const pendingResult = {
                        response: lastResponse,
                        thread,
                        usage: totalUsage,
                        iterations: iteration,
                        stopReason: "human_input_needed",
                        stopDetail: `Interrupted: tool "${interruptedTool}" requires approval`,
                        resume: async (humanResponse) => {
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
                    const pendingResult = {
                        response: lastResponse,
                        thread,
                        usage: totalUsage,
                        iterations: iteration,
                        stopReason: "human_input_needed",
                        stopDetail: "Human input requested",
                        resume: async (humanResponse) => {
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
                        const completionEvent = {
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
                }
                else {
                    // No verification function - single iteration mode
                    const completionEvent = {
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
            }
            catch (error) {
                consecutiveErrors++;
                const isRecoverable = consecutiveErrors < 3;
                const errorEvent = {
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
    async stream(prompt) {
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
        const allTools = [
            ...this.tools,
            ...this.composedMiddleware.tools,
        ];
        const messages = this.contextMode === "xml"
            ? this.buildXmlMessages(thread)
            : this.buildMessages(thread);
        const modelWithTools = allTools.length > 0 && model.bindTools
            ? model.bindTools(allTools)
            : model;
        return modelWithTools.stream(messages);
    }
}
