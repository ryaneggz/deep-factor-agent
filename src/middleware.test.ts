import { describe, it, expect, vi } from "vitest";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  composeMiddleware,
  todoMiddleware,
  errorRecoveryMiddleware,
} from "./middleware.js";
import type {
  AgentMiddleware,
  MiddlewareContext,
  AgentThread,
  DeepFactorAgentSettings,
  ErrorEvent,
} from "./types.js";

function makeThread(): AgentThread {
  return {
    id: "test-thread",
    events: [],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeCtx(
  overrides: Partial<MiddlewareContext> = {},
): MiddlewareContext {
  return {
    thread: makeThread(),
    iteration: 1,
    settings: { model: "test-model" } as DeepFactorAgentSettings,
    ...overrides,
  };
}

describe("composeMiddleware", () => {
  it("merges tools from multiple middleware", () => {
    const mw1: AgentMiddleware = {
      name: "mw1",
      tools: [
        tool(async () => "a", {
          name: "tool_a",
          description: "A",
          schema: z.object({}),
        }),
      ],
    };
    const mw2: AgentMiddleware = {
      name: "mw2",
      tools: [
        tool(async () => "b", {
          name: "tool_b",
          description: "B",
          schema: z.object({}),
        }),
      ],
    };

    const composed = composeMiddleware([mw1, mw2]);
    const toolNames = composed.tools.map((t) => t.name);
    expect(toolNames).toContain("tool_a");
    expect(toolNames).toContain("tool_b");
  });

  it("later middleware wins on tool name conflicts with warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mw1: AgentMiddleware = {
      name: "mw1",
      tools: [
        tool(async () => "v1", {
          name: "shared_tool",
          description: "V1",
          schema: z.object({}),
        }),
      ],
    };
    const mw2: AgentMiddleware = {
      name: "mw2",
      tools: [
        tool(async () => "v2", {
          name: "shared_tool",
          description: "V2",
          schema: z.object({}),
        }),
      ],
    };

    const composed = composeMiddleware([mw1, mw2]);
    const sharedTool = composed.tools.find((t) => t.name === "shared_tool");
    expect(sharedTool!.description).toBe("V2");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("shared_tool"),
    );

    warnSpy.mockRestore();
  });

  it("executes beforeIteration hooks in order", async () => {
    const order: string[] = [];

    const mw1: AgentMiddleware = {
      name: "mw1",
      beforeIteration: async () => {
        order.push("mw1");
      },
    };
    const mw2: AgentMiddleware = {
      name: "mw2",
      beforeIteration: async () => {
        order.push("mw2");
      },
    };

    const composed = composeMiddleware([mw1, mw2]);
    await composed.beforeIteration(makeCtx());
    expect(order).toEqual(["mw1", "mw2"]);
  });

  it("executes afterIteration hooks in order", async () => {
    const order: string[] = [];

    const mw1: AgentMiddleware = {
      name: "mw1",
      afterIteration: async () => {
        order.push("mw1");
      },
    };
    const mw2: AgentMiddleware = {
      name: "mw2",
      afterIteration: async () => {
        order.push("mw2");
      },
    };

    const composed = composeMiddleware([mw1, mw2]);
    await composed.afterIteration(makeCtx(), {});
    expect(order).toEqual(["mw1", "mw2"]);
  });

  it("handles middleware with no hooks gracefully", async () => {
    const mw: AgentMiddleware = { name: "empty" };
    const composed = composeMiddleware([mw]);
    await composed.beforeIteration(makeCtx());
    await composed.afterIteration(makeCtx(), {});
    expect(composed.tools).toHaveLength(0);
  });
});

describe("todoMiddleware", () => {
  it("returns middleware with name 'todo'", () => {
    const mw = todoMiddleware();
    expect(mw.name).toBe("todo");
  });

  it("provides write_todos and read_todos tools", () => {
    const mw = todoMiddleware();
    expect(mw.tools).toBeDefined();
    const toolNames = mw.tools!.map((t) => t.name);
    expect(toolNames).toContain("write_todos");
    expect(toolNames).toContain("read_todos");
  });

  it("write_todos tool returns success with todos", async () => {
    const mw = todoMiddleware();
    const writeTool = mw.tools!.find((t) => t.name === "write_todos")!;
    const result = await writeTool.invoke({
      todos: [{ id: "1", text: "Test task", status: "pending" }],
    });
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.todos).toHaveLength(1);
    expect(parsed.todos[0].text).toBe("Test task");
  });

  it("read_todos tool returns todos array", async () => {
    const mw = todoMiddleware();
    const readTool = mw.tools!.find((t) => t.name === "read_todos")!;
    const result = await readTool.invoke({});
    const parsed = JSON.parse(result as string);
    expect(parsed.todos).toBeDefined();
    expect(Array.isArray(parsed.todos)).toBe(true);
  });
});

describe("errorRecoveryMiddleware", () => {
  it("returns middleware with name 'errorRecovery'", () => {
    const mw = errorRecoveryMiddleware();
    expect(mw.name).toBe("errorRecovery");
  });

  it("appends recovery hint when last event is an error", async () => {
    const mw = errorRecoveryMiddleware();
    const thread = makeThread();

    const errorEvent: ErrorEvent = {
      type: "error",
      error: "Something went wrong",
      recoverable: true,
      timestamp: Date.now(),
      iteration: 1,
    };
    thread.events.push(errorEvent);

    const ctx = makeCtx({ thread });
    await mw.afterIteration!(ctx, {});

    expect(thread.events).toHaveLength(2);
    const lastEvent = thread.events[1];
    expect(lastEvent.type).toBe("message");
    if (lastEvent.type === "message") {
      expect(lastEvent.content).toContain("Something went wrong");
      expect(lastEvent.content).toContain(
        "Consider an alternative approach",
      );
    }
  });

  it("truncates long error messages at 500 chars", async () => {
    const mw = errorRecoveryMiddleware();
    const thread = makeThread();
    const longError = "x".repeat(1000);

    const errorEvent: ErrorEvent = {
      type: "error",
      error: longError,
      recoverable: true,
      timestamp: Date.now(),
      iteration: 1,
    };
    thread.events.push(errorEvent);

    const ctx = makeCtx({ thread });
    await mw.afterIteration!(ctx, {});

    const lastEvent = thread.events[1];
    if (lastEvent.type === "message") {
      expect(lastEvent.content).toContain("[truncated]");
      expect(lastEvent.content.length).toBeLessThan(1000);
    }
  });

  it("does nothing when last event is not an error", async () => {
    const mw = errorRecoveryMiddleware();
    const thread = makeThread();

    thread.events.push({
      type: "message",
      role: "assistant",
      content: "Hello",
      timestamp: Date.now(),
      iteration: 1,
    });

    const ctx = makeCtx({ thread });
    await mw.afterIteration!(ctx, {});

    expect(thread.events).toHaveLength(1);
  });

  it("does nothing when thread has no events", async () => {
    const mw = errorRecoveryMiddleware();
    const thread = makeThread();
    const ctx = makeCtx({ thread });
    await mw.afterIteration!(ctx, {});
    expect(thread.events).toHaveLength(0);
  });
});

describe("custom middleware appended after built-in", () => {
  it("custom middleware runs after built-in in composed order", async () => {
    const order: string[] = [];

    const builtIn: AgentMiddleware = {
      name: "builtIn",
      beforeIteration: async () => {
        order.push("builtIn");
      },
    };
    const custom: AgentMiddleware = {
      name: "custom",
      beforeIteration: async () => {
        order.push("custom");
      },
    };

    const composed = composeMiddleware([builtIn, custom]);
    await composed.beforeIteration(makeCtx());
    expect(order).toEqual(["builtIn", "custom"]);
  });
});
