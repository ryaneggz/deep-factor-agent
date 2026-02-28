import { AIMessageChunk } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { AgentThread, AgentResult, PendingResult, TokenUsage, DeepFactorAgentSettings } from "./types.js";
export declare function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage;
export declare class DeepFactorAgent<TTools extends StructuredToolInterface[] = StructuredToolInterface[]> {
    private modelOrString;
    private resolvedModel;
    private tools;
    private instructions;
    private stopConditions;
    private verifyCompletion;
    private composedMiddleware;
    private interruptOn;
    private contextManager;
    private onIterationStart?;
    private onIterationEnd?;
    private modelId;
    private maxToolCallsPerIteration;
    private contextMode;
    constructor(settings: DeepFactorAgentSettings<TTools>);
    private ensureModel;
    private buildMessages;
    private buildXmlMessages;
    private checkInterruptOn;
    loop(prompt: string): Promise<AgentResult | PendingResult>;
    /**
     * Continue an existing thread with a new user prompt.
     * Reuses the thread's full conversation history so the model retains
     * multi-turn context across calls.
     */
    continueLoop(thread: AgentThread, prompt: string): Promise<AgentResult | PendingResult>;
    private runLoop;
    stream(prompt: string): Promise<AsyncIterable<AIMessageChunk>>;
}
//# sourceMappingURL=agent.d.ts.map