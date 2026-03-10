import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { z } from "zod";
import type { AgentTool, AgentToolMetadata, ToolExecutionResult } from "./types.js";

function isToolExecutionResult(value: unknown): value is ToolExecutionResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "content" in value &&
    typeof (value as { content: unknown }).content === "string"
  );
}

export function createLangChainTool<T extends z.ZodType>(
  name: string,
  config: {
    description: string;
    schema: T;
    execute: (args: z.infer<T>) => Promise<string | ToolExecutionResult | unknown>;
    metadata?: AgentToolMetadata;
  },
): StructuredToolInterface {
  const created = tool(
    async (args: z.infer<T>) => {
      const result = await config.execute(args);
      if (typeof result === "string") {
        return result;
      }
      if (isToolExecutionResult(result)) {
        return result.content;
      }
      return JSON.stringify(result);
    },
    {
      name,
      description: config.description,
      schema: config.schema,
    },
  );
  (created as AgentTool).metadata = config.metadata;
  (created as AgentTool).executeRaw = config.execute as (args: unknown) => Promise<unknown>;
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
