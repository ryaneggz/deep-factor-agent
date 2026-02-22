# SPEC-08: Context Management & Summarization

## CONTEXT

Long-running agents accumulate large context windows. This spec addresses Factor 3 (own your context window) and Factor 13 (pre-fetch context) by providing automatic context compression when token budgets are exceeded.

### DEPENDENCIES
- SPEC-02 (core types: `ContextManagementConfig`, `SummaryEvent`)
- SPEC-04 (agent loop integrates context manager)

---

## API

### ContextManager Class

```ts
class ContextManager {
  constructor(config: ContextManagementConfig);

  /** Estimate tokens in a string (~3.5 chars per token) */
  estimateTokens(text: string): number;

  /** Estimate total tokens in the current thread */
  estimateThreadTokens(thread: AgentThread): number;

  /** Check if summarization is needed */
  needsSummarization(thread: AgentThread): boolean;

  /** Summarize older iterations, keeping recent ones in full */
  summarize(thread: AgentThread, model: LanguageModel): Promise<AgentThread>;

  /** Build context string from summaries for system prompt injection */
  buildContextInjection(thread: AgentThread): string;
}
```

### Configuration

```ts
interface ContextManagementConfig {
  /** Max total estimated tokens before summarization triggers (default: 150000) */
  maxContextTokens?: number;
  /** Number of most recent iterations to keep in full detail (default: 3) */
  keepRecentIterations?: number;
}
```

### Summarization Behavior

1. After each iteration, `needsSummarization()` checks if estimated tokens exceed `maxContextTokens`
2. If yes, `summarize()` groups events by iteration
3. Old iterations (beyond `keepRecentIterations`) are compressed:
   - Each old iteration's events are summarized into a 2-3 sentence `SummaryEvent`
   - Original events for those iterations are removed from the thread
4. Recent iterations are preserved in full detail
5. `buildContextInjection()` produces a formatted string of summaries for the system prompt

### Token Estimation

```ts
function estimateTokens(text: string): number;
// Returns Math.ceil(text.length / 3.5)
```

---

## FILE STRUCTURE

- `src/context-manager.ts` -- `ContextManager` class, `estimateTokens` utility
- `src/context-manager.test.ts` -- unit tests

---

## ACCEPTANCE CRITERIA

- [ ] `estimateTokens("hello")` returns a reasonable estimate
- [ ] `estimateThreadTokens` sums token estimates across all events
- [ ] `needsSummarization` returns `true` when estimated tokens exceed `maxContextTokens`
- [ ] `summarize` replaces old iteration events with `SummaryEvent` entries
- [ ] Recent iterations (per `keepRecentIterations`) are preserved unchanged
- [ ] `buildContextInjection` produces a formatted string of iteration summaries
- [ ] Integrated with agent loop: summarization runs between iterations when needed
- [ ] Tests cover: estimation, threshold detection, summarization, context injection
- [ ] All tests pass (`pnpm test`)
