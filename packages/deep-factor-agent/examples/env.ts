import "dotenv/config";

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
