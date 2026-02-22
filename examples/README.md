# deep-factor-agent Examples

Runnable TypeScript examples demonstrating the deep-factor-agent library.

## Prerequisites

1. Build the library first:
   ```bash
   pnpm build
   ```

2. Install dev dependencies (if not already):
   ```bash
   pnpm install
   ```

3. Create a `.env` file in the project root (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

4. Add your API key to `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

## Running Examples

Each example is standalone. Run with `npx tsx`:

```bash
# Basic agent (no tools)
npx tsx examples/01-basic.ts

# Agent with tools
npx tsx examples/02-tools.ts

# Streaming output
npx tsx examples/03-streaming.ts

# Stop conditions & cost tracking
npx tsx examples/04-stop-conditions.ts

# Custom middleware
npx tsx examples/05-middleware.ts

# Human-in-the-loop
npx tsx examples/06-human-in-the-loop.ts

# Verification & self-correction
npx tsx examples/07-verification.ts
```

## Configuration

Set `MODEL_ID` in your `.env` to use a different model:

```
MODEL_ID=claude-sonnet-4-5
ANTHROPIC_API_KEY=sk-ant-...
```

Supported models include any model supported by LangChain's `initChatModel`:
- `claude-sonnet-4-5`, `claude-haiku-4-5`, `claude-opus-4-5` (Anthropic)
- `gpt-4o`, `gpt-4o-mini` (OpenAI)
- `gemini-2.5-pro`, `gemini-2.5-flash` (Google)

## Example Overview

| # | File | Feature |
|---|------|---------|
| 01 | `01-basic.ts` | Minimal agent: model + prompt, no tools |
| 02 | `02-tools.ts` | Agent with LangChain tools (calculator, weather) |
| 03 | `03-streaming.ts` | Real-time streaming via `agent.stream()` |
| 04 | `04-stop-conditions.ts` | Stop conditions (maxIterations, maxCost, maxTokens) |
| 05 | `05-middleware.ts` | Custom middleware (logging, timing, tool-providing) |
| 06 | `06-human-in-the-loop.ts` | Pause/resume with simulated human input |
| 07 | `07-verification.ts` | Verification with structural checks and self-correction |
