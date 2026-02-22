# Plan: Change default model to `gpt-4.1-mini`

## Context

The default model in examples is `claude-sonnet-4-5`, which requires `ANTHROPIC_API_KEY`. The user wants the default to be `gpt-4.1-mini` (uses `OPENAI_API_KEY`), so examples work out-of-the-box with an OpenAI key.

## Changes

### 1. `examples/env.ts` — Change default model
- Line 4: Change `"claude-sonnet-4-5"` → `"gpt-4.1-mini"`

### 2. `.env.example` — Update to reference OpenAI as primary
- Line 2: Change `ANTHROPIC_API_KEY=your-api-key-here` → `OPENAI_API_KEY=your-api-key-here`
- Line 4-5: Update comment and commented-out `MODEL_ID` to reference `gpt-4.1-mini`

### 3. `src/stop-conditions.ts` — Add `gpt-4.1-mini` pricing
- Add `"gpt-4.1-mini"` entry to `MODEL_PRICING` (OpenAI section, ~lines 38-46)
- Pricing: input $0.40/1M tokens → `0.0000004`, output $1.60/1M tokens → `0.0000016`

### 4. `README.md` — Update all example model strings
- Replace all `"anthropic:claude-sonnet-4-5"` → `"openai:gpt-4.1-mini"` (lines 44, 61, 75, 101, 127, 151, 180, 202, 215, 231)
- Update provider install example (line 33): `@langchain/anthropic` → `@langchain/openai`
- Update the `initChatModel` example (lines 60-62): update model string and `modelProvider`
- Line 20: Update "Universal model support" example string
- Line 362: Update 12-factor alignment mention

## Files modified
- `examples/env.ts`
- `.env.example`
- `src/stop-conditions.ts`
- `README.md`

## Verification
1. `pnpm build` — should compile cleanly
2. `pnpm test` — all tests pass (stop-conditions tests may reference existing models)
3. `npx tsx examples/01-basic.ts` — should use `gpt-4.1-mini` and require `OPENAI_API_KEY`
