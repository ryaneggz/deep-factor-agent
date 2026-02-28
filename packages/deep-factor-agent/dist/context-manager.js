import { HumanMessage } from "@langchain/core/messages";
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
export function estimateTokens(text) {
    if (text.length === 0)
        return 0;
    return Math.ceil(text.length / 3.5);
}
export class ContextManager {
    maxContextTokens;
    keepRecentIterations;
    tokenEstimator;
    constructor(config = {}) {
        this.maxContextTokens = config.maxContextTokens ?? 150000;
        this.keepRecentIterations = config.keepRecentIterations ?? 3;
        this.tokenEstimator = config.tokenEstimator ?? estimateTokens;
    }
    estimateThreadTokens(thread) {
        let total = 0;
        for (const event of thread.events) {
            const serialized = JSON.stringify(event);
            total += this.tokenEstimator(serialized);
        }
        return total;
    }
    needsSummarization(thread) {
        return this.estimateThreadTokens(thread) > this.maxContextTokens;
    }
    async summarize(thread, model) {
        const zeroUsage = {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
        };
        const iterationMap = new Map();
        for (const event of thread.events) {
            const iter = event.iteration;
            if (!iterationMap.has(iter)) {
                iterationMap.set(iter, []);
            }
            iterationMap.get(iter).push(event);
        }
        const iterations = Array.from(iterationMap.keys()).sort((a, b) => a - b);
        if (iterations.length === 0)
            return { thread, usage: zeroUsage };
        const maxIteration = iterations[iterations.length - 1];
        const cutoff = maxIteration - this.keepRecentIterations;
        const oldIterations = iterations.filter((i) => i <= cutoff);
        if (oldIterations.length === 0)
            return { thread, usage: zeroUsage };
        const summaryEvents = [];
        let totalUsage = { ...zeroUsage };
        for (const iter of oldIterations) {
            const events = iterationMap.get(iter);
            if (events.length === 1 && events[0].type === "summary")
                continue;
            const eventsText = events.map((e) => JSON.stringify(e)).join("\n");
            try {
                const response = await model.invoke([
                    new HumanMessage(`Summarize the following agent iteration events in 2-3 sentences. Focus on what tools were called, what was accomplished, and any errors:\n\n${eventsText}`),
                ]);
                // Track token usage from this summarization call
                const meta = "usage_metadata" in response
                    ? response.usage_metadata
                    : undefined;
                if (meta) {
                    totalUsage = {
                        inputTokens: totalUsage.inputTokens + (meta.input_tokens ?? 0),
                        outputTokens: totalUsage.outputTokens + (meta.output_tokens ?? 0),
                        totalTokens: totalUsage.totalTokens + (meta.total_tokens ?? 0),
                    };
                }
                const content = typeof response.content === "string"
                    ? response.content
                    : JSON.stringify(response.content);
                summaryEvents.push({
                    type: "summary",
                    summarizedIterations: [iter],
                    summary: content,
                    timestamp: Date.now(),
                    iteration: iter,
                });
            }
            catch {
                summaryEvents.push({
                    type: "summary",
                    summarizedIterations: [iter],
                    summary: `Iteration ${iter}: ${events.length} events (summarization failed)`,
                    timestamp: Date.now(),
                    iteration: iter,
                });
            }
        }
        const newEvents = thread.events.filter((e) => e.iteration > cutoff || e.type === "summary");
        thread.events = [...summaryEvents, ...newEvents];
        thread.updatedAt = Date.now();
        return { thread, usage: totalUsage };
    }
    buildContextInjection(thread) {
        const summaries = thread.events.filter((e) => e.type === "summary");
        if (summaries.length === 0)
            return "";
        let injection = "## Previous Iteration Summaries\n\n";
        for (const s of summaries) {
            const iters = s.summarizedIterations.join(", ");
            injection += `### Iteration(s) ${iters}\n${s.summary}\n\n`;
        }
        return injection;
    }
}
