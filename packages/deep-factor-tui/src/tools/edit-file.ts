import { z } from "zod";
import { createLangChainTool } from "deep-factor-agent";
import { editWorkspaceFile } from "./file-utils.js";

const editFileSchema = z.object({
  path: z.string().describe("Workspace-relative or absolute path to the file to edit"),
  oldString: z.string().describe("Exact text to replace"),
  newString: z.string().describe("Replacement text"),
  replaceAll: z.boolean().optional(),
});

export function createEditFileTool() {
  return createLangChainTool("edit_file", {
    description:
      "Edit a workspace file by replacing text and return a diff summary. Prefer this over bash/perl/sed for normal targeted edits.",
    schema: editFileSchema,
    metadata: { mutatesState: true },
    execute: async ({ path, oldString, newString, replaceAll }) =>
      editWorkspaceFile({ path, oldString, newString, replaceAll }),
  });
}
