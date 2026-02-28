import type { AgentEvent, ToolCallEvent } from "./types.js";

export interface XmlSerializerOptions {
  /** Optional text appended after the closing </thread> tag as an assistant prefill nudge. */
  assistantPrefill?: string;
}

/**
 * Escapes XML special characters in text content and attribute values.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
        lines.push(
          `  <event type="tool_output" id="${id}" name="${escapeXml(toolName)}" status="success" iteration="${iteration}">${escapeXml(String(event.result))}</event>`,
        );
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
