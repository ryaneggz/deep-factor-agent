import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunHeadlessAgentToCompletion } = vi.hoisted(() => ({
  mockRunHeadlessAgentToCompletion: vi.fn(),
}));

vi.mock("../src/agent-runner.js", () => ({
  runHeadlessAgentToCompletion: mockRunHeadlessAgentToCompletion,
}));

import {
  buildCompletePrompt,
  ensureCompleteStateFiles,
  resolveCompleteWorkspace,
  runCompleteMode,
} from "../src/complete.js";

describe("complete mode", () => {
  let tempDir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "deepfactor-complete-"));
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
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("prefers CLAUDE.md for Claude and PROMPT.md for other providers", () => {
    const workspaceDir = join(tempDir, ".ralph");
    mkdirSync(workspaceDir);
    writeFileSync(join(workspaceDir, "CLAUDE.md"), "Claude prompt");
    writeFileSync(join(workspaceDir, "PROMPT.md"), "Generic prompt");
    writeFileSync(join(workspaceDir, "prompt.md"), "Lowercase prompt");

    expect(resolveCompleteWorkspace({ provider: "claude", cwd: tempDir }).promptPath).toBe(
      join(workspaceDir, "CLAUDE.md"),
    );
    expect(resolveCompleteWorkspace({ provider: "langchain", cwd: tempDir }).promptPath).toBe(
      join(workspaceDir, "PROMPT.md"),
    );
  });

  it("copies prd.json.example and creates progress.txt when state files are missing", () => {
    const workspaceDir = join(tempDir, ".ralph");
    mkdirSync(workspaceDir);
    writeFileSync(join(workspaceDir, "PROMPT.md"), "Ship it");
    writeFileSync(
      join(workspaceDir, "prd.json.example"),
      '{ "project": "demo", "userStories": [] }\n',
    );
    const workspace = resolveCompleteWorkspace({ provider: "langchain", cwd: tempDir });

    ensureCompleteStateFiles(workspace);

    expect(readFileSync(workspace.prdPath, "utf8")).toContain('"project": "demo"');
    expect(readFileSync(workspace.progressPath, "utf8")).toContain("# Ralph Progress Log");
  });

  it("preserves existing prd.json and progress.txt on rerun", () => {
    const workspaceDir = join(tempDir, ".ralph");
    mkdirSync(workspaceDir);
    writeFileSync(join(workspaceDir, "PROMPT.md"), "Ship it");
    writeFileSync(join(workspaceDir, "prd.json"), '{ "project": "keep-me", "userStories": [] }\n');
    writeFileSync(join(workspaceDir, "progress.txt"), "existing progress\n");
    const workspace = resolveCompleteWorkspace({ provider: "langchain", cwd: tempDir });

    ensureCompleteStateFiles(workspace);

    expect(readFileSync(workspace.prdPath, "utf8")).toContain('"keep-me"');
    expect(readFileSync(workspace.progressPath, "utf8")).toBe("existing progress\n");
  });

  it("rejects invalid prd.json content", () => {
    const workspaceDir = join(tempDir, ".ralph");
    mkdirSync(workspaceDir);
    writeFileSync(join(workspaceDir, "PROMPT.md"), "Ship it");
    writeFileSync(join(workspaceDir, "prd.json"), "{ nope");
    const workspace = resolveCompleteWorkspace({ provider: "langchain", cwd: tempDir });

    expect(() => ensureCompleteStateFiles(workspace)).toThrow(/Invalid prd\.json/);
  });

  it("runs from the completion workspace parent directory and prints the final response", async () => {
    const workspaceDir = join(tempDir, "packages", "demo", ".ralph");
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(join(workspaceDir, "PROMPT.md"), "Implement the requested change.");
    mockRunHeadlessAgentToCompletion.mockResolvedValueOnce({
      response: "<promise>COMPLETE</promise>",
      stopReason: "completed",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      iterations: 1,
    });

    await expect(
      runCompleteMode({
        provider: "langchain",
        model: "gpt-4.1-mini",
        maxIter: 10,
        sandbox: "workspace",
        mode: "yolo",
        completeDir: workspaceDir,
      }),
    ).rejects.toThrow("process.exit called");

    expect(mockRunHeadlessAgentToCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: dirname(workspaceDir),
        provider: "langchain",
        model: "gpt-4.1-mini",
      }),
    );
    expect(mockRunHeadlessAgentToCompletion.mock.calls[0][0].prompt).toContain(".ralph/prd.json");
    expect(mockRunHeadlessAgentToCompletion.mock.calls[0][0].prompt).toContain(
      "Implement the requested change.",
    );
    expect(stdoutSpy).toHaveBeenCalledWith("<promise>COMPLETE</promise>");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("builds the prompt with explicit same-directory guidance", () => {
    const workspaceDir = join(tempDir, ".ralph");
    mkdirSync(workspaceDir);
    writeFileSync(join(workspaceDir, "PROMPT.md"), "Follow the workflow.");
    writeFileSync(join(workspaceDir, "prd.json"), '{ "userStories": [] }\n');
    writeFileSync(join(workspaceDir, "progress.txt"), "log\n");
    const workspace = resolveCompleteWorkspace({ provider: "langchain", cwd: tempDir });

    const prompt = buildCompletePrompt(workspace);

    expect(prompt).toContain("If the workflow prompt refers to files in the same directory");
    expect(prompt).toContain(".ralph/progress.txt");
    expect(prompt).toContain("Follow the workflow.");
  });
});
