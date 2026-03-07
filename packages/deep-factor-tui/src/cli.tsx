import { config } from "dotenv";
import { join } from "node:path";
import { homedir } from "node:os";
import meow from "meow";

// Load env: ~/.deep-factor/.env first (global), then local .env (overrides)
config({ path: join(homedir(), ".deep-factor", ".env") });
config();

const cli = meow(
  `
  Usage
    $ deepfactor [prompt]

  Options
    --model, -m      Model identifier (default: gpt-4.1-mini)
    --max-iter, -i   Maximum agent iterations (default: 10)
    --sandbox, -s    Sandbox mode: workspace (default), local, docker
    --print, -p      Non-interactive print mode (output answer to stdout)

  Examples
    $ deepfactor
    $ deepfactor "Explain how React hooks work"
    $ deepfactor -p "What is 2+2?"
    $ deepfactor -p "List files in the current directory"
    $ deepfactor -s local "Run system commands"
    $ cat PROMPT.md | deepfactor -p
`,
  {
    importMeta: import.meta,
    flags: {
      model: {
        type: "string",
        shortFlag: "m",
        default: "gpt-4.1-mini",
      },
      maxIter: {
        type: "number",
        shortFlag: "i",
        default: 10,
      },
      sandbox: {
        type: "string",
        shortFlag: "s",
        default: "workspace",
      },
      print: {
        type: "boolean",
        shortFlag: "p",
        default: false,
      },
    },
  },
);

import type { SandboxMode } from "./tools/bash.js";

const validSandboxModes = ["workspace", "local", "docker"] as const;
const sandboxMode = cli.flags.sandbox as SandboxMode;
if (!validSandboxModes.includes(sandboxMode)) {
  process.stderr.write(
    `Error: Invalid sandbox mode "${cli.flags.sandbox}". Use: workspace, local, docker\n`,
  );
  process.exit(1);
}

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

  const { runPrintMode } = await import("./print.js");
  await runPrintMode({
    prompt,
    model: cli.flags.model,
    maxIter: cli.flags.maxIter,
    sandbox: sandboxMode,
  });
} else {
  // TUI mode: fullscreen interactive
  const React = await import("react");
  const { withFullScreen } = await import("fullscreen-ink");
  const { TuiApp } = await import("./app.js");

  const ink = withFullScreen(
    React.createElement(TuiApp, {
      prompt,
      model: cli.flags.model,
      maxIter: cli.flags.maxIter,
      sandbox: sandboxMode,
      parallelToolCalls: true,
    }),
  );

  await ink.start();
  await ink.waitUntilExit();
}
