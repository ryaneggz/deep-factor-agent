# Plan: Research initChatModel Migration Spec

## Context

The `deep-factor-agent` library currently uses Vercel AI SDK v6 (`ai` package) for all LLM interactions. The user requested research on using LangChain's `initChatModel` as an alternative, with findings saved to the `specs/` folder.

## Completed

- **Research spec written** to `specs/initChatModel-migration.md` covering:
  - Current architecture (AI SDK v6 usage across all source files)
  - Target architecture (`initChatModel` API, imports, patterns)
  - Side-by-side comparison of model init, tool calling, streaming, message formats
  - Migration impact analysis per source file
  - Breaking changes for end users
  - Key advantages and risks
  - Alternative hybrid approach option
  - Reference links to LangChain documentation

## Key Findings

| Aspect | Current (AI SDK v6) | Target (LangChain initChatModel) |
|---|---|---|
| Model init | `anthropic("claude-sonnet-4-5")` | `initChatModel("anthropic:claude-sonnet-4-5")` |
| Generation | `generateText({model, messages, tools})` | `model.bindTools(tools).invoke(messages)` |
| Streaming | `streamText({model, messages})` | `model.stream(messages)` |
| Multi-step tools | `stepCountIs(20)` (automatic) | Manual tool loop required |
| Messages | Plain objects `{role, content}` | Class instances `HumanMessage`, `AIMessage` |
| Tool format | `{description, parameters, execute}` | `tool(fn, {name, description, schema})` |
| Dependencies | `ai`, `@ai-sdk/provider-utils` | `langchain`, `@langchain/core` |

## Files Affected (if migration proceeds)

- `src/agent.ts` - Core agent loop (high impact)
- `src/types.ts` - Type definitions (high impact)
- `src/context-manager.ts` - Summarization (medium impact)
- `src/middleware.ts` - Tool definitions (medium impact)
- `src/human-in-the-loop.ts` - Tool definition (medium impact)
- `src/create-agent.ts` - Factory types (low impact)
- `src/index.ts` - Re-exports (low impact)
- `package.json` - Dependencies (low impact)
- All `*.test.ts` files - Test updates (high impact)

## No Code Changes in This Task

This task was research-only. The spec at `specs/initChatModel-migration.md` serves as the reference document for a potential future migration.
