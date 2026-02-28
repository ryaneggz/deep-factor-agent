import { config } from "dotenv";
import { join } from "node:path";
import { homedir } from "node:os";
import React from "react";
import { withFullScreen } from "fullscreen-ink";
import meow from "meow";
import { TuiApp } from "./app.js";

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

  Examples
    $ deep-factor-tui
    $ deep-factor-tui "Explain how React hooks work"
    $ deep-factor-tui --model gpt-4.1 --bash "List files"
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
    },
  },
);

const prompt = cli.input.join(" ") || undefined;

const ink = withFullScreen(
  <TuiApp
    prompt={prompt}
    model={cli.flags.model}
    maxIter={cli.flags.maxIter}
    enableBash={cli.flags.bash}
  />,
);

await ink.start();
await ink.waitUntilExit();
