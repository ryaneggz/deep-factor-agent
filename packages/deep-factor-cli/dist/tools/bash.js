import { z } from "zod";
import { createLangChainTool } from "deep-factor-agent";
import { execSync } from "child_process";
const bashSchema = z.object({
    command: z.string().describe("The bash command to execute"),
});
export const bashTool = createLangChainTool("bash", {
    description: "Execute a bash command and return stdout/stderr",
    schema: bashSchema,
    execute: async ({ command }) => {
        const result = execSync(command, {
            encoding: "utf8",
            timeout: 30_000,
            maxBuffer: 1024 * 1024,
        });
        return result;
    },
});
