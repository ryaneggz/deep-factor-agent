import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const requestHumanInputSchema = z.object({
  question: z.string().describe("The question to ask the human"),
  context: z.string().optional().describe("Background context for the question"),
  urgency: z
    .enum(["low", "medium", "high"])
    .optional()
    .default("medium")
    .describe("How urgent is this request"),
  format: z
    .enum(["free_text", "yes_no", "multiple_choice"])
    .optional()
    .default("free_text")
    .describe("Expected response format"),
  choices: z
    .array(z.string())
    .optional()
    .describe("Options for multiple_choice format"),
});

export const requestHumanInput = tool(
  async (args: z.infer<typeof requestHumanInputSchema>) => {
    return JSON.stringify({
      requested: true,
      question: args.question,
      context: args.context,
      urgency: args.urgency,
      format: args.format,
      choices: args.choices,
    });
  },
  {
    name: "requestHumanInput",
    description:
      "Request input or approval from a human. Use when you need clarification, confirmation, or a decision.",
    schema: requestHumanInputSchema,
  },
);
