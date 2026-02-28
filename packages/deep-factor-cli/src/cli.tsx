import { config } from "dotenv";
import { join } from "node:path";
import { homedir } from "node:os";
import React from "react";
import { render } from "ink";
import meow from "meow";
import { App } from "./app.js";

// Load env: ~/.deep-factor/.env first (global), then local .env (overrides)
config({ path: join(homedir(), ".deep-factor", ".env") });
config();

const cli = meow(
  `
  Usage
    $ deep-factor <prompt>

  Options
    --model, -m      Model identifier (default: gpt-4.1-mini)
    --max-iter, -i   Maximum agent iterations (default: 10)
    --verbose, -v    Show tool calls and detailed output
    --bash           Enable bash execution tool
    --interactive    Interactive REPL mode for multi-turn chat
    --ui             Launch fullscreen TUI mode

  Examples
    $ deep-factor "Explain how React hooks work"
    $ deep-factor --model gpt-4.1 --bash "List files in the current directory"
    $ deep-factor --interactive
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
      verbose: {
        type: "boolean",
        shortFlag: "v",
        default: false,
      },
      bash: {
        type: "boolean",
        default: false,
      },
      interactive: {
        type: "boolean",
        default: false,
      },
      ui: {
        type: "boolean",
        default: false,
      },
    },
  },
);

const prompt = cli.input.join(" ") || undefined;

if (cli.flags.ui) {
  const { withFullScreen } = await import("fullscreen-ink");
  const { TuiApp } = await import("./tui/TuiApp.js");
  await withFullScreen(
    <TuiApp model={cli.flags.model} maxIter={cli.flags.maxIter} enableBash={cli.flags.bash} />,
  ).start();
} else if (!prompt && !cli.flags.interactive) {
  cli.showHelp();
} else {
  const { waitUntilExit } = render(
    <App
      prompt={prompt}
      model={cli.flags.model}
      maxIter={cli.flags.maxIter}
      verbose={cli.flags.verbose}
      enableBash={cli.flags.bash}
      interactive={cli.flags.interactive}
    />,
  );

  try {
    await waitUntilExit();
  } catch {
    process.exit(1);
  }
}
