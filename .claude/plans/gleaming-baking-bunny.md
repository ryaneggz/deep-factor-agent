# Plan: Fix CLI Provider Tool Schema Serialization

## Context

Example 14 (`examples/14-claude-codex-delegation.ts`) fails with `max_errors` (3 consecutive errors) for both Claude and Codex providers. The previous plan added error event display (already implemented), which revealed the root cause: **the tool schemas are serialized as raw Zod v4 internals** (`def`, `shape`, `format`, `minLength`, etc.) instead of proper JSON Schema.

Both `claude-cli.ts` and `codex-cli.ts` use `JSON.parse(JSON.stringify(t.schema))` to serialize tool schemas. Since `t.schema` is a `ZodObject` instance, `JSON.stringify` dumps Zod's internal representation — not valid JSON Schema. This produces a huge, invalid prompt that causes the CLI commands to fail.

## Root Cause

**File:** `src/providers/claude-cli.ts` (lines 74-76) and `src/providers/codex-cli.ts` (lines 74-76)

```ts
parameters:
  "schema" in t && t.schema
    ? JSON.parse(JSON.stringify(t.schema))  // ← Serializes Zod internals, not JSON Schema
    : {},
```

## Fix

Use Zod v4's built-in `toJSONSchema()` to convert Zod schemas to proper JSON Schema. Zod v4 (`>=4.0.0`, already a dependency) exports `toJSONSchema` natively — no new dependencies needed.

Verified that `toJSONSchema(zodSchema)` produces clean output:
```json
{"type":"object","properties":{"expression":{"type":"string","description":"..."}},"required":["expression"]}
```

### 1. Fix `claude-cli.ts` — use `toJSONSchema` for tool parameter serialization

**File:** `packages/deep-factor-agent/src/providers/claude-cli.ts`

- Add `import { toJSONSchema } from "zod"` at top
- Replace `JSON.parse(JSON.stringify(t.schema))` with `toJSONSchema(t.schema)` (line 76)

### 2. Fix `codex-cli.ts` — same change

**File:** `packages/deep-factor-agent/src/providers/codex-cli.ts`

- Add `import { toJSONSchema } from "zod"` at top
- Replace `JSON.parse(JSON.stringify(t.schema))` with `toJSONSchema(t.schema)` (line 76)

### 3. Update tests to verify proper JSON Schema output

**Files:** `__tests__/providers/claude-cli.test.ts` and `__tests__/providers/codex-cli.test.ts`

Both test files have an "injects tool definitions into prompt when tools bound" test that uses a mock tool with a plain-object schema (not a Zod schema). Add a test with a real Zod schema to verify proper JSON Schema serialization:

- Add a test that binds a tool with a real Zod schema and asserts the prompt contains `"type": "string"` (JSON Schema) and does NOT contain `"def"` or `"shape"` (Zod internals)

## Files to Edit

| File | Action |
|------|--------|
| `src/providers/claude-cli.ts` | Import `toJSONSchema` from `zod`, replace `JSON.parse(JSON.stringify(t.schema))` |
| `src/providers/codex-cli.ts` | Same change |
| `__tests__/providers/claude-cli.test.ts` | Add test with real Zod schema |
| `__tests__/providers/codex-cli.test.ts` | Add test with real Zod schema |

## Verification

1. `pnpm -C packages/deep-factor-agent build` — build succeeds
2. `pnpm -C packages/deep-factor-agent test` — all tests pass
3. `pnpm -C packages/deep-factor-agent type-check` — no type errors
4. `npx tsx examples/14-claude-codex-delegation.ts` — tool definitions in prompt now use clean JSON Schema (may still fail if CLI binaries aren't installed, but the prompt will be well-formed)
