import { z } from "zod";
export declare const TOOL_NAME_REQUEST_HUMAN_INPUT = "requestHumanInput";
export declare const requestHumanInputSchema: z.ZodObject<{
    question: z.ZodString;
    context: z.ZodOptional<z.ZodString>;
    urgency: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>>>;
    format: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        free_text: "free_text";
        yes_no: "yes_no";
        multiple_choice: "multiple_choice";
    }>>>;
    choices: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const requestHumanInput: import("@langchain/core/tools").DynamicStructuredTool<z.ZodObject<{
    question: z.ZodString;
    context: z.ZodOptional<z.ZodString>;
    urgency: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>>>;
    format: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        free_text: "free_text";
        yes_no: "yes_no";
        multiple_choice: "multiple_choice";
    }>>>;
    choices: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>, {
    question: string;
    urgency: "low" | "medium" | "high";
    format: "free_text" | "yes_no" | "multiple_choice";
    context?: string | undefined;
    choices?: string[] | undefined;
}, {
    question: string;
    context?: string | undefined;
    urgency?: "low" | "medium" | "high" | undefined;
    format?: "free_text" | "yes_no" | "multiple_choice" | undefined;
    choices?: string[] | undefined;
}, string, "requestHumanInput">;
//# sourceMappingURL=human-in-the-loop.d.ts.map