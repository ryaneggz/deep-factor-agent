# SPEC-04: Agent Loop (Core Engine)

## CONTEXT

The agent loop is the core execution engine. It implements a dual-loop architecture: an outer verification loop and an inner tool-calling loop powered by Vercel AI SDK. This is where most 12-factor principles are realized.

### DEPENDENCIES
- SPEC-02 (core types)
- SPEC-03 (stop conditions)

---

## ARCHITECTURE

### Dual-Loop Design

```
Outer Loop (verification + retry)
  |
  +-- Iteration 1:
  |     Build messages from thread
  |     Run middleware.beforeIteration()
  |     Inner Loop: generateText({ model, tools, messages })
  |     Append events to thread
  |     Run middleware.afterIteration()
  |     Check stop conditions
  |     Call verifyCompletion() -> incomplete, inject feedback
  |
  +-- Iteration 2:
  |     Same as above with feedback in context
  |     verifyCompletion() -> complete! Return result.
  |
  +-- (or) Stop condition met -> return with stopReason
```

### Pseudocode

```ts
class DeepFactorAgent {
  async loop(prompt: string): Promise<AgentResult | PendingResult> {
    const thread = createThread();
    thread.events.push(messageEvent("user", prompt));

    let iteration = 0;
    let consecutiveErrors = 0;
    let totalUsage = emptyUsage();

    while (true) {
      iteration++;

      // Run beforeIteration hooks
      for (const mw of this.middleware) {
        await mw.beforeIteration?.({ thread, iteration, settings: this.settings });
      }

      // Build messages from thread
      const messages = this.buildMessages(thread);

      // Inner loop: AI SDK tool calling
      try {
        const result = await generateText({
          model: this.model,
          tools: this.allTools,
          messages,
          maxSteps: 20,
        });

        // Append tool calls, results, and response as events
        this.appendResultEvents(thread, result, iteration);
        totalUsage = addUsage(totalUsage, result.usage);
        consecutiveErrors = 0;

      } catch (error) {
        consecutiveErrors++;
        thread.events.push(errorEvent(error, iteration));

        if (consecutiveErrors >= 3) {
          return { stopReason: "max_errors", ... };
        }
        continue; // retry
      }

      // Run afterIteration hooks
      for (const mw of this.middleware) {
        await mw.afterIteration?.({ thread, iteration, settings: this.settings }, result);
      }

      // Check stop conditions
      const stopResult = evaluateStopConditions(this.stopConditions, {
        iteration, usage: totalUsage, model: this.modelId, thread,
      });
      if (stopResult) {
        return { stopReason: "stop_condition", stopDetail: stopResult.reason, ... };
      }

      // Check for human input request
      if (this.isPendingHumanInput(thread)) {
        return { stopReason: "human_input_needed", resume: ... };
      }

      // Verify completion
      if (this.verifyCompletion) {
        const verification = await this.verifyCompletion({
          result: lastResponse, iteration, thread, originalPrompt: prompt,
        });

        if (verification.complete) {
          return { stopReason: "completed", ... };
        }

        // Inject feedback for next iteration
        if (verification.reason) {
          thread.events.push(messageEvent("user",
            `Previous attempt was not complete. Feedback: ${verification.reason}`
          ));
        }
      } else {
        // No verification = single iteration
        return { stopReason: "completed", ... };
      }
    }
  }
}
```

### Key Behaviors

1. **Stateless Reducer (Factor 12)**: The agent reads the full thread to determine the next action. No hidden internal state.
2. **Unified State (Factor 5)**: Every tool call, result, error, and message is an `AgentEvent` in the thread.
3. **Compact Errors (Factor 9)**: Errors are caught, formatted, and appended to the thread. The LLM reads them and self-corrects. Max 3 consecutive errors before abort.
4. **Own Control Flow (Factor 8)**: The loop is explicit code, not framework magic. Developers can see and modify every step.
5. **Verification Feedback**: When verification fails, the reason is injected as context so the agent can self-correct on the next iteration.

---

## FILE STRUCTURE

- `src/agent.ts` -- `DeepFactorAgent` class with `loop()` and `stream()` methods
- `src/agent.test.ts` -- unit tests with mocked LLM

---

## ACCEPTANCE CRITERIA

- [ ] `loop(prompt)` executes the outer loop and returns `AgentResult`
- [ ] Inner loop uses `generateText()` from Vercel AI SDK with tools
- [ ] Tool calls and results are appended as `AgentEvent` entries to the thread
- [ ] Errors are caught, counted, and appended as `ErrorEvent`
- [ ] After 3 consecutive errors, loop exits with `stopReason: "max_errors"`
- [ ] Stop conditions are evaluated between iterations
- [ ] `verifyCompletion` is called after each iteration when provided
- [ ] Verification feedback is injected into context for next iteration
- [ ] Without `verifyCompletion`, agent runs a single iteration
- [ ] `stream()` uses `streamText()` on the final iteration
- [ ] Token usage is aggregated across all iterations
- [ ] Thread is included in the result for inspection
- [ ] Tests cover: single iteration, multi-iteration, error recovery, stop condition, no verification
- [ ] All tests pass (`pnpm test`)
