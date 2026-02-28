import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AgentThread, ContextManagementConfig, TokenUsage } from "./types.js";
import type { ModelAdapter } from "./providers/types.js";
/**
 * Default token estimator using `Math.ceil(text.length / 3.5)`.
 *
 * This heuristic assumes ~3.5 characters per token, which is reasonable for
 * English prose but inaccurate for CJK text, emoji-heavy content, and dense
 * code (where the ratio is closer to 1.5–2.5 chars/token). It only affects
 * summarization trigger timing — not billing — so moderate inaccuracy is
 * acceptable. For tighter control, supply a custom `tokenEstimator` in
 * `ContextManagementConfig`.
 */
export declare function estimateTokens(text: string): number;
export declare class ContextManager {
    private maxContextTokens;
    private keepRecentIterations;
    private tokenEstimator;
    constructor(config?: ContextManagementConfig);
    estimateThreadTokens(thread: AgentThread): number;
    needsSummarization(thread: AgentThread): boolean;
    summarize(thread: AgentThread, model: BaseChatModel | ModelAdapter): Promise<{
        thread: AgentThread;
        usage: TokenUsage;
    }>;
    buildContextInjection(thread: AgentThread): string;
}
//# sourceMappingURL=context-manager.d.ts.map