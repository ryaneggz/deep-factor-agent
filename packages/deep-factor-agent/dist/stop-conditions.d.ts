import type { TokenUsage, StopCondition, StopConditionContext, StopConditionResult } from "./types.js";
export declare const MODEL_PRICING: Record<string, {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
}>;
export declare function calculateCost(usage: TokenUsage, model: string): number;
export declare function maxIterations(n: number): StopCondition;
export declare function maxTokens(n: number): StopCondition;
export declare function maxInputTokens(n: number): StopCondition;
export declare function maxOutputTokens(n: number): StopCondition;
export declare function maxCost(dollars: number, model?: string): StopCondition;
export declare function evaluateStopConditions(conditions: StopCondition[], ctx: StopConditionContext): StopConditionResult | null;
//# sourceMappingURL=stop-conditions.d.ts.map