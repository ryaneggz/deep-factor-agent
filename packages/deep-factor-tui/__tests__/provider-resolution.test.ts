import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks – intercept the factory functions so we can inspect their arguments
// ---------------------------------------------------------------------------

const mockClaudeProvider = { invoke: vi.fn(), bindTools: vi.fn() };
const createClaudeCliProviderMock = vi.fn(() => mockClaudeProvider);

const mockCodexProvider = { invoke: vi.fn(), bindTools: vi.fn() };
const createCodexCliProviderMock = vi.fn(() => mockCodexProvider);

vi.mock("deep-factor-agent", () => ({
  createClaudeCliProvider: createClaudeCliProviderMock,
  createCodexCliProvider: createCodexCliProviderMock,
}));

const { resolveProviderModel } = await import("../src/provider-resolution.js");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveProviderModel", () => {
  beforeEach(() => {
    createClaudeCliProviderMock.mockClear();
    createCodexCliProviderMock.mockClear();
  });

  it("passes inputEncoding 'text' to the Claude CLI provider", () => {
    resolveProviderModel({ provider: "claude", model: "sonnet" });

    expect(createClaudeCliProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ inputEncoding: "text" }),
    );
  });

  it("passes inputEncoding 'text' to the Codex CLI provider", () => {
    resolveProviderModel({ provider: "codex", model: "gpt-5" });

    expect(createCodexCliProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ inputEncoding: "text" }),
    );
  });

  it("does not pass 'xml' encoding to Claude CLI provider (no <thread> tags)", () => {
    resolveProviderModel({ provider: "claude", model: "sonnet" });

    const args = createClaudeCliProviderMock.mock.calls[0][0];
    expect(args.inputEncoding).not.toBe("xml");
  });

  it("does not pass 'xml' encoding to Codex CLI provider (no <thread> tags)", () => {
    resolveProviderModel({ provider: "codex", model: "gpt-5" });

    const args = createCodexCliProviderMock.mock.calls[0][0];
    expect(args.inputEncoding).not.toBe("xml");
  });

  it("returns the model string unchanged for langchain provider", () => {
    const result = resolveProviderModel({ provider: "langchain", model: "gpt-4" });

    expect(result).toBe("gpt-4");
    expect(createClaudeCliProviderMock).not.toHaveBeenCalled();
    expect(createCodexCliProviderMock).not.toHaveBeenCalled();
  });
});
