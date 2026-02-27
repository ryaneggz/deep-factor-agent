import { config } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

// Load .env from ~/.deep-factor/.env if it exists, otherwise fall back to cwd
const globalEnv = resolve(homedir(), ".deep-factor", ".env");
const localEnv = resolve(process.cwd(), ".env");

config({ path: existsSync(globalEnv) ? globalEnv : localEnv });

// Default model if MODEL_ID env var is not set
export const MODEL_ID = process.env.MODEL_ID ?? "gpt-4.1-mini";

// Validate that at least one provider key is present
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
const hasGoogleKey = !!process.env.GOOGLE_API_KEY;

if (!hasAnthropicKey && !hasOpenAIKey && !hasGoogleKey) {
  console.error(
    "Error: No API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY in your .env file.",
  );
  process.exit(1);
}

console.log(`Using model: ${MODEL_ID}\n`);
