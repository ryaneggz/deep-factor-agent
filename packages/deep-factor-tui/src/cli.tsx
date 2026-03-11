import { config } from "dotenv";
import { join } from "node:path";
import { homedir } from "node:os";
import meow from "meow";

let didLoadEnv = false;

function loadEnv(): void {
  if (didLoadEnv) return;
  didLoadEnv = true;
  // Load env: ~/.deepfactor/.env first (global), then local .env (overrides)
  config({ path: join(homedir(), ".deepfactor", ".env") });
  config();
}

const cli = meow(
  `
  Usage
    $ deepfactor [prompt]

  Options
    --provider       Provider: langchain, claude, codex (default: langchain)
    --model, -m      Model identifier (default depends on provider)
    --max-iter, -i   Maximum agent iterations (default: 10)
    --mode           Execution mode: plan, approve, yolo (default: yolo)
    --sandbox, -s    Sandbox mode: workspace (default), local, docker
    --print, -p      Non-interactive print mode (output answer to stdout)
    --output-format, -o  Output format: text (default), stream-json (JSONL events)
    --resume, -r     Resume a previous session (optionally pass session ID)

  Examples
    $ deepfactor
    $ deepfactor "Explain how React hooks work"
    $ deepfactor --provider claude
    $ deepfactor --provider codex
    $ deepfactor -p "What is 2+2?"
    $ deepfactor --provider claude -p "What is 2+2?"
    $ deepfactor --provider codex -p "What is 2+2?"
    $ deepfactor -p "List files in the current directory"
    $ deepfactor -s local "Run system commands"
    $ cat PROMPT.md | deepfactor -p
    $ deepfactor --resume
    $ deepfactor --resume <session-id>
`,
  {
    importMeta: import.meta,
    flags: {
      model: {
        type: "string",
        shortFlag: "m",
      },
      maxIter: {
        type: "number",
        shortFlag: "i",
        default: 10,
      },
      mode: {
        type: "string",
        default: "yolo",
      },
      sandbox: {
        type: "string",
        shortFlag: "s",
        default: "workspace",
      },
      provider: {
        type: "string",
      },
      print: {
        type: "boolean",
        shortFlag: "p",
        default: false,
      },
      outputFormat: {
        type: "string",
        shortFlag: "o",
        default: "text",
      },
      resume: {
        type: "string",
        shortFlag: "r",
      },
    },
  },
);

import type { SandboxMode } from "./tools/bash.js";
import type { AgentMode } from "deep-factor-agent";
import { DEFAULT_MODELS, DEFAULT_PROVIDER, normalizeProvider } from "./types.js";

const validSandboxModes = ["workspace", "local", "docker"] as const;
const sandboxMode = cli.flags.sandbox as SandboxMode;
const validModes = ["plan", "approve", "yolo"] as const;
const mode = cli.flags.mode as AgentMode;
if (!validSandboxModes.includes(sandboxMode)) {
  process.stderr.write(
    `Error: Invalid sandbox mode "${cli.flags.sandbox}". Use: workspace, local, docker\n`,
  );
  process.exit(1);
}
if (!validModes.includes(mode)) {
  process.stderr.write(`Error: Invalid mode "${cli.flags.mode}". Use: plan, approve, yolo\n`);
  process.exit(1);
}
const providerFlag = normalizeProvider(cli.flags.provider);
if (cli.flags.provider && !providerFlag) {
  process.stderr.write(
    `Error: Invalid provider "${cli.flags.provider}". Use: langchain, claude, codex\n`,
  );
  process.exit(1);
}

const hasProviderFlag = process.argv.includes("--provider");
const hasModelFlag = process.argv.includes("--model") || process.argv.includes("-m");
let provider = providerFlag ?? DEFAULT_PROVIDER;
let model = cli.flags.model ?? DEFAULT_MODELS[provider];

let prompt = cli.input.join(" ") || undefined;

if (cli.flags.print) {
  // Print mode: non-interactive, headless agent
  // If no positional prompt, try reading from stdin (piped input)
  if (!prompt && !process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    prompt = Buffer.concat(chunks).toString().trim() || undefined;
  }

  if (!prompt) {
    process.stderr.write("Error: Print mode requires a prompt argument or piped stdin.\n");
    process.exit(1);
  }

  if (provider === "langchain") {
    loadEnv();
  }

  const { runPrintMode } = await import("./print.js");
  await runPrintMode({
    prompt,
    provider,
    model,
    maxIter: cli.flags.maxIter,
    sandbox: sandboxMode,
    mode,
    outputFormat: cli.flags.outputFormat as "text" | "stream-json",
  });
} else {
  // TUI mode: inline interactive
  const React = await import("react");
  const { render } = await import("ink");
  const { TuiApp } = await import("./app.js");
  const {
    getSessionId,
    loadSession,
    getLatestSessionId,
    buildThreadFromSession,
    resolveSessionSettings,
  } = await import("./session-logger.js");

  // Handle --resume flag: bare --resume or -r means "last", otherwise use provided ID
  const hasResumeFlag = process.argv.includes("--resume") || process.argv.includes("-r");
  let resumeMessages: import("./types.js").ChatMessage[] | undefined;
  let resumeThread: import("deep-factor-agent").AgentThread | undefined;
  if (hasResumeFlag) {
    let resumeId = cli.flags.resume; // will be the session ID if provided
    if (!resumeId) {
      // bare --resume with no ID → use latest session
      const latestId = getLatestSessionId();
      if (!latestId) {
        process.stderr.write("Error: No previous sessions found.\n");
        process.exit(1);
      }
      resumeId = latestId;
    }
    const entries = loadSession(resumeId);
    if (entries.length === 0) {
      process.stderr.write(`Error: Session "${resumeId}" not found or empty.\n`);
      process.exit(1);
    }
    resumeMessages = entries.map((entry, i) => ({
      id: `resume-${i}`,
      role: entry.role,
      content: entry.content,
      ...(entry.toolName ? { toolName: entry.toolName } : {}),
      ...(entry.toolArgs ? { toolArgs: entry.toolArgs } : {}),
      ...(entry.toolCallId ? { toolCallId: entry.toolCallId } : {}),
      ...(entry.toolDisplay ? { toolDisplay: entry.toolDisplay } : {}),
    }));
    resumeThread = buildThreadFromSession(entries);
    ({ provider, model } = resolveSessionSettings({
      entries,
      hasProviderFlag,
      providerFlag,
      hasModelFlag,
      modelFlag: cli.flags.model,
    }));
    process.stderr.write(`Resuming session: ${resumeId}\n`);
  }

  if (provider === "langchain") {
    loadEnv();
  }

  const instance = render(
    React.createElement(TuiApp, {
      prompt,
      provider,
      model,
      maxIter: cli.flags.maxIter,
      sandbox: sandboxMode,
      parallelToolCalls: true,
      mode,
      resumeMessages,
      resumeThread,
    }),
  );

  await instance.waitUntilExit();

  const sessionId = getSessionId();
  process.stderr.write(`\ndeepfactor --resume ${sessionId}\n`);
}
