import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { z } from "zod";

export function createLangChainTool<T extends z.ZodType>(
  name: string,
  config: {
    description: string;
    schema: T;
    execute: (args: z.infer<T>) => Promise<unknown>;
  },
): StructuredToolInterface {
  return tool(
    async (args: z.infer<T>) => {
      const result = await config.execute(args);
      return typeof result === "string" ? result : JSON.stringify(result);
    },
    {
      name,
      description: config.description,
      schema: config.schema,
    },
  );
}

export function toolArrayToMap(
  tools: StructuredToolInterface[],
): Record<string, StructuredToolInterface> {
  const map: Record<string, StructuredToolInterface> = {};
  for (const t of tools) {
    map[t.name] = t;
  }
  return map;
}

export function findToolByName(
  tools: StructuredToolInterface[],
  name: string,
): StructuredToolInterface | undefined {
  return tools.find((t) => t.name === name);
}
