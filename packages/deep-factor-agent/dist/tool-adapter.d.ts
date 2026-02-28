import type { StructuredToolInterface } from "@langchain/core/tools";
import type { z } from "zod";
export declare function createLangChainTool<T extends z.ZodType>(name: string, config: {
    description: string;
    schema: T;
    execute: (args: z.infer<T>) => Promise<unknown>;
}): StructuredToolInterface;
export declare function toolArrayToMap(tools: StructuredToolInterface[]): Record<string, StructuredToolInterface>;
export declare function findToolByName(tools: StructuredToolInterface[], name: string): StructuredToolInterface | undefined;
//# sourceMappingURL=tool-adapter.d.ts.map