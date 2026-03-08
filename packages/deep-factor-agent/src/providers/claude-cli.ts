import { AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { toJSONSchema } from "zod";
import type { ModelAdapter } from "./types.js";
import {
  execFileAsync,
  messagesToXml,
  messagesToPrompt,
  parseToolCalls,
} from "./messages-to-xml.js";

export interface ClaudeCliProviderOptions {
  /** Claude model to use (e.g. "sonnet", "opus"). Passed as `--model <model>`. */
  model?: string;
  /** Claude CLI permission mode. Default: "bypassPermissions". */
  permissionMode?: "acceptEdits" | "bypassPermissions" | "default" | "dontAsk" | "plan" | "auto";
  /** Path to the claude CLI binary. Default: "claude" */
  cliPath?: string;
  /** Timeout in milliseconds for the CLI process. Default: 120000 (2 min) */
  timeout?: number;
  /** Max stdout buffer in bytes. Default: 10 MB */
  maxBuffer?: number;
  /** Input encoding for messages. Default: "xml". Use "text" for plain-text labels. */
  inputEncoding?: "xml" | "text";
  /** Disable Claude CLI built-in tools so tool use goes through the outer agent loop. Default: true. */
  disableBuiltInTools?: boolean;
}

interface ClaudeCliJsonResponse {
  result: string;
  stop_reason?: string | null;
  session_id?: string | null;
  model?: string | null;
  permission_denials?: unknown;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface ClaudeCliMessageMetadata extends Record<string, unknown> {
  session_id?: string;
  stop_reason?: string;
  permission_mode: NonNullable<ClaudeCliProviderOptions["permissionMode"]>;
  model?: string;
  permission_denials?: unknown;
}

/** Prompt-engineered instruction telling the CLI model how to format tool calls. */
const TOOL_CALL_FORMAT = `When you need to call a tool, respond with ONLY a JSON block in this exact format:

\`\`\`json
{
  "tool_calls": [
    {
      "name": "tool_name",
      "args": { "param": "value" },
      "id": "call_1"
    }
  ]
}
\`\`\`

If you do not need to call any tools, respond with plain text (no JSON block).`;

/**
 * Create a Claude CLI model adapter.
 *
 * Shells out to `claude --print --output-format json <prompt>` for each invocation.
 * Tool calling is handled via prompt engineering: tool definitions are injected
 * into the prompt when `bindTools()` is called, and tool calls are parsed from
 * JSON code blocks in the response.
 *
 * By default, messages are serialized as `<thread>` XML (matching the agent's
 * `contextMode: "xml"` pattern). Set `inputEncoding: "text"` for plain-text labels.
 */
export function createClaudeCliProvider(opts?: ClaudeCliProviderOptions): ModelAdapter {
  const cliPath = opts?.cliPath ?? "claude";
  const model = opts?.model;
  const permissionMode = opts?.permissionMode ?? "bypassPermissions";
  const timeout = opts?.timeout ?? 120_000;
  const maxBuffer = opts?.maxBuffer ?? 10 * 1024 * 1024;
  const inputEncoding = opts?.inputEncoding ?? "xml";
  const disableBuiltInTools = opts?.disableBuiltInTools ?? true;

  let boundToolDefs: StructuredToolInterface[] = [];

  function parseJsonOutput(stdout: string): ClaudeCliJsonResponse {
    let parsed: unknown;

    try {
      parsed = JSON.parse(stdout);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Claude CLI returned invalid JSON output: ${detail}`);
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("result" in parsed) ||
      typeof parsed.result !== "string"
    ) {
      throw new Error("Claude CLI JSON output did not include a string result field");
    }

    return parsed as ClaudeCliJsonResponse;
  }

  function attachClaudeMetadata(
    message: AIMessage,
    usageMetadata: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    },
    responseMetadata: ClaudeCliMessageMetadata,
  ): AIMessage {
    (message as AIMessage & { usage_metadata?: unknown }).usage_metadata = usageMetadata;
    (message as AIMessage & { response_metadata?: unknown }).response_metadata = responseMetadata;
    return message;
  }

  function buildAdapter(): ModelAdapter {
    return {
      async invoke(messages: BaseMessage[]): Promise<AIMessage> {
        let prompt = "";

        // Inject tool definitions if tools are bound
        if (boundToolDefs.length > 0) {
          const toolDefs = boundToolDefs.map((t) => ({
            name: t.name,
            description: t.description,
            parameters:
              "schema" in t && t.schema
                ? "_zod" in (t.schema as object)
                  ? toJSONSchema(t.schema as import("zod").ZodType)
                  : t.schema
                : {},
          }));
          prompt += `[Available Tools]\n${JSON.stringify(toolDefs, null, 2)}\n\n${TOOL_CALL_FORMAT}\n\n`;
        }

        // Serialize messages using the configured encoding
        prompt += inputEncoding === "xml" ? messagesToXml(messages) : messagesToPrompt(messages);

        const args = ["--print", "--output-format", "json"];
        if (disableBuiltInTools) {
          args.push("--tools", "");
        }
        args.push("--permission-mode", permissionMode);
        if (model) {
          args.push("--model", model);
        }
        args.push(prompt);

        const commandPreview = [cliPath, ...args.slice(0, -1)].join(" ");
        let stdout: string;

        try {
          stdout = await execFileAsync(cliPath, args, {
            timeout,
            maxBuffer,
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`Claude CLI invocation failed (${commandPreview}): ${detail}`);
        }

        const response = parseJsonOutput(stdout.trim());
        const text = response.result.trim();
        const toolCalls = parseToolCalls(text);
        const inputTokens = response.usage?.input_tokens ?? 0;
        const outputTokens = response.usage?.output_tokens ?? 0;
        const usageMetadata = {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        };
        const responseMetadata: ClaudeCliMessageMetadata = {
          permission_mode: permissionMode,
        };

        if (response.session_id) {
          responseMetadata.session_id = response.session_id;
        }
        if (response.stop_reason) {
          responseMetadata.stop_reason = response.stop_reason;
        }
        const resolvedModel = response.model ?? model;
        if (resolvedModel) {
          responseMetadata.model = resolvedModel;
        }
        if (response.permission_denials !== undefined) {
          responseMetadata.permission_denials = response.permission_denials;
        }

        if (toolCalls.length > 0) {
          // Extract any text outside the JSON block as content
          const contentOutsideJson = text.replace(/```json\s*\n?[\s\S]*?\n?\s*```/, "").trim();
          return attachClaudeMetadata(
            new AIMessage({
              content: contentOutsideJson || "",
              tool_calls: toolCalls,
            }),
            usageMetadata,
            responseMetadata,
          );
        }

        return attachClaudeMetadata(
          new AIMessage({ content: text, tool_calls: [] }),
          usageMetadata,
          responseMetadata,
        );
      },

      bindTools(tools: StructuredToolInterface[]): ModelAdapter {
        boundToolDefs = tools;
        return this;
      },
    };
  }

  return buildAdapter();
}
