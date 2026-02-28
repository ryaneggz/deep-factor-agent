import type { StructuredToolInterface } from "@langchain/core/tools";
import type { AgentMiddleware, MiddlewareContext } from "./types.js";
export declare const TOOL_NAME_WRITE_TODOS = "write_todos";
export interface ComposedMiddleware {
    tools: StructuredToolInterface[];
    beforeIteration: (ctx: MiddlewareContext) => Promise<void>;
    afterIteration: (ctx: MiddlewareContext, result: unknown) => Promise<void>;
}
export interface ComposeMiddlewareOptions {
    /** Called when two middleware provide a tool with the same name. Defaults to `console.warn`. */
    onConflict?: (toolName: string, middlewareName: string) => void;
}
export declare function composeMiddleware(middlewares: AgentMiddleware[], options?: ComposeMiddlewareOptions): ComposedMiddleware;
export declare function todoMiddleware(): AgentMiddleware;
export declare function errorRecoveryMiddleware(): AgentMiddleware;
//# sourceMappingURL=middleware.d.ts.map