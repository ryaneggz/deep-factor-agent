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
    /** Input encoding for messages. Default: "xml". Use "text" for plain-text labels. */
    inputEncoding?: "xml" | "text";
}
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
export declare function createClaudeCliProvider(opts?: ClaudeCliProviderOptions): ModelAdapter;
//# sourceMappingURL=claude-cli.d.ts.map