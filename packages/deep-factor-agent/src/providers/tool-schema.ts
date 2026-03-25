/**
 * Shared tool schema conversion utilities.
 *
 * Converts LangChain StructuredToolInterface (Zod-based) schemas into the
 * JSON Schema formats required by the Anthropic and OpenAI APIs.
 */

import type { StructuredToolInterface } from "@langchain/core/tools";
import { toJSONSchema, type ZodType } from "zod";

// ---------------------------------------------------------------------------
// Generic tool definition (SDK-agnostic)
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Convert a single LangChain tool to a generic ToolDefinition with JSON Schema.
 */
export function toolToDefinition(tool: StructuredToolInterface): ToolDefinition {
  // LangChain's schema may be Zod v4 (has _zod property) or a plain object.
  // Only call toJSONSchema for actual Zod v4 schemas.
  const schema = tool.schema;
  const rawSchema =
    schema && "_zod" in (schema as object)
      ? (toJSONSchema(schema as ZodType) as Record<string, unknown>)
      : ((schema ?? {}) as Record<string, unknown>);

  // Strip Zod-specific metadata that SDKs don't understand
  const { $schema: _, ...cleanSchema } = rawSchema;

  return {
    name: tool.name,
    description: tool.description,
    input_schema: cleanSchema,
  };
}

// ---------------------------------------------------------------------------
// Anthropic format
// ---------------------------------------------------------------------------

/**
 * Anthropic tool parameter shape as expected by `client.messages.create()`.
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/tool-use
 */
export interface AnthropicToolParam {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Convert LangChain tools to Anthropic API tool format.
 */
export function toolsToAnthropicFormat(tools: StructuredToolInterface[]): AnthropicToolParam[] {
  return tools.map((tool) => {
    const def = toolToDefinition(tool);
    return {
      name: def.name,
      description: def.description,
      input_schema: def.input_schema,
    };
  });
}

// ---------------------------------------------------------------------------
// OpenAI format
// ---------------------------------------------------------------------------

/**
 * OpenAI chat completion tool shape.
 *
 * @see https://platform.openai.com/docs/api-reference/chat/create#chat-create-tools
 */
export interface OpenAIChatCompletionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Convert LangChain tools to OpenAI API function-calling format.
 */
export function toolsToOpenAIFormat(tools: StructuredToolInterface[]): OpenAIChatCompletionTool[] {
  return tools.map((tool) => {
    const def = toolToDefinition(tool);
    return {
      type: "function" as const,
      function: {
        name: def.name,
        description: def.description,
        parameters: def.input_schema,
      },
    };
  });
}
