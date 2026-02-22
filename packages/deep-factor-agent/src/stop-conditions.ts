import type {
  TokenUsage,
  StopCondition,
  StopConditionContext,
  StopConditionResult,
} from "./types.js";

// --- Model Pricing (cost per token) ---

export const MODEL_PRICING: Record<
  string,
  {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  }
> = {
  // Anthropic
  "claude-sonnet-4-5": {
    input: 0.000003,
    output: 0.000015,
    cacheRead: 0.0000003,
    cacheWrite: 0.00000375,
  },
  "claude-opus-4-5": {
    input: 0.000015,
    output: 0.000075,
    cacheRead: 0.0000015,
    cacheWrite: 0.00001875,
  },
  "claude-haiku-4-5": {
    input: 0.0000008,
    output: 0.000004,
    cacheRead: 0.00000008,
    cacheWrite: 0.000001,
  },
  // OpenAI
  "gpt-4o": {
    input: 0.0000025,
    output: 0.00001,
  },
  "gpt-4o-mini": {
    input: 0.00000015,
    output: 0.0000006,
  },
  "gpt-4.1-mini": {
    input: 0.0000004,
    output: 0.0000016,
  },
  // Google
  "gemini-2.5-pro": {
    input: 0.00000125,
    output: 0.00001,
  },
  "gemini-2.5-flash": {
    input: 0.000000075,
    output: 0.0000003,
  },
};

// --- Cost Calculation ---

export function calculateCost(usage: TokenUsage, model: string): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  let cost =
    usage.inputTokens * pricing.input + usage.outputTokens * pricing.output;

  if (usage.cacheReadTokens !== undefined && pricing.cacheRead !== undefined) {
    cost += usage.cacheReadTokens * pricing.cacheRead;
  }
  if (
    usage.cacheWriteTokens !== undefined &&
    pricing.cacheWrite !== undefined
  ) {
    cost += usage.cacheWriteTokens * pricing.cacheWrite;
  }

  return cost;
}

// --- Stop Condition Factories ---

export function maxIterations(n: number): StopCondition {
  return (ctx: StopConditionContext): StopConditionResult => {
    if (ctx.iteration >= n) {
      return { stop: true, reason: `Max iterations (${n}) reached` };
    }
    return { stop: false };
  };
}

export function maxTokens(n: number): StopCondition {
  return (ctx: StopConditionContext): StopConditionResult => {
    if (ctx.usage.totalTokens >= n) {
      return {
        stop: true,
        reason: `Max tokens (${n}) reached: ${ctx.usage.totalTokens} total tokens used`,
      };
    }
    return { stop: false };
  };
}

export function maxInputTokens(n: number): StopCondition {
  return (ctx: StopConditionContext): StopConditionResult => {
    if (ctx.usage.inputTokens >= n) {
      return {
        stop: true,
        reason: `Max input tokens (${n}) reached: ${ctx.usage.inputTokens} input tokens used`,
      };
    }
    return { stop: false };
  };
}

export function maxOutputTokens(n: number): StopCondition {
  return (ctx: StopConditionContext): StopConditionResult => {
    if (ctx.usage.outputTokens >= n) {
      return {
        stop: true,
        reason: `Max output tokens (${n}) reached: ${ctx.usage.outputTokens} output tokens used`,
      };
    }
    return { stop: false };
  };
}

export function maxCost(dollars: number, model?: string): StopCondition {
  return (ctx: StopConditionContext): StopConditionResult => {
    const modelToUse = model ?? ctx.model;
    const cost = calculateCost(ctx.usage, modelToUse);
    if (cost >= dollars) {
      return {
        stop: true,
        reason: `Max cost ($${dollars.toFixed(2)}) reached: $${cost.toFixed(4)} spent`,
      };
    }
    return { stop: false };
  };
}

// --- Evaluator ---

export function evaluateStopConditions(
  conditions: StopCondition[],
  ctx: StopConditionContext,
): StopConditionResult | null {
  for (const condition of conditions) {
    const result = condition(ctx);
    if (result.stop) {
      return result;
    }
  }
  return null;
}
