import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockLoop, mockCreateAgent } = vi.hoisted(() => {
  const mockLoop = vi.fn();
  const mockCreateAgent = vi.fn().mockReturnValue({ loop: mockLoop });
  return { mockLoop, mockCreateAgent };
});

vi.mock("deep-factor-agent", () => ({
  createDeepFactorAgent: mockCreateAgent,
  maxIterations: vi.fn((n: number) => ({ name: "maxIterations", maxIter: n })),
  createClaudeAgentSdkProvider: vi.fn((opts: any) => ({
    invoke: vi.fn(),
    bindTools: vi.fn(),
    _model: opts?.model,
  })),
}));

vi.mock("../src/tools/bash.js", () => ({
  bashTool: { name: "bash", description: "mock bash tool" },
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
    model: "gpt-4.1-mini",
    maxIter: 10,
    sandbox: false,
    provider: "langchain" as const,
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

  it("creates agent with no tools when sandbox is false", async () => {
    mockLoop.mockResolvedValueOnce({
      response: "ok",
      stopReason: "completed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });

    await expect(runPrintMode({ ...baseOptions, sandbox: false })).rejects.toThrow(
      "process.exit called",
    );

    expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({ tools: [] }));
  });

  it("creates agent with bash tool when sandbox is true", async () => {
    mockLoop.mockResolvedValueOnce({
      response: "ok",
      stopReason: "completed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      iterations: 1,
    });

    await expect(runPrintMode({ ...baseOptions, sandbox: true })).rejects.toThrow(
      "process.exit called",
    );

    expect(mockCreateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [{ name: "bash", description: "mock bash tool" }],
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

  it("handles thrown errors gracefully", async () => {
    mockLoop.mockRejectedValueOnce(new Error("Network failure"));

    await expect(runPrintMode(baseOptions)).rejects.toThrow("process.exit called");

    expect(stderrSpy).toHaveBeenCalledWith("Error: Network failure\n");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
