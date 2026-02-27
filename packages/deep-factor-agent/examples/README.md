# deep-factor-agent Examples

Runnable TypeScript examples demonstrating the deep-factor-agent library.

## Prerequisites

1. Build the library first (from repo root):
   ```bash
   make build
   ```

2. Install dev dependencies (if not already):
   ```bash
   make install
   ```

3. Create a `.env` file in the package directory (copy from `.env.example`):
   ```bash
   cp packages/deep-factor-agent/.env.example packages/deep-factor-agent/.env
   ```

4. Add your API key to `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

## Running Examples

Each example is standalone. Run from the repo root with `npx tsx`:

```bash
cd packages/deep-factor-agent

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

# XML context mode (vs standard)
npx tsx examples/08-xml-context-mode.ts

# Thread retention & inspection
npx tsx examples/09-thread-inspection.ts

# Multi-turn streaming chat with XML thread (interactive)
npx tsx examples/10-xml-multi-turn-stream.ts

# Multi-turn streaming chat with bash tool + XML thread (interactive)
npx tsx examples/11-xml-tools-stream.ts
```

## Configuration

Set `MODEL_ID` in your `.env` to use a different model:

```
MODEL_ID=claude-sonnet-4-5
ANTHROPIC_API_KEY=sk-ant-...
```

Supported models include any model supported by LangChain's `initChatModel`:
- `claude-sonnet-4-5`, `claude-haiku-4-5`, `claude-opus-4-5` (Anthropic)
- `gpt-4.1`, `gpt-4.1-mini` (OpenAI)
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
| 08 | `08-xml-context-mode.ts` | XML thread serialization vs standard context mode |
| 09 | `09-thread-inspection.ts` | Thread retention, event inspection, XML export |
| 10 | `10-xml-multi-turn-stream.ts` | Interactive multi-turn chat with streamed responses and XML thread |
| 11 | `11-xml-tools-stream.ts` | Multi-turn streaming chat with bash tool, tool calls shown inline |
