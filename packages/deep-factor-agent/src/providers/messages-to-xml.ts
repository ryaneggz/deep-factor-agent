import { execFile } from "node:child_process";
import type { BaseMessage } from "@langchain/core/messages";
import type { AIMessage as AIMessageType } from "@langchain/core/messages";
import { escapeXml } from "../xml-serializer.js";

/**
 * Promisified `execFile` wrapper — avoids shell injection by passing args as
 * an array rather than interpolating into a command string.
 */
export function execFileAsync(
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

/**
 * Serialize LangChain `BaseMessage[]` to a plain-text labeled prompt.
 * Used as the `"text"` fallback when `inputEncoding` is not `"xml"`.
 */
export function messagesToPrompt(messages: BaseMessage[]): string {
  return messages
    .map((msg) => {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
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

/**
 * Serialize LangChain `BaseMessage[]` to `<thread>` XML format.
 *
 * - `SystemMessage`  → `<event type="system">`
 * - `HumanMessage`   → `<event type="human">`
 * - `AIMessage`      → `<event type="ai">` + `<event type="tool_input">` per tool call
 * - `ToolMessage`    → `<event type="tool_output">`
 *
 * Reuses `escapeXml` from `src/xml-serializer.ts` (not duplicated).
 * Detects pre-serialized XML (content starting with `<thread>`) and passes through.
 *
 * `iteration="0"` for all events — `BaseMessage[]` doesn't carry iteration metadata.
 * `call_id` attribute links `tool_input`/`tool_output` pairs.
 */
export function messagesToXml(messages: BaseMessage[]): string {
  // Detect pre-serialized XML from buildXmlMessages() — pass through
  if (
    messages.length === 1 &&
    typeof messages[0].content === "string" &&
    messages[0].content.trimStart().startsWith("<thread>")
  ) {
    return messages[0].content;
  }

  // Build toolCallId → toolName map from AIMessage.tool_calls arrays
  const toolNameMap = new Map<string, string>();
  for (const msg of messages) {
    if (msg._getType() === "ai") {
      const aiMsg = msg as AIMessageType;
      if (aiMsg.tool_calls) {
        for (const tc of aiMsg.tool_calls) {
          if (tc.id) {
            toolNameMap.set(tc.id, tc.name);
          }
        }
      }
    }
  }

  const lines: string[] = ["<thread>"];
  let id = 0;

  for (const msg of messages) {
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    const type = msg._getType();

    switch (type) {
      case "system":
        lines.push(`  <event type="system" id="${id}" iteration="0">${escapeXml(content)}</event>`);
        id++;
        break;

      case "human":
        lines.push(`  <event type="human" id="${id}" iteration="0">${escapeXml(content)}</event>`);
        id++;
        break;

      case "ai": {
        // Emit AI text content (may be empty when only tool calls)
        if (content) {
          lines.push(`  <event type="ai" id="${id}" iteration="0">${escapeXml(content)}</event>`);
          id++;
        }
        // Emit tool_input events for each tool call
        const aiMsg = msg as AIMessageType;
        if (aiMsg.tool_calls) {
          for (const tc of aiMsg.tool_calls) {
            lines.push(
              `  <event type="tool_input" id="${id}" name="${escapeXml(tc.name)}" call_id="${escapeXml(tc.id ?? "")}" iteration="0">${escapeXml(JSON.stringify(tc.args))}</event>`,
            );
            id++;
          }
        }
        break;
      }

      case "tool": {
        const toolCallId = (msg as unknown as { tool_call_id?: string }).tool_call_id ?? "";
        const toolName = toolNameMap.get(toolCallId) ?? "unknown";
        lines.push(
          `  <event type="tool_output" id="${id}" name="${escapeXml(toolName)}" call_id="${escapeXml(toolCallId)}" status="success" iteration="0">${escapeXml(content)}</event>`,
        );
        id++;
        break;
      }

      default:
        lines.push(
          `  <event type="${escapeXml(type)}" id="${id}" iteration="0">${escapeXml(content)}</event>`,
        );
        id++;
    }
  }

  lines.push("</thread>");
  return lines.join("\n");
}

/**
 * Parse tool calls from a ```json``` code block in CLI response text.
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
