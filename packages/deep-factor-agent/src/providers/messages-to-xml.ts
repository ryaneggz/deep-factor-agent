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
    const child = execFile(
      file,
      args,
      { ...options, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr?.trim();
          reject(new Error(detail ? `${error.message}\n${detail}` : error.message));
        } else {
          resolve(stdout);
        }
      },
    );
    child.stdin?.end();
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

type ToolCall = { name: string; args: Record<string, unknown>; id: string };

function parseToolCallsFromJson(json: string, startIndex: number): ToolCall[] {
  try {
    const parsed = JSON.parse(json);
    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
      return parsed.tool_calls.map(
        (tc: { name: string; args?: Record<string, unknown>; id?: string }, i: number) => ({
          name: tc.name,
          args: tc.args ?? {},
          id: tc.id ?? `call_${startIndex + i}`,
        }),
      );
    }
  } catch {
    // JSON parse failed — treat as plain text response
  }
  return [];
}

function isToolCallArray(arr: unknown[]): boolean {
  return (
    arr.length > 0 &&
    arr.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "name" in item &&
        typeof (item as Record<string, unknown>).name === "string",
    )
  );
}

function parseBareToolCalls(text: string, startIndex: number): ToolCall[] {
  // Strip fenced blocks to avoid double-matching
  const stripped = text.replace(/```[\s\S]*?```/g, "");

  // Try bare JSON object with tool_calls key
  for (const match of stripped.matchAll(/\{\s*"tool_calls"\s*:\s*\[[\s\S]*?\]\s*\}/g)) {
    const calls = parseToolCallsFromJson(match[0], startIndex);
    if (calls.length > 0) return calls;
  }

  // Try bare JSON array of tool calls
  for (const match of stripped.matchAll(/\[\s*\{[\s\S]*?\}\s*\]/g)) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && isToolCallArray(parsed)) {
        return parsed.map(
          (tc: { name: string; args?: Record<string, unknown>; id?: string }, i: number) => ({
            name: tc.name,
            args: tc.args ?? {},
            id: tc.id ?? `call_${startIndex + i}`,
          }),
        );
      }
    } catch {
      // not valid JSON
    }
  }

  return [];
}

/**
 * Parse tool calls from ```json``` code blocks or bare JSON in CLI response text.
 * Matches all fenced blocks (not just the first), and falls back to bare JSON
 * arrays/objects when no fenced blocks contain tool calls.
 */
export function parseToolCalls(text: string): ToolCall[] {
  const allToolCalls: ToolCall[] = [];
  const seenIds = new Set<string>();
  let globalIndex = 0;

  // Match all fenced JSON blocks
  for (const match of text.matchAll(/```json\s*\n?([\s\S]*?)\n?\s*```/g)) {
    const calls = parseToolCallsFromJson(match[1], globalIndex);
    for (const tc of calls) {
      if (!seenIds.has(tc.id)) {
        seenIds.add(tc.id);
        allToolCalls.push(tc);
        globalIndex++;
      }
    }
  }

  // Fallback: bare JSON (unfenced)
  if (allToolCalls.length === 0) {
    return parseBareToolCalls(text, globalIndex);
  }

  return allToolCalls;
}

/**
 * Strip all tool call JSON blocks (fenced and bare) from response text.
 */
export function stripAllToolCallBlocks(text: string): string {
  // Strip all fenced JSON blocks containing tool_calls
  let result = text.replace(/```json\s*\n?[\s\S]*?\n?\s*```/g, "");

  // Strip bare JSON objects with tool_calls key
  result = result.replace(/\{\s*"tool_calls"\s*:\s*\[[\s\S]*?\]\s*\}/g, "");

  // Strip bare JSON arrays that look like tool call arrays
  result = result.replace(/\[\s*\{\s*"name"\s*:[\s\S]*?\}\s*\]/g, "");

  return result.trim();
}
