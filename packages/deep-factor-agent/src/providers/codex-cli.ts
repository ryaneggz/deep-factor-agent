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

export interface CodexCliProviderOptions {
  /** Codex model to use (e.g. "o4-mini"). Passed as `--model <model>`. */
  model?: string;
  /** Path to the codex CLI binary. Default: "codex" */
  cliPath?: string;
  /** Timeout in milliseconds for the CLI process. Default: 120000 (2 min) */
  timeout?: number;
  /** Max stdout buffer in bytes. Default: 10 MB */
  maxBuffer?: number;
  /** Input encoding for messages. Default: "xml". Use "text" for plain-text labels. */
  inputEncoding?: "xml" | "text";
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
 * Create a Codex CLI model adapter.
 *
 * Shells out to `codex exec <prompt> --full-auto --sandbox read-only` for each
 * invocation. Tool calling is handled via prompt engineering: tool definitions
 * are injected into the prompt when `bindTools()` is called, and tool calls are
 * parsed from JSON code blocks in the response.
 *
 * By default, messages are serialized as `<thread>` XML (matching the agent's
 * `contextMode: "xml"` pattern). Set `inputEncoding: "text"` for plain-text labels.
 */
export function createCodexCliProvider(
  opts?: CodexCliProviderOptions,
): ModelAdapter {
  const cliPath = opts?.cliPath ?? "codex";
  const model = opts?.model;
  const timeout = opts?.timeout ?? 120_000;
  const maxBuffer = opts?.maxBuffer ?? 10 * 1024 * 1024;
  const inputEncoding = opts?.inputEncoding ?? "xml";

  let boundToolDefs: StructuredToolInterface[] = [];

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
        prompt +=
          inputEncoding === "xml"
            ? messagesToXml(messages)
            : messagesToPrompt(messages);

        const args = ["exec", prompt, "--full-auto", "--sandbox", "read-only"];
        if (model) {
          args.push("--model", model);
        }

        const stdout = await execFileAsync(cliPath, args, {
          timeout,
          maxBuffer,
        });

        const text = stdout.trim();
        const toolCalls = parseToolCalls(text);

        if (toolCalls.length > 0) {
          // Extract any text outside the JSON block as content
          const contentOutsideJson = text
            .replace(/```json\s*\n?[\s\S]*?\n?\s*```/, "")
            .trim();
          return new AIMessage({
            content: contentOutsideJson || "",
            tool_calls: toolCalls,
          });
        }

        return new AIMessage({ content: text, tool_calls: [] });
      },

      bindTools(tools: StructuredToolInterface[]): ModelAdapter {
        boundToolDefs = tools;
        return this;
      },
    };
  }

  return buildAdapter();
}
