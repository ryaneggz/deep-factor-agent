# Plan: Generate SPEC-02 for Parallel Tool Calling

## Context

GitHub Issue #4 requests **Example 13 — Parallel Tool Calling**: when the model returns multiple `tool_calls` in a single response, execute them concurrently with `Promise.all` instead of the current sequential `for...of await` pattern. The `.ralph/specs/` directory is empty (only `.gitkeep`), and the branch `ryaneggz/4-parallel-tool-calling` needs a spec to drive implementation.

## Action

Create a single spec file following the established `SPEC-NN` format (matching the structure of `SPEC-01-hitl-multiple-choice-example.md` from archive phase 0009):

### File: `.ralph/specs/SPEC-02-parallel-tool-calling.md`

Sections and content:

1. **CONTEXT** — Problem statement (all tool execution is sequential), derives-from table (Example 12 + agent core), relevant files table
2. **OVERVIEW** — High-level summary: fork Example 12, replace sequential `for...of await` with parallel `Promise.all`, keep HITL sequential, add timing display
3. **IMPLEMENTATION** — Detailed code-level guidance:
   - Imports (same as Example 12, plus `performance` from `node:perf_hooks`)
   - Tools array (unchanged: `bashTool` + `requestHumanInput`)
   - Thread helpers (unchanged)
   - New `executeToolsParallel()` helper — partitions tool calls into HITL vs parallelizable, runs `Promise.all`, returns results with per-tool timing
   - Modified `runToolLoop()` — replaces sequential loop with call to `executeToolsParallel()`, handles HITL calls sequentially, displays timing output
   - System prompt (updated to encourage multi-tool responses)
   - Main loop and `printSummary` (unchanged from Example 12)
4. **FILE STRUCTURE** — New file (`13-parallel-tool-calls.ts`), modified file (`README.md`)
5. **DESIGN DECISIONS** — Why `Promise.all` over `Promise.allSettled`, why HITL stays sequential, why timing display uses `performance.now()`
6. **ACCEPTANCE CRITERIA** — Mapped directly from the 7 acceptance criteria in the GitHub issue

### Key code patterns to include in the spec:

```typescript
// Partition tool calls
const hitlCalls = parsedToolCalls.filter(tc => tc.name === TOOL_NAME_REQUEST_HUMAN_INPUT);
const parallelCalls = parsedToolCalls.filter(tc => tc.name !== TOOL_NAME_REQUEST_HUMAN_INPUT);

// Execute in parallel with timing
const startTime = performance.now();
const results = await Promise.all(
  parallelCalls.map(async (tc) => {
    const t0 = performance.now();
    const foundTool = tools.find(t => t.name === tc.name);
    const result = foundTool ? await foundTool.invoke(tc.args) : `Unknown tool: ${tc.name}`;
    return { tc, result, duration: performance.now() - t0 };
  })
);
const parallelTime = performance.now() - startTime;
const sequentialTime = results.reduce((sum, r) => sum + r.duration, 0);
```

### Reused from existing codebase (no duplication):
- `createThread()`, `pushEvent()`, `extractText()` — from Example 12 (identical)
- `bashTool` definition — from Example 12 (identical)
- `collectHumanInput()` — from Example 12 (identical)
- `requestHumanInput`, `TOOL_NAME_REQUEST_HUMAN_INPUT`, `serializeThreadToXml` — from `dist/index.js`
- `MODEL_ID` — from `examples/env.js`

## Verification

After generating the spec:
- Confirm it matches the format of `.ralph/archive/0009-legion-laptop/specs/SPEC-01-hitl-multiple-choice-example.md`
- Confirm all 7 acceptance criteria from GitHub issue #4 are covered
- Confirm derives-from references point to correct files and line ranges
