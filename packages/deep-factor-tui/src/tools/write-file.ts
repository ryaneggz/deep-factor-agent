import { z } from "zod";
import { createLangChainTool } from "deep-factor-agent";
import { writeWorkspaceFile } from "./file-utils.js";

const writeFileSchema = z.object({
  path: z.string().describe("Workspace-relative or absolute path to the file to write"),
  content: z.string().describe("Full file contents to write"),
});

export function createWriteFileTool() {
  return createLangChainTool("write_file", {
    description:
      "Write a workspace file and return a diff summary. Prefer this over bash redirection for normal file creation or replacement.",
    schema: writeFileSchema,
    metadata: { mutatesState: true },
    execute: async ({ path, content }) => writeWorkspaceFile(path, content),
  });
}
