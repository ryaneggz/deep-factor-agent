import { AIMessage } from "@langchain/core/messages";
import { toJSONSchema } from "zod";
import { execFileAsync, messagesToXml, messagesToPrompt, parseToolCalls, } from "./messages-to-xml.js";
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
 * Shells out to `claude -p <prompt> --no-input` for each invocation.
 * Tool calling is handled via prompt engineering: tool definitions are injected
 * into the prompt when `bindTools()` is called, and tool calls are parsed from
 * JSON code blocks in the response.
 *
 * By default, messages are serialized as `<thread>` XML (matching the agent's
 * `contextMode: "xml"` pattern). Set `inputEncoding: "text"` for plain-text labels.
 */
export function createClaudeCliProvider(opts) {
    const cliPath = opts?.cliPath ?? "claude";
    const model = opts?.model;
    const timeout = opts?.timeout ?? 120_000;
    const maxBuffer = opts?.maxBuffer ?? 10 * 1024 * 1024;
    const inputEncoding = opts?.inputEncoding ?? "xml";
    let boundToolDefs = [];
    function buildAdapter() {
        return {
            async invoke(messages) {
                let prompt = "";
                // Inject tool definitions if tools are bound
                if (boundToolDefs.length > 0) {
                    const toolDefs = boundToolDefs.map((t) => ({
                        name: t.name,
                        description: t.description,
                        parameters: "schema" in t && t.schema
                            ? "_zod" in t.schema
                                ? toJSONSchema(t.schema)
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
            bindTools(tools) {
                boundToolDefs = tools;
                return this;
            },
        };
    }
    return buildAdapter();
}
