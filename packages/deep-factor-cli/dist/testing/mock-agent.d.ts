import type { TokenUsage } from "deep-factor-agent";
import type { ChatMessage, UseAgentReturn } from "../types.js";
export interface MockScenarioStep {
    type: "message" | "tool_call" | "tool_result" | "human_input" | "error" | "done";
    delay: number;
    data: ChatMessage | {
        question: string;
        choices?: string[];
    } | {
        message: string;
    } | Record<string, never>;
}
export interface MockAgentConfig {
    scenario: MockScenarioStep[];
    usage?: Partial<TokenUsage>;
}
export declare function useMockAgent(config: MockAgentConfig): UseAgentReturn;
export declare function slowConversation(delayMs?: number): MockAgentConfig;
export declare function rapidBurst(count?: number, delayMs?: number): MockAgentConfig;
export declare function mixedPressure(): MockAgentConfig;
export declare function longRunning(iterations?: number, delayMs?: number): MockAgentConfig;
export declare function errorRecovery(): MockAgentConfig;
export declare function humanInputFlow(): MockAgentConfig;
export declare function largePayload(charCount?: number): MockAgentConfig;
//# sourceMappingURL=mock-agent.d.ts.map