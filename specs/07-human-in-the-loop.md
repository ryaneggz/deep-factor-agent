# SPEC-07: Human-in-the-Loop via Tool Calls

## CONTEXT

Per Factor 7, human contact should be a structured tool call, not a plaintext escape hatch. This enables pause/resume workflows (Factor 6) where agents can request approval or input from humans as part of their execution.

### DEPENDENCIES
- SPEC-02 (core types: `PendingResult`, `HumanInputRequestedEvent`, `HumanInputReceivedEvent`)
- SPEC-04 (agent loop: pause/resume mechanism)

---

## API

### Request Human Input Tool

Automatically available when `interruptOn` is configured or when the agent needs human input.

```ts
const requestHumanInput = tool({
  description: "Request input or approval from a human. Use when you need clarification, confirmation, or a decision.",
  parameters: z.object({
    question: z.string().describe("The question to ask the human"),
    context: z.string().optional().describe("Background context to help the human answer"),
    urgency: z.enum(["low", "medium", "high"]).optional().default("medium"),
    format: z.enum(["free_text", "yes_no", "multiple_choice"]).optional().default("free_text"),
    choices: z.array(z.string()).optional().describe("Options for multiple_choice format"),
  }),
});
```

### Interrupt-on-Tool Config

Tools listed in `interruptOn` require human approval before execution.

```ts
const agent = createDeepFactorAgent({
  model: "anthropic:claude-sonnet-4-5",
  tools: { deleteUser, sendEmail, deployApp },
  interruptOn: ["deleteUser", "deployApp"],
});
```

When the agent calls `deleteUser`:
1. The tool call event is appended to the thread
2. The loop pauses and returns a `PendingResult`
3. The `PendingResult` includes a `resume()` function
4. The caller invokes `resume("approved")` or `resume("denied: reason")`
5. The response is appended as a `human_input_received` event
6. The loop continues

### Pause/Resume Flow

```ts
const result = await agent.loop("Delete inactive users older than 90 days");

if (result.stopReason === "human_input_needed") {
  // Show the question to a human (Slack, email, UI, etc.)
  console.log(result.thread.events.at(-1)); // HumanInputRequestedEvent

  // When human responds:
  const finalResult = await result.resume("Yes, proceed with deletion");
  console.log(finalResult.response);
}
```

---

## FILE STRUCTURE

- `src/human-in-the-loop.ts` -- tool definition, interrupt logic
- `src/human-in-the-loop.test.ts` -- unit tests

---

## ACCEPTANCE CRITERIA

- [ ] `requestHumanInput` tool is available to the agent
- [ ] Calling `requestHumanInput` pauses the loop and returns `PendingResult`
- [ ] `PendingResult.resume(response)` continues the loop with the human's response
- [ ] Tools listed in `interruptOn` trigger a pause before execution
- [ ] Pause appends `HumanInputRequestedEvent` to the thread
- [ ] Resume appends `HumanInputReceivedEvent` to the thread
- [ ] After resume, the loop continues from where it left off
- [ ] Multiple pause/resume cycles work within a single agent run
- [ ] Tests cover: explicit request, interrupt-on trigger, resume flow, denied action
- [ ] All tests pass (`pnpm test`)
