import { readFileSync, writeFileSync, chmodSync } from "fs";
const cli = "dist/cli.js";
const content = readFileSync(cli, "utf8");
if (!content.startsWith("#!")) {
  writeFileSync(cli, `#!/usr/bin/env node\n${content}`);
}
chmodSync(cli, 0o755);
