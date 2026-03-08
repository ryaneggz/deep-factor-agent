import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { z } from "zod";
import type { AgentTool, AgentToolMetadata } from "./types.js";

export function createLangChainTool<T extends z.ZodType>(
  name: string,
  config: {
    description: string;
    schema: T;
    execute: (args: z.infer<T>) => Promise<unknown>;
    metadata?: AgentToolMetadata;
  },
): StructuredToolInterface {
  const created = tool(
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
  (created as AgentTool).metadata = config.metadata;
  return created;
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

export function getToolMetadata(tool?: StructuredToolInterface): AgentToolMetadata | undefined {
  if (!tool) return undefined;
  return (tool as AgentTool).metadata;
}
