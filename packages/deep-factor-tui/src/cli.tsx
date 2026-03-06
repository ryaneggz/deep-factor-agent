import { config } from "dotenv";
import { join } from "node:path";
import { homedir } from "node:os";
import meow from "meow";
import type { ProviderType } from "./types.js";
import { DEFAULT_MODELS } from "./types.js";

// Load env: ~/.deep-factor/.env first (global), then local .env (overrides)
config({ path: join(homedir(), ".deep-factor", ".env") });
config();

const cli = meow(
  `
  Usage
    $ deep-factor-tui [prompt]

  Options
    --model, -m      Model identifier (default depends on provider)
    --max-iter, -i   Maximum agent iterations (default: 10)
    --bash           Enable bash execution tool
    --print, -p      Non-interactive print mode (output answer to stdout)
    --sandbox        Enable bash tool in print mode
    --provider       Provider type: "langchain" or "claude-sdk" (default: langchain)

  Examples
    $ deep-factor-tui
    $ deep-factor-tui --provider claude-sdk
    $ deep-factor-tui --provider claude-sdk --model claude-opus-4-6
    $ deep-factor-tui "Explain how React hooks work"
    $ deep-factor-tui -p "What is 2+2?"
    $ deep-factor-tui -p --sandbox "List files in the current directory"
    $ cat PROMPT.md | deep-factor-tui -p --sandbox
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
      bash: {
        type: "boolean",
        default: false,
      },
      print: {
        type: "boolean",
        shortFlag: "p",
        default: false,
      },
      sandbox: {
        type: "boolean",
        default: false,
      },
      provider: {
        type: "string",
        default: "langchain",
      },
    },
  },
);

const provider = cli.flags.provider as string;
if (provider !== "langchain" && provider !== "claude-sdk") {
  process.stderr.write(
    `Error: Invalid provider "${provider}". Must be "langchain" or "claude-sdk".\n`,
  );
  process.exit(1);
}
const validProvider: ProviderType = provider;
const model = cli.flags.model ?? DEFAULT_MODELS[validProvider];

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
    model,
    maxIter: cli.flags.maxIter,
    sandbox: cli.flags.sandbox,
    provider: validProvider,
  });
} else {
  // TUI mode: fullscreen interactive
  const React = await import("react");
  const { withFullScreen } = await import("fullscreen-ink");
  const { TuiApp } = await import("./app.js");

  const ink = withFullScreen(
    React.createElement(TuiApp, {
      prompt,
      model,
      maxIter: cli.flags.maxIter,
      enableBash: cli.flags.bash,
      parallelToolCalls: true,
      provider: validProvider,
    }),
  );

  await ink.start();
  await ink.waitUntilExit();
}
