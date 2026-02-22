# SPEC-03: Stop Conditions

## CONTEXT

Stop conditions control when the outer agent loop terminates. They are composable factory functions inspired by Ralph Loop Agent's pattern. Multiple conditions are evaluated with OR semantics -- any condition triggering halts the loop.

### DEPENDENCIES
- SPEC-02 (core types: `StopCondition`, `StopConditionContext`, `TokenUsage`)

---

## API

### Factory Functions

```ts
// Stop after N outer loop iterations
function maxIterations(n: number): StopCondition;

// Stop when total tokens exceed threshold
function maxTokens(n: number): StopCondition;

// Stop when input tokens exceed threshold
function maxInputTokens(n: number): StopCondition;

// Stop when output tokens exceed threshold
function maxOutputTokens(n: number): StopCondition;

// Stop when estimated cost exceeds budget (USD)
function maxCost(dollars: number, model?: string): StopCondition;
```

### Model Pricing

```ts
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }>;

function calculateCost(usage: TokenUsage, model: string): number;
```

Pricing table should include at minimum:
- `claude-sonnet-4-5` / `claude-opus-4-5` / `claude-haiku-4-5`
- `gpt-4o` / `gpt-4o-mini`
- `gemini-2.5-pro` / `gemini-2.5-flash`

### Composition

```ts
// Single condition
createDeepFactorAgent({ stopWhen: maxIterations(5) });

// Multiple conditions (OR -- any triggers stop)
createDeepFactorAgent({ stopWhen: [maxIterations(10), maxCost(1.00)] });
```

### Utility

```ts
// Evaluate array of conditions, return first triggered
function evaluateStopConditions(
  conditions: StopCondition[],
  ctx: StopConditionContext
): StopConditionResult | null;
```

---

## FILE STRUCTURE

- `src/stop-conditions.ts` -- factories, pricing, utilities
- `src/stop-conditions.test.ts` -- unit tests

---

## ACCEPTANCE CRITERIA

- [ ] All factory functions return `StopCondition` conforming to the type
- [ ] `maxIterations(3)` stops on iteration 3
- [ ] `maxTokens(1000)` stops when usage.totalTokens >= 1000
- [ ] `maxCost(0.50)` stops when calculated cost >= $0.50
- [ ] `evaluateStopConditions` returns `null` when no condition triggers
- [ ] `evaluateStopConditions` returns the first triggered result
- [ ] `calculateCost` correctly handles cache tokens when present
- [ ] All tests pass (`pnpm test`)
- [ ] Exported from `src/index.ts`
