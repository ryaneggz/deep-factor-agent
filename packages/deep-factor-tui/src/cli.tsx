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
    $ deep-factor-tui [prompt]

  Options
    --model, -m      Model identifier (default: gpt-4.1-mini)
    --max-iter, -i   Maximum agent iterations (default: 10)
    --bash           Enable bash execution tool
    --print, -p      Non-interactive print mode (output answer to stdout)
    --sandbox        Enable bash tool in print mode

  Examples
    $ deep-factor-tui
    $ deep-factor-tui "Explain how React hooks work"
    $ deep-factor-tui -p "What is 2+2?"
    $ deep-factor-tui -p --sandbox "List files in the current directory"
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
    },
  },
);

const prompt = cli.input.join(" ") || undefined;

if (cli.flags.print) {
  // Print mode: non-interactive, headless agent
  if (!prompt) {
    process.stderr.write("Error: Print mode requires a prompt argument.\n");
    process.exit(1);
  }

  const { runPrintMode } = await import("./print.js");
  await runPrintMode({
    prompt,
    model: cli.flags.model,
    maxIter: cli.flags.maxIter,
    sandbox: cli.flags.sandbox,
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
      enableBash: cli.flags.bash,
      parallelToolCalls: true,
    }),
  );

  await ink.start();
  await ink.waitUntilExit();
}
