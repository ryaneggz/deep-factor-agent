import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { isPlanResult } from "deep-factor-agent";
import type { AgentMode } from "deep-factor-agent";
import type { SandboxMode } from "./tools/bash.js";
import { runHeadlessAgentToCompletion } from "./agent-runner.js";
import type { ProviderType } from "./types.js";

export interface CompleteModeOptions {
  provider: ProviderType;
  model: string;
  maxIter: number;
  sandbox: SandboxMode;
  mode: AgentMode;
  completeDir?: string;
}

export interface CompleteWorkspace {
  workspaceDir: string;
  projectDir: string;
  promptPath: string;
  prdPath: string;
  progressPath: string;
}

const DEFAULT_COMPLETE_DIR = ".ralph";
const DEFAULT_PRD_TEMPLATE = {
  project: "",
  branchName: "",
  description: "",
  userStories: [],
};

function formatPromptPath(targetPath: string, projectDir: string): string {
  const relativePath = relative(projectDir, targetPath);
  return relativePath && !relativePath.startsWith("..") ? relativePath : targetPath;
}

export function resolveCompleteWorkspace(args: {
  completeDir?: string;
  provider: ProviderType;
  cwd?: string;
}): CompleteWorkspace {
  const cwd = args.cwd ?? process.cwd();
  const workspaceDir = resolve(cwd, args.completeDir ?? DEFAULT_COMPLETE_DIR);

  if (!existsSync(workspaceDir)) {
    throw new Error(`Completion directory does not exist: ${workspaceDir}`);
  }

  if (!statSync(workspaceDir).isDirectory()) {
    throw new Error(`Completion directory is not a directory: ${workspaceDir}`);
  }

  const promptCandidates =
    args.provider === "claude"
      ? ["CLAUDE.md", "PROMPT.md", "prompt.md"]
      : ["PROMPT.md", "prompt.md", "CLAUDE.md"];
  const promptPath = promptCandidates
    .map((fileName) => join(workspaceDir, fileName))
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());

  if (!promptPath) {
    throw new Error(
      `No completion prompt found in ${workspaceDir}. Expected one of: ${promptCandidates.join(", ")}`,
    );
  }

  return {
    workspaceDir,
    projectDir: dirname(workspaceDir),
    promptPath,
    prdPath: join(workspaceDir, "prd.json"),
    progressPath: join(workspaceDir, "progress.txt"),
  };
}

export function ensureCompleteStateFiles(workspace: CompleteWorkspace): void {
  if (!existsSync(workspace.prdPath)) {
    const prdExamplePath = join(workspace.workspaceDir, "prd.json.example");
    if (existsSync(prdExamplePath) && statSync(prdExamplePath).isFile()) {
      copyFileSync(prdExamplePath, workspace.prdPath);
    } else {
      writeFileSync(workspace.prdPath, `${JSON.stringify(DEFAULT_PRD_TEMPLATE, null, 2)}\n`);
    }
  }

  const prdRaw = readFileSync(workspace.prdPath, "utf8");
  try {
    JSON.parse(prdRaw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid prd.json at ${workspace.prdPath}: ${message}`);
  }

  if (!existsSync(workspace.progressPath)) {
    writeFileSync(
      workspace.progressPath,
      `# Ralph Progress Log\nStarted: ${new Date().toISOString()}\n---\n`,
    );
  }
}

export function buildCompletePrompt(workspace: CompleteWorkspace): string {
  const promptBody = readFileSync(workspace.promptPath, "utf8").trimEnd();
  const promptName = basename(workspace.promptPath);
  const workspaceLabel = formatPromptPath(workspace.workspaceDir, workspace.projectDir);
  const prdLabel = formatPromptPath(workspace.prdPath, workspace.projectDir);
  const progressLabel = formatPromptPath(workspace.progressPath, workspace.projectDir);

  return [
    "You are running in deepfactor completion mode.",
    `Project working directory: ${workspace.projectDir}`,
    `Completion workspace: ${workspace.workspaceDir}`,
    `Workflow prompt source: ${promptName}`,
    `Use the Ralph state files at ${prdLabel} and ${progressLabel}.`,
    `If the workflow prompt refers to files in the same directory as the prompt, resolve them inside ${workspaceLabel}.`,
    "",
    promptBody,
  ].join("\n");
}

export async function runCompleteMode(options: CompleteModeOptions): Promise<void> {
  try {
    const workspace = resolveCompleteWorkspace({
      completeDir: options.completeDir,
      provider: options.provider,
    });
    ensureCompleteStateFiles(workspace);

    const finalResult = await runHeadlessAgentToCompletion({
      prompt: buildCompletePrompt(workspace),
      provider: options.provider,
      model: options.model,
      maxIter: options.maxIter,
      sandbox: options.sandbox,
      mode: options.mode,
      cwd: workspace.projectDir,
    });

    if (finalResult.stopReason === "human_input_needed") {
      process.stderr.write(
        "Error: Agent requested human input in non-interactive completion mode.\n",
      );
      process.exit(1);
    }

    if (finalResult.stopReason === "max_errors") {
      const detail = finalResult.stopDetail ?? "Agent stopped due to repeated errors";
      process.stderr.write(`Error: ${detail}\n`);
      process.exit(1);
    }

    process.stdout.write(isPlanResult(finalResult) ? finalResult.plan : finalResult.response);
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}
