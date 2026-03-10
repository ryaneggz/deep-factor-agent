import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockLoop,
  mockCreateAgent,
  mockClaudeCliProvider,
  mockCreateClaudeCliProvider,
  mockCodexCliProvider,
  mockCreateCodexCliProvider,
} = vi.hoisted(() => {
  const mockLoop = vi.fn();
  const mockCreateAgent = vi.fn().mockReturnValue({ loop: mockLoop });
  const mockClaudeCliProvider = { invoke: vi.fn(), bindTools: vi.fn() };
  const mockCreateClaudeCliProvider = vi.fn(() => mockClaudeCliProvider);
  const mockCodexCliProvider = { invoke: vi.fn(), invokeWithUpdates: vi.fn(), bindTools: vi.fn() };
  const mockCreateCodexCliProvider = vi.fn(() => mockCodexCliProvider);
  return {
    mockLoop,
    mockCreateAgent,
    mockClaudeCliProvider,
    mockCreateClaudeCliProvider,
    mockCodexCliProvider,
    mockCreateCodexCliProvider,
  };
});

vi.mock("deep-factor-agent", () => ({
  createDeepFactorAgent: mockCreateAgent,
  createClaudeCliProvider: mockCreateClaudeCliProvider,
  createCodexCliProvider: mockCreateCodexCliProvider,
  maxIterations: vi.fn((n: number) => ({ name: "maxIterations", maxIter: n })),
  isPlanResult: vi.fn((result: { mode?: string }) => result.mode === "plan"),
  isPendingResult: vi.fn(
    (result: { stopReason?: string }) => result.stopReason === "human_input_needed",
  ),
}));

vi.mock("../src/tools/default-tools.js", () => ({
  createDefaultTools: () => [
    { name: "bash", description: "mock bash tool" },
    { name: "read_file", description: "mock read tool" },
    { name: "write_file", description: "mock write tool" },
    { name: "edit_file", description: "mock edit tool" },
  ],
}));

import { runPrintMode } from "../src/print.js";

describe("runPrintMode", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  });

  const baseOptions = {
    prompt: "What is 2+2?",
    provider: "langchain" as const,
    model: "gpt-4.1-mini",
    maxIter: 10,
    sandbox: "workspace" as const,
    mode: "yolo" as const,
  };

  it("writes response to stdout on success", async () => {
    mockLoop.mockResolvedValueOnce({
      response: "4",
      stopReason: "completed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });

    await expect(runPrintMode(baseOptions)).rejects.toThrow("process.exit called");

    expect(stdoutSpy).toHaveBeenCalledWith("4");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("exits 0 on successful completion", async () => {
    mockLoop.mockResolvedValueOnce({
      response: "Answer",
      stopReason: "completed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });

    await expect(runPrintMode(baseOptions)).rejects.toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("exits 1 and writes to stderr on max_errors", async () => {
    mockLoop.mockResolvedValueOnce({
      response: "",
      stopReason: "max_errors",
      stopDetail: "Too many errors occurred",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 3,
    });

    await expect(runPrintMode(baseOptions)).rejects.toThrow("process.exit called");

    expect(stderrSpy).toHaveBeenCalledWith("Error: Too many errors occurred\n");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits 1 on human_input_needed", async () => {
    mockLoop.mockResolvedValueOnce({
      response: "",
      stopReason: "human_input_needed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });

    await expect(runPrintMode(baseOptions)).rejects.toThrow("process.exit called");

    expect(stderrSpy).toHaveBeenCalledWith(
      "Error: Agent requested human input in non-interactive print mode.\n",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("creates agent with bash tool using workspace sandbox by default", async () => {
    mockLoop.mockResolvedValueOnce({
      response: "ok",
      stopReason: "completed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });

    await expect(runPrintMode({ ...baseOptions, sandbox: "workspace" })).rejects.toThrow(
      "process.exit called",
    );

    expect(mockCreateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([expect.objectContaining({ name: "bash" })]),
      }),
    );
  });

  it("creates agent with bash tool using local sandbox", async () => {
    mockLoop.mockResolvedValueOnce({
      response: "ok",
      stopReason: "completed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });

    await expect(runPrintMode({ ...baseOptions, sandbox: "local" })).rejects.toThrow(
      "process.exit called",
    );

    expect(mockCreateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.arrayContaining([expect.objectContaining({ name: "bash" })]),
      }),
    );
  });

  it("always passes parallelToolCalls: true", async () => {
    mockLoop.mockResolvedValueOnce({
      response: "ok",
      stopReason: "completed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });

    await expect(runPrintMode(baseOptions)).rejects.toThrow("process.exit called");

    expect(mockCreateAgent).toHaveBeenCalledWith(
      expect.objectContaining({ parallelToolCalls: true }),
    );
  });

  it("always passes interruptOn: []", async () => {
    mockLoop.mockResolvedValueOnce({
      response: "ok",
      stopReason: "completed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });

    await expect(runPrintMode(baseOptions)).rejects.toThrow("process.exit called");

    expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({ interruptOn: [] }));
  });

  it("passes model and maxIter to agent config", async () => {
    mockLoop.mockResolvedValueOnce({
      response: "ok",
      stopReason: "completed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });

    await expect(runPrintMode({ ...baseOptions, model: "gpt-4.1", maxIter: 20 })).rejects.toThrow(
      "process.exit called",
    );

    expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-4.1" }));
  });

  it("resolves the Claude CLI provider before creating the agent", async () => {
    mockLoop.mockResolvedValueOnce({
      response: "4",
      stopReason: "completed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });

    await expect(
      runPrintMode({
        ...baseOptions,
        provider: "claude",
        model: "sonnet",
      }),
    ).rejects.toThrow("process.exit called");

    expect(mockCreateClaudeCliProvider).toHaveBeenCalledWith({
      model: "sonnet",
      permissionMode: "bypassPermissions",
      disableBuiltInTools: true,
    });
    expect(mockCreateAgent).toHaveBeenCalledWith(
      expect.objectContaining({ model: mockClaudeCliProvider }),
    );
  });

  it("resolves the Codex CLI provider before creating the agent in final-only mode", async () => {
    mockLoop.mockResolvedValueOnce({
      response: "4",
      stopReason: "completed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });

    await expect(
      runPrintMode({
        ...baseOptions,
        provider: "codex",
        model: "gpt-5.4",
      }),
    ).rejects.toThrow("process.exit called");

    expect(mockCreateCodexCliProvider).toHaveBeenCalledWith({
      model: "gpt-5.4",
      outputFormat: "text",
      sandbox: "read-only",
      skipGitRepoCheck: true,
    });
    expect(mockCreateAgent).toHaveBeenCalledWith(
      expect.objectContaining({ model: mockCodexCliProvider }),
    );
  });

  it("maps plan mode to Claude plan permission mode", async () => {
    mockLoop.mockResolvedValueOnce({
      response: "# Plan",
      stopReason: "completed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });

    await expect(
      runPrintMode({
        ...baseOptions,
        provider: "claude",
        model: "sonnet",
        mode: "plan",
      }),
    ).rejects.toThrow("process.exit called");

    expect(mockCreateClaudeCliProvider).toHaveBeenCalledWith({
      model: "sonnet",
      permissionMode: "plan",
      disableBuiltInTools: true,
    });
  });

  it("maps approve mode to Claude acceptEdits permission mode", async () => {
    mockLoop.mockResolvedValueOnce({
      response: "Approved",
      stopReason: "completed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });

    await expect(
      runPrintMode({
        ...baseOptions,
        provider: "claude",
        model: "sonnet",
        mode: "approve",
      }),
    ).rejects.toThrow("process.exit called");

    expect(mockCreateClaudeCliProvider).toHaveBeenCalledWith({
      model: "sonnet",
      permissionMode: "acceptEdits",
      disableBuiltInTools: true,
    });
  });

  it("auto-approves plan mode pending results in print mode", async () => {
    const resume = vi.fn().mockResolvedValue({
      mode: "plan",
      plan: "# Plan",
      stopReason: "plan_completed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });
    mockLoop.mockResolvedValueOnce({
      response: "",
      stopReason: "human_input_needed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
      resume,
    });

    await expect(runPrintMode({ ...baseOptions, mode: "plan" })).rejects.toThrow(
      "process.exit called",
    );

    expect(resume).toHaveBeenCalledWith({ decision: "approve" });
    expect(stdoutSpy).toHaveBeenCalledWith("# Plan");
  });

  it("handles thrown errors gracefully", async () => {
    mockLoop.mockRejectedValueOnce(new Error("Network failure"));

    await expect(runPrintMode(baseOptions)).rejects.toThrow("process.exit called");

    expect(stderrSpy).toHaveBeenCalledWith("Error: Network failure\n");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
