import type { ModelAdapter } from "./types.js";
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
export declare function createCodexCliProvider(opts?: CodexCliProviderOptions): ModelAdapter;
//# sourceMappingURL=codex-cli.d.ts.map