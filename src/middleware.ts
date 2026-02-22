import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import type {
  AgentMiddleware,
  MiddlewareContext,
  ErrorEvent,
} from "./types.js";

export const TOOL_NAME_WRITE_TODOS = "write_todos";

export interface ComposedMiddleware {
  tools: StructuredToolInterface[];
  beforeIteration: (ctx: MiddlewareContext) => Promise<void>;
  afterIteration: (ctx: MiddlewareContext, result: unknown) => Promise<void>;
}

export function composeMiddleware(
  middlewares: AgentMiddleware[],
): ComposedMiddleware {
  const tools: StructuredToolInterface[] = [];

  for (const mw of middlewares) {
    if (mw.tools) {
      for (const t of mw.tools) {
        const existing = tools.findIndex((x) => x.name === t.name);
        if (existing >= 0) {
          console.warn(
            `Middleware tool conflict: "${t.name}" from "${mw.name}" overrides a previous definition`,
          );
          tools[existing] = t;
        } else {
          tools.push(t);
        }
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

  // Closure-scoped state so read_todos returns what write_todos persisted.
  // agent.ts also copies to thread.metadata.todos for external access.
  let currentTodos: z.infer<typeof todoSchema>["todos"] = [];

  return {
    name: "todo",
    tools: [
      tool(
        async (args: z.infer<typeof todoSchema>) => {
          currentTodos = args.todos;
          return JSON.stringify({ success: true, todos: args.todos });
        },
        {
          name: TOOL_NAME_WRITE_TODOS,
          description:
            "Create or update the todo list for planning and tracking progress",
          schema: todoSchema,
        },
      ),
      tool(
        async () => {
          return JSON.stringify({ todos: currentTodos });
        },
        {
          name: "read_todos",
          description: "Read the current todo list",
          schema: z.object({}),
        },
      ),
    ],
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
