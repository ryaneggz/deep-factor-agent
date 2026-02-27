# Implementation Plan — XML Thread Serialization & Retention

> Generated: 2026-02-26
> Specs: `xml-01`, `xml-02`, `xml-03`
> Status: **All 3 specs implemented and tested. 283 total tests passing.**

---

## Completed

### P0 — Fix `buildMessages()` (SPEC-03, Part A) — DONE

Fixed `buildMessages()` in `agent.ts` to handle all event types:
- `tool_call` → `AIMessage` with `tool_calls` array
- `tool_result` → `ToolMessage` with `tool_call_id` and stringified result
- `error` → `HumanMessage` with `[Error (recoverable/non-recoverable)]: ...`
- `completion` and `human_input_requested` → explicit no-op (documents intent)

### P1 — XML Thread Serializer Module (SPEC-01) — DONE

Created `src/xml-serializer.ts` with:
- `escapeXml()` — escapes `&`, `<`, `>`, `"`, `'`
- `serializeThreadToXml()` — converts `AgentEvent[]` to `<thread>` XML
- All 10 event types mapped per spec
- `Map<string, string>` toolCallId→toolName single-pass lookup
- `responsePrefix` option appended after `</thread>`
- 27 tests in `__tests__/xml-serializer.test.ts`

### P2 — XML Context Mode Integration (SPEC-02) — DONE

- `types.ts`: Added `contextMode?: "standard" | "xml"` to `DeepFactorAgentSettings`
- `agent.ts`: Added `contextMode` field, `buildXmlMessages()` method, dispatch in `runLoop()` and `stream()`
- `create-agent.ts`: Passes `contextMode` with `"standard"` default
- `index.ts`: Exports `serializeThreadToXml`, `escapeXml`, `XmlSerializerOptions`
- 5 tests in `__tests__/xml-context.test.ts`

### P3 — Thread Retention Integration Tests (SPEC-03, Part B) — DONE

6 integration tests in `__tests__/thread-retention.test.ts`:
1. Standard mode retains tool calls across iterations
2. Standard mode retains errors across iterations
3. XML mode retains all event types across iterations
4. Multi-iteration loop preserves tool history (standard)
5. Multi-iteration loop preserves tool history (XML)
6. Standard and XML modes produce equivalent information

---

## Test Counts

- Agent package: 173 tests across 11 files
- CLI package: 110 tests across 9 files
- Total: 283 tests, 0 failures, 0 skipped

## Codebase Health

- No `TODO`, `FIXME`, `HACK`, or `PLACEHOLDER` comments
- All type-checks pass in both packages
- ESM-only, LangChain-based architecture consistent throughout
- The `buildMessages()` bug from P0 is resolved
