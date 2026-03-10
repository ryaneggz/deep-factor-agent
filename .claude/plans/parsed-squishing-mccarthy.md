# Benchmarks for deep-factor-agent Packages

## Context

Branch `ryaneggz/0003-benchmarks` — no benchmark infrastructure exists yet. Current test runs show:
- **deep-factor-agent**: 4.42s import time (LangChain ecosystem overhead, not fixable here), 331ms test execution
- **deep-factor-tui**: 602ms in cli-e2e (child process startup, inherent to design)

Code review identified two concrete performance issues to fix:
1. `escapeXml` does 5 chained `.replace()` scans (5 intermediate strings)
2. `needsSummarization` always iterates ALL events even when threshold is exceeded early

---

## Step 1: Benchmark Infrastructure

### 1a. Add `bench` scripts to package.json files

- **Root** `package.json`: add `"bench": "pnpm -r bench"`
- **`packages/deep-factor-agent/package.json`**: add `"bench": "vitest bench"`
- **`packages/deep-factor-tui/package.json`**: add `"bench": "vitest bench"`

### 1b. Add benchmark config to vitest configs

**`packages/deep-factor-agent/vitest.config.ts`** — add `benchmark` key:
```ts
benchmark: {
  include: ["__benchmarks__/**/*.bench.ts"],
},
```

**`packages/deep-factor-tui/vitest.config.ts`** — same addition.

### 1c. Update `.gitignore`

Add `bench-results.json` to root `.gitignore`.

---

## Step 2: Create Benchmark Files

### `packages/deep-factor-agent/__benchmarks__/xml-serializer.bench.ts`
- `escapeXml` with small (36 chars), medium (1KB), large (10KB), huge (100KB), and plain (no special chars) inputs
- `serializeThreadToXml` with 10, 50, 200 events

### `packages/deep-factor-agent/__benchmarks__/context-manager.bench.ts`
- `estimateTokens` with short/medium/large strings
- `ContextManager.estimateThreadTokens` with 10, 100, 500 events
- `ContextManager.needsSummarization` with low vs high threshold (to measure early-exit improvement later)

### `packages/deep-factor-agent/__benchmarks__/stop-conditions.bench.ts`
- `calculateCost` with known models (with/without cache tokens)
- `evaluateStopConditions` with 3 and 10 conditions (none trigger / first triggers)

### `packages/deep-factor-agent/__benchmarks__/agent-utilities.bench.ts`
- `addUsage` basic and with cache tokens
- `toolArrayToMap` with 5 and 20 tools
- `composeMiddleware` with 5 middlewares

### `packages/deep-factor-tui/__benchmarks__/startup.bench.ts`
- Lightweight: benchmark dynamic import of `deep-factor-agent` to track import regression

---

## Step 3: Run Baseline Benchmarks

Run `pnpm -C packages/deep-factor-agent bench` and `pnpm -C packages/deep-factor-tui bench` to establish baseline numbers before optimizing.

---

## Step 4: Performance Fixes

### Fix 4a: Single-pass `escapeXml` (HIGH IMPACT)

**File**: `packages/deep-factor-agent/src/xml-serializer.ts`

Replace 5 chained `.replace()` with a single-pass regex + lookup map:
```ts
const XML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
};
const XML_ESCAPE_REGEX = /[&<>"']/g;

export function escapeXml(text: string): string {
  return text.replace(XML_ESCAPE_REGEX, (ch) => XML_ESCAPE_MAP[ch]);
}
```
Expected: ~3-5x throughput on large strings with special chars.

### Fix 4b: Early-exit `needsSummarization` (MEDIUM IMPACT)

**File**: `packages/deep-factor-agent/src/context-manager.ts`

Inline the loop with early return:
```ts
needsSummarization(thread: AgentThread): boolean {
  let total = 0;
  for (const event of thread.events) {
    total += this.tokenEstimator(JSON.stringify(event));
    if (total > this.maxContextTokens) return true;
  }
  return false;
}
```
Expected: For threads that exceed threshold (the common case during long runs), returns in O(k) instead of O(n).

---

## Step 5: Run Post-Optimization Benchmarks + Tests

1. `pnpm -C packages/deep-factor-agent bench` — compare against baseline
2. `pnpm -C packages/deep-factor-agent test` — verify all 246 tests still pass
3. `pnpm -C packages/deep-factor-tui test` — verify all 44 tests still pass

---

## Files Modified

| File | Change |
|------|--------|
| `package.json` (root) | Add `bench` script |
| `packages/deep-factor-agent/package.json` | Add `bench` script |
| `packages/deep-factor-tui/package.json` | Add `bench` script |
| `packages/deep-factor-agent/vitest.config.ts` | Add `benchmark` config |
| `packages/deep-factor-tui/vitest.config.ts` | Add `benchmark` config |
| `.gitignore` | Add `bench-results.json` |
| `packages/deep-factor-agent/__benchmarks__/xml-serializer.bench.ts` | New |
| `packages/deep-factor-agent/__benchmarks__/context-manager.bench.ts` | New |
| `packages/deep-factor-agent/__benchmarks__/stop-conditions.bench.ts` | New |
| `packages/deep-factor-agent/__benchmarks__/agent-utilities.bench.ts` | New |
| `packages/deep-factor-tui/__benchmarks__/startup.bench.ts` | New |
| `packages/deep-factor-agent/src/xml-serializer.ts` | Optimize `escapeXml` |
| `packages/deep-factor-agent/src/context-manager.ts` | Optimize `needsSummarization` |
