import { z } from "zod";
import { createLangChainTool } from "deep-factor-agent";
import { exec as execCb } from "node:child_process";

function execAsync(
  command: string,
  options: { encoding: string; timeout: number; maxBuffer: number },
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

export const bashTool = createLangChainTool("bash", {
  description: "Execute a bash command and return stdout/stderr",
  schema: bashSchema,
  execute: async ({ command }) => {
    const stdout = await execAsync(command, {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    return stdout;
  },
});
