import { execFile } from "node:child_process";
import { AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ModelAdapter } from "./types.js";

export interface ClaudeCliProviderOptions {
  /** Claude model to use (e.g. "sonnet", "opus"). Passed as `--model <model>`. */
  model?: string;
  /** Path to the claude CLI binary. Default: "claude" */
  cliPath?: string;
  /** Timeout in milliseconds for the CLI process. Default: 120000 (2 min) */
  timeout?: number;
  /** Max stdout buffer in bytes. Default: 10 MB */
  maxBuffer?: number;
}

/** Promisified `execFile` wrapper — avoids shell injection by passing args as array. */
function execFileAsync(
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { ...options, encoding: "utf8" }, (error, stdout) => {
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

/** Serialize LangChain messages to a labeled text prompt for the CLI. */
export function messagesToPrompt(messages: BaseMessage[]): string {
  return messages
    .map((msg) => {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      const type = msg._getType();
      switch (type) {
        case "system":
          return `[System]\n${content}`;
        case "human":
          return `[User]\n${content}`;
        case "ai":
          return `[Assistant]\n${content}`;
        case "tool":
          return `[Tool Result]\n${content}`;
        default:
          return `[${type}]\n${content}`;
      }
    })
    .join("\n\n");
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
 * Parse tool calls from a ```json``` code block in the CLI response.
 * Returns the parsed tool_calls array, or an empty array if no block found.
 */
export function parseToolCalls(
  text: string,
): Array<{ name: string; args: Record<string, unknown>; id: string }> {
  const match = text.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[1]);
    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
      return parsed.tool_calls.map(
        (tc: { name: string; args?: Record<string, unknown>; id?: string }, i: number) => ({
          name: tc.name,
          args: tc.args ?? {},
          id: tc.id ?? `call_${i}`,
        }),
      );
    }
  } catch {
    // JSON parse failed — treat as plain text response
  }

  return [];
}

/**
 * Create a Claude CLI model adapter.
 *
 * Shells out to `claude -p <prompt> --no-input` for each invocation.
 * Tool calling is handled via prompt engineering: tool definitions are injected
 * into the prompt when `bindTools()` is called, and tool calls are parsed from
 * JSON code blocks in the response.
 */
export function createClaudeCliProvider(
  opts?: ClaudeCliProviderOptions,
): ModelAdapter {
  const cliPath = opts?.cliPath ?? "claude";
  const model = opts?.model;
  const timeout = opts?.timeout ?? 120_000;
  const maxBuffer = opts?.maxBuffer ?? 10 * 1024 * 1024;

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
                ? JSON.parse(JSON.stringify(t.schema))
                : {},
          }));
          prompt += `[Available Tools]\n${JSON.stringify(toolDefs, null, 2)}\n\n${TOOL_CALL_FORMAT}\n\n`;
        }

        prompt += messagesToPrompt(messages);

        const args = ["-p", prompt, "--no-input"];
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
