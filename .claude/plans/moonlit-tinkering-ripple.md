# Plan: Align Provider Adapter Outputs — Conformance Specs & Test Harnesses

## Context

The three provider adapters (Claude CLI, Codex CLI, Claude Agent SDK) implement `ModelAdapter` but have meaningful variance in their outputs. Before improving TUI rendering, we need a clear contract and conformance tests that document and validate each provider's output shape. This "middle out" approach establishes the unified target so providers can be individually fixed, then TUI improvements can build on stable ground.

**Key variance discovered:**
- **Tool call shape**: SDK adds extra `type: "tool_call"` field; CLI providers don't
- **Usage metadata**: Different cache field names (`cached_input_tokens` vs `cache_read_input_tokens`); SDK omits cache fields entirely
- **Streaming update ordering**: Claude CLI emits `assistant_message` before `tool_call`; Codex emits `tool_call` first
- **Streaming support**: SDK has no `invokeWithUpdates` at all
- **Error reporting**: Completely different strategies (CLI exit codes vs JSONL events vs SDK exceptions)

## Deliverables

### Phase 1: Per-Provider Behavior Specs (3 markdown files)

Document the current behavior of each provider for each scenario. Follow the existing spec format from `specs/archive/`.

1. **`specs/provider-claude-cli-behavior.md`**
   - Source: `packages/deep-factor-agent/src/providers/claude-cli.ts`
   - Document: message format, tool call shape, usage metadata fields, streaming update order, error handling, tool binding

2. **`specs/provider-codex-cli-behavior.md`**
   - Source: `packages/deep-factor-agent/src/providers/codex-cli.ts`
   - Document: same areas, noting JSONL event ordering, `contract_violation` handling, `cached_input_tokens` field name

3. **`specs/provider-claude-sdk-behavior.md`**
   - Source: `packages/deep-factor-agent/src/providers/claude-agent-sdk.ts`
   - Document: same areas, noting no streaming, extra `type` on tool calls, no cache fields

### Phase 2: Unified Contract Spec (1 markdown file)

4. **`specs/provider-unified-contract.md`**
   - Define the canonical `AIMessage` shape all providers must return
   - Define `ModelInvocationUpdate` ordering and invariants
   - Define normalized error vocabulary
   - Define `usage_metadata` field normalization
   - List per-provider gaps and required changes

**Canonical AIMessage contract:**
- `content`: always `string` (never null/undefined)
- `tool_calls`: always `Array<{ name: string; args: Record<string, unknown>; id: string }>` — no extra fields
- `usage_metadata`: always present with `{ input_tokens, output_tokens, total_tokens }` and optional `cache_read_input_tokens`, `cache_creation_input_tokens`

**Canonical update ordering:**
- Stream ends with exactly one `"final"` update
- `"final"` includes `usage` when available
- `"error"` updates always include `rawStopReason` string
- No updates after `"final"`

### Phase 3: Conformance Test Harness (6 TypeScript files)

Located in `specs/conformance/` with a dedicated vitest config so they run independently from unit tests.

5. **`specs/conformance/vitest.config.ts`** — Standalone vitest config for conformance tests

6. **`specs/conformance/types.ts`** — `MockController` interface for each provider to implement
   ```typescript
   interface MockController {
     setupSimpleText(text: string, usage?: Partial<TokenUsage>): void;
     setupSingleToolCall(call: { name: string; args: Record<string, unknown>; id: string }, text?: string): void;
     setupMultipleToolCalls(calls: Array<{ name: string; args: Record<string, unknown>; id: string }>): void;
     setupError(message: string): void;
     setupStreamSequence?(events: unknown[]): void;
   }
   ```

7. **`specs/conformance/fixtures.ts`** — Shared test data: input messages, mock tool definitions (including `Edit` tool for file edits), expected response shapes

8. **`specs/conformance/provider-contract.conformance.ts`** — Shared conformance suite exported as `runConformanceSuite(adapterFactory, controller, capabilities)`

   **Test scenarios:**
   | # | Scenario | Validates |
   |---|----------|-----------|
   | 1 | Simple text response | `content` is string, `tool_calls` is `[]`, `usage_metadata` present |
   | 2 | Single tool call | `tool_calls[0]` has correct shape, no extra `type` field |
   | 3 | Multiple tool calls | Correct count, unique IDs, ordering preserved |
   | 4 | Streaming updates | Ends with `final`, `usage` present, no post-final updates |
   | 5 | Error handling | Throws Error; if streaming, emits `error` update with `rawStopReason` |
   | 6 | Usage metadata | Numeric fields, cache fields are `number | undefined` (never null) |
   | 7 | Tool binding | `bindTools()` returns `ModelAdapter`, tools reflected in invocation |
   | 8 | File edit tool call | Edit tool call comes back with correct name and args shape |

9. **`specs/conformance/claude-cli.conformance.test.ts`** — Claude CLI adapter against the suite
   - Reuse mock patterns from `__tests__/providers/claude-cli.test.ts` (`simulateExecFile`, `simulateSpawnStream`)
   - Implements `MockController` for Claude CLI

10. **`specs/conformance/codex-cli.conformance.test.ts`** — Codex CLI adapter against the suite
    - Reuse mock patterns from `__tests__/providers/codex-cli.test.ts`
    - Implements `MockController` for Codex CLI

11. **`specs/conformance/claude-sdk.conformance.test.ts`** — Claude SDK adapter against the suite
    - Mocks dynamic `import()` of `@anthropic-ai/claude-agent-sdk`
    - Implements `MockController` for SDK; streaming scenarios use `it.skip` (no `invokeWithUpdates`)

### Phase 4: Package.json script

12. Add `"test:conformance"` script to `packages/deep-factor-agent/package.json`:
    ```
    "test:conformance": "vitest run --config ../../specs/conformance/vitest.config.ts"
    ```

## Key Files to Modify/Create

| Action | File |
|--------|------|
| Create | `specs/provider-claude-cli-behavior.md` |
| Create | `specs/provider-codex-cli-behavior.md` |
| Create | `specs/provider-claude-sdk-behavior.md` |
| Create | `specs/provider-unified-contract.md` |
| Create | `specs/conformance/vitest.config.ts` |
| Create | `specs/conformance/types.ts` |
| Create | `specs/conformance/fixtures.ts` |
| Create | `specs/conformance/provider-contract.conformance.ts` |
| Create | `specs/conformance/claude-cli.conformance.test.ts` |
| Create | `specs/conformance/codex-cli.conformance.test.ts` |
| Create | `specs/conformance/claude-sdk.conformance.test.ts` |
| Edit   | `packages/deep-factor-agent/package.json` (add test:conformance script) |

## Key Files to Reference (read-only)

- `packages/deep-factor-agent/src/providers/types.ts` — `ModelAdapter`, `ModelInvocationUpdate`, `ModelInvocationToolCall`
- `packages/deep-factor-agent/src/types.ts` — `TokenUsage`, `ToolDisplayMetadata`, `ToolExecutionResult`
- `packages/deep-factor-agent/src/providers/claude-cli.ts` — Claude CLI adapter
- `packages/deep-factor-agent/src/providers/codex-cli.ts` — Codex CLI adapter
- `packages/deep-factor-agent/src/providers/claude-agent-sdk.ts` — SDK adapter
- `packages/deep-factor-agent/src/providers/messages-to-xml.ts` — `parseToolCalls()` shared utility
- `packages/deep-factor-agent/__tests__/providers/` — Existing mock patterns to reuse

## Verification

1. `pnpm -C packages/deep-factor-agent test:conformance` — runs conformance suite
2. Some tests will **intentionally fail** for providers that don't yet meet the unified contract (e.g., SDK extra `type` field, missing cache fields). These are documented as `it.fails` or `it.skip` with comments referencing the unified contract spec.
3. After future provider fixes, those tests should flip to passing — confirming alignment.
4. `pnpm -C packages/deep-factor-agent type-check` — ensures all new TypeScript compiles
