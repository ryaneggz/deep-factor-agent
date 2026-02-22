# SPEC-05: Middleware System

## CONTEXT

Middleware extends agent capabilities without modifying the core loop. Inspired by DeepAgents' middleware stack (planning, filesystem, summarization) but simplified for the MVP. Middleware can contribute tools and hook into iteration lifecycle.

### DEPENDENCIES
- SPEC-02 (core types: `AgentMiddleware`)
- SPEC-04 (agent loop integrates middleware)

---

## API

### Middleware Interface

```ts
interface AgentMiddleware {
  name: string;
  /** Additional tools contributed by this middleware */
  tools?: ToolSet;
  /** Called before each outer loop iteration */
  beforeIteration?: (ctx: MiddlewareContext) => Promise<void>;
  /** Called after each outer loop iteration */
  afterIteration?: (ctx: MiddlewareContext, result: unknown) => Promise<void>;
}
```

### Composition

```ts
function composeMiddleware(middlewares: AgentMiddleware[]): {
  tools: ToolSet;
  beforeIteration: (ctx: MiddlewareContext) => Promise<void>;
  afterIteration: (ctx: MiddlewareContext, result: unknown) => Promise<void>;
};
```

- Tools are merged (name conflicts: later middleware wins with a warning)
- `beforeIteration` hooks run in order
- `afterIteration` hooks run in order

### Built-in: Todo Middleware

Provides planning/task-tracking tools (inspired by DeepAgents' `todoListMiddleware`).

```ts
function todoMiddleware(): AgentMiddleware;
```

**Tools contributed:**
- `write_todos` -- Create/update a todo list for the current task
  - Args: `{ todos: Array<{ id: string; text: string; status: "pending" | "in_progress" | "done" }> }`
- `read_todos` -- Read the current todo list
  - Args: `{}`
  - Returns: current todos array

Todos are stored in the thread metadata under `todos` key.

### Built-in: Error Recovery Middleware

Formats errors into compact, LLM-readable context (Factor 9).

```ts
function errorRecoveryMiddleware(): AgentMiddleware;
```

**Behavior:**
- `afterIteration`: if the last event is an error, formats it with truncation (max 500 chars for stack traces) and appends a hint: `"Consider an alternative approach if the same error occurs again."`

---

## FILE STRUCTURE

- `src/middleware.ts` -- `composeMiddleware`, built-in middleware factories
- `src/middleware.test.ts` -- unit tests

---

## ACCEPTANCE CRITERIA

- [ ] `composeMiddleware` merges tools from all middleware
- [ ] `beforeIteration` hooks execute in order
- [ ] `afterIteration` hooks execute in order
- [ ] `todoMiddleware` provides `write_todos` and `read_todos` tools
- [ ] Todos are persisted in `thread.metadata.todos`
- [ ] `errorRecoveryMiddleware` formats errors compactly
- [ ] Custom middleware can be passed via settings and is appended after built-ins
- [ ] Tests cover composition, tool merging, hook ordering, and each built-in
- [ ] All tests pass (`pnpm test`)
