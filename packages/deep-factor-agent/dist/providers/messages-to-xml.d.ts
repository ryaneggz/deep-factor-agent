import type { BaseMessage } from "@langchain/core/messages";
/**
 * Promisified `execFile` wrapper — avoids shell injection by passing args as
 * an array rather than interpolating into a command string.
 */
export declare function execFileAsync(file: string, args: string[], options: {
    timeout: number;
    maxBuffer: number;
}): Promise<string>;
/**
 * Serialize LangChain `BaseMessage[]` to a plain-text labeled prompt.
 * Used as the `"text"` fallback when `inputEncoding` is not `"xml"`.
 */
export declare function messagesToPrompt(messages: BaseMessage[]): string;
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
export declare function messagesToXml(messages: BaseMessage[]): string;
/**
 * Parse tool calls from a ```json``` code block in CLI response text.
 * Returns the parsed tool_calls array, or an empty array if no block found.
 */
export declare function parseToolCalls(text: string): Array<{
    name: string;
    args: Record<string, unknown>;
    id: string;
}>;
//# sourceMappingURL=messages-to-xml.d.ts.map