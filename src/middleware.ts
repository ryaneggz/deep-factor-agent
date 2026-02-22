import type { ToolSet } from "ai";
import { z } from "zod";
import type {
  AgentMiddleware,
  MiddlewareContext,
  ErrorEvent,
} from "./types.js";

export interface ComposedMiddleware {
  tools: ToolSet;
  beforeIteration: (ctx: MiddlewareContext) => Promise<void>;
  afterIteration: (ctx: MiddlewareContext, result: unknown) => Promise<void>;
}

export function composeMiddleware(
  middlewares: AgentMiddleware[],
): ComposedMiddleware {
  const tools: ToolSet = {};

  for (const mw of middlewares) {
    if (mw.tools) {
      for (const [name, tool] of Object.entries(mw.tools)) {
        if (name in tools) {
          console.warn(
            `Middleware tool conflict: "${name}" from "${mw.name}" overrides a previous definition`,
          );
        }
        (tools as Record<string, unknown>)[name] = tool;
      }
    }
  }

  const beforeIteration = async (ctx: MiddlewareContext): Promise<void> => {
    for (const mw of middlewares) {
      if (mw.beforeIteration) {
        await mw.beforeIteration(ctx);
      }
    }
  };

  const afterIteration = async (
    ctx: MiddlewareContext,
    result: unknown,
  ): Promise<void> => {
    for (const mw of middlewares) {
      if (mw.afterIteration) {
        await mw.afterIteration(ctx, result);
      }
    }
  };

  return { tools, beforeIteration, afterIteration };
}

export function todoMiddleware(): AgentMiddleware {
  const todoSchema = z.object({
    todos: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        status: z.enum(["pending", "in_progress", "done"]),
      }),
    ),
  });

  return {
    name: "todo",
    tools: {
      write_todos: {
        description: "Create or update the todo list for planning and tracking progress",
        parameters: todoSchema,
        execute: async (
          args: z.infer<typeof todoSchema>,
          { messages }: { messages?: unknown[] } = {},
        ) => {
          // Todos will be stored in thread.metadata.todos by the agent loop
          return { success: true, todos: args.todos };
        },
      },
      read_todos: {
        description: "Read the current todo list",
        parameters: z.object({}),
        execute: async () => {
          // The agent loop handles reading from thread.metadata.todos
          return { todos: [] };
        },
      },
    } as unknown as ToolSet,
  };
}

export function errorRecoveryMiddleware(): AgentMiddleware {
  return {
    name: "errorRecovery",
    afterIteration: async (
      ctx: MiddlewareContext,
      _result: unknown,
    ): Promise<void> => {
      const { thread } = ctx;
      if (thread.events.length === 0) return;

      const lastEvent = thread.events[thread.events.length - 1];
      if (lastEvent.type === "error") {
        const errorEvent = lastEvent as ErrorEvent;
        let errorMsg = errorEvent.error;
        if (errorMsg.length > 500) {
          errorMsg = errorMsg.substring(0, 500) + "... [truncated]";
        }

        thread.events.push({
          type: "message",
          role: "system",
          content: `Error occurred: ${errorMsg}\nConsider an alternative approach if the same error occurs again.`,
          timestamp: Date.now(),
          iteration: ctx.iteration,
        });
      }
    },
  };
}
