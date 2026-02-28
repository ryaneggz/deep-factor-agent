import { tool } from "@langchain/core/tools";
import { z } from "zod";
export const TOOL_NAME_WRITE_TODOS = "write_todos";
export function composeMiddleware(middlewares, options) {
    const tools = [];
    const onConflict = options?.onConflict ??
        ((toolName, middlewareName) => {
            console.warn(`Middleware tool conflict: "${toolName}" from "${middlewareName}" overrides a previous definition`);
        });
    for (const mw of middlewares) {
        if (mw.tools) {
            for (const t of mw.tools) {
                const existing = tools.findIndex((x) => x.name === t.name);
                if (existing >= 0) {
                    onConflict(t.name, mw.name);
                    tools[existing] = t;
                }
                else {
                    tools.push(t);
                }
            }
        }
    }
    const beforeIteration = async (ctx) => {
        for (const mw of middlewares) {
            if (mw.beforeIteration) {
                await mw.beforeIteration(ctx);
            }
        }
    };
    const afterIteration = async (ctx, result) => {
        for (const mw of middlewares) {
            if (mw.afterIteration) {
                await mw.afterIteration(ctx, result);
            }
        }
    };
    return { tools, beforeIteration, afterIteration };
}
export function todoMiddleware() {
    const todoSchema = z.object({
        todos: z.array(z.object({
            id: z.string(),
            text: z.string(),
            status: z.enum(["pending", "in_progress", "done"]),
        })),
    });
    // Closure-scoped state so read_todos returns what write_todos persisted.
    // agent.ts also copies to thread.metadata.todos for external access.
    let currentTodos = [];
    return {
        name: "todo",
        tools: [
            tool(async (args) => {
                currentTodos = args.todos;
                return JSON.stringify({ success: true, todos: args.todos });
            }, {
                name: TOOL_NAME_WRITE_TODOS,
                description: "Create or update the todo list for planning and tracking progress",
                schema: todoSchema,
            }),
            tool(async () => {
                return JSON.stringify({ todos: currentTodos });
            }, {
                name: "read_todos",
                description: "Read the current todo list",
                schema: z.object({}),
            }),
        ],
    };
}
export function errorRecoveryMiddleware() {
    return {
        name: "errorRecovery",
        afterIteration: async (ctx, _result) => {
            const { thread } = ctx;
            if (thread.events.length === 0)
                return;
            const lastEvent = thread.events[thread.events.length - 1];
            if (lastEvent.type === "error") {
                const errorEvent = lastEvent;
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
