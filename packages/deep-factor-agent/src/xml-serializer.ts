import type { AgentEvent, ToolCallEvent } from "./types.js";

export interface XmlSerializerOptions {
  /** Optional text appended after the closing </thread> tag as an assistant prefill nudge. */
  assistantPrefill?: string;
}

const NEEDS_ESCAPE = /[&<>"']/;

/**
 * Escapes XML special characters in text content and attribute values.
 * Uses a regex fast-path for plain text, and a manual charCode scan
 * to avoid regex callback overhead on large strings with specials.
 */
export function escapeXml(text: string): string {
  if (!NEEDS_ESCAPE.test(text)) return text;

  let result = "";
  let lastIndex = 0;

  for (let i = 0; i < text.length; i++) {
    let replacement: string | undefined;
    switch (text.charCodeAt(i)) {
      case 38:
        replacement = "&amp;";
        break; // &
      case 60:
        replacement = "&lt;";
        break; // <
      case 62:
        replacement = "&gt;";
        break; // >
      case 34:
        replacement = "&quot;";
        break; // "
      case 39:
        replacement = "&apos;";
        break; // '
    }
    if (replacement) {
      if (lastIndex < i) result += text.slice(lastIndex, i);
      result += replacement;
      lastIndex = i + 1;
    }
  }

  if (lastIndex === 0) return text;
  if (lastIndex < text.length) result += text.slice(lastIndex);
  return result;
}

/**
 * Converts an array of AgentEvent objects into a <thread> XML string.
 */
export function serializeThreadToXml(events: AgentEvent[], options?: XmlSerializerOptions): string {
  if (events.length === 0) {
    const xml = "<thread>\n</thread>";
    return options?.assistantPrefill ? `${xml}\n${options.assistantPrefill}` : xml;
  }

  // Build toolCallId -> toolName map in a single pass
  const toolNameMap = new Map<string, string>();
  for (const event of events) {
    if (event.type === "tool_call") {
      toolNameMap.set((event as ToolCallEvent).toolCallId, (event as ToolCallEvent).toolName);
    }
  }

  const lines: string[] = ["<thread>"];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const id = i;
    const iteration = event.iteration;

    switch (event.type) {
      case "message": {
        let typeAttr: string;
        if (event.role === "user") typeAttr = "human";
        else if (event.role === "assistant") typeAttr = "ai";
        else typeAttr = "system";
        lines.push(
          `  <event type="${escapeXml(typeAttr)}" id="${id}" iteration="${iteration}">${escapeXml(event.content)}</event>`,
        );
        break;
      }
      case "tool_call": {
        lines.push(
          `  <event type="tool_input" id="${id}" name="${escapeXml(event.toolName)}" iteration="${iteration}">${escapeXml(JSON.stringify(event.args))}</event>`,
        );
        break;
      }
      case "tool_result": {
        const toolName = toolNameMap.get(event.toolCallId) ?? "unknown";
        let attrs = `type="tool_output" id="${id}" name="${escapeXml(toolName)}" status="success" iteration="${iteration}"`;
        if (event.durationMs != null) {
          attrs += ` duration_ms="${event.durationMs}"`;
        }
        if (event.parallelGroup) {
          attrs += ` parallel_group="${escapeXml(event.parallelGroup)}"`;
        }
        lines.push(`  <event ${attrs}>${escapeXml(String(event.result))}</event>`);
        break;
      }
      case "error": {
        lines.push(
          `  <event type="error" id="${id}" iteration="${iteration}" recoverable="${String(event.recoverable)}">${escapeXml(event.error)}</event>`,
        );
        break;
      }
      case "human_input_requested": {
        lines.push(
          `  <event type="human_input_requested" id="${id}" iteration="${iteration}">${escapeXml(event.question)}</event>`,
        );
        break;
      }
      case "human_input_received": {
        lines.push(
          `  <event type="human_input_received" id="${id}" iteration="${iteration}">${escapeXml(event.response)}</event>`,
        );
        break;
      }
      case "completion": {
        lines.push(
          `  <event type="completion" id="${id}" iteration="${iteration}">${escapeXml(event.result)}</event>`,
        );
        break;
      }
      case "summary": {
        lines.push(
          `  <event type="summary" id="${id}" iteration="${iteration}" summarizedIterations="${event.summarizedIterations.join(",")}">${escapeXml(event.summary)}</event>`,
        );
        break;
      }
    }
  }

  lines.push("</thread>");
  const xml = lines.join("\n");
  return options?.assistantPrefill ? `${xml}\n${options.assistantPrefill}` : xml;
}
