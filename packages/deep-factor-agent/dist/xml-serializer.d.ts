import type { AgentEvent } from "./types.js";
export interface XmlSerializerOptions {
    /** Optional text appended after the closing </thread> tag as an assistant prefill nudge. */
    assistantPrefill?: string;
}
/**
 * Escapes XML special characters in text content and attribute values.
 */
export declare function escapeXml(text: string): string;
/**
 * Converts an array of AgentEvent objects into a <thread> XML string.
 */
export declare function serializeThreadToXml(events: AgentEvent[], options?: XmlSerializerOptions): string;
//# sourceMappingURL=xml-serializer.d.ts.map