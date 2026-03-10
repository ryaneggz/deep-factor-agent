import { z } from "zod";
import { createLangChainTool } from "deep-factor-agent";
import { exec as execCb } from "node:child_process";

export type SandboxMode = "workspace" | "local" | "docker";

function execAsync(
  command: string,
  options: { encoding: string; timeout: number; maxBuffer: number; cwd?: string },
): Promise<string> {
  return new Promise((resolve, reject) => {
    execCb(command, options, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout as string);
    });
  });
}

const bashSchema = z.object({
  command: z.string().describe("The bash command to execute"),
});

export function createBashTool(sandbox: SandboxMode = "workspace") {
  if (sandbox === "docker") {
    throw new Error("Docker sandbox is not yet supported.");
  }

  if (sandbox === "local") {
    throw new Error("Local sandbox is not yet supported.");
  }

  const cwd = sandbox === "workspace" ? process.cwd() : undefined;

  return createLangChainTool("bash", {
    description: "Execute a bash command and return stdout/stderr",
    schema: bashSchema,
    execute: async ({ command }) => {
      const stdout = await execAsync(command, {
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        cwd,
      });
      return stdout;
    },
  });
}

/** Default bash tool (workspace-scoped) for backwards compatibility */
export const bashTool = createBashTool("workspace");
