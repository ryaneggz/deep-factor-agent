# Manual Test: Provider Selection in TUI

## Prerequisites

- `OPENAI_API_KEY` set (for LangChain/OpenAI provider)
- `CLAUDE_CODE_OAUTH_TOKEN` set (for Claude SDK provider — run `claude setup-token` to generate)
- Build the TUI: `pnpm -C packages/deep-factor-tui build`

## Test 1: Default provider (LangChain/OpenAI)

```bash
node packages/deep-factor-tui/dist/cli.js
```

- **Expect**: Header shows `Provider: langchain | Model: openai:gpt-4.1-mini`
- Type `Hello` and press Enter
- **Expect**: Agent responds with text, status goes running → done

## Test 2: Claude SDK provider via flag

```bash
node packages/deep-factor-tui/dist/cli.js --provider claude-sdk
```

- **Expect**: Header shows `Provider: claude-sdk | Model: claude-sonnet-4-6`
- Type `Hello` and press Enter
- **Expect**: Agent responds via Claude SDK

## Test 3: Claude SDK with explicit model

```bash
node packages/deep-factor-tui/dist/cli.js --provider claude-sdk --model claude-sonnet-4-20250514
```

- **Expect**: Header shows `Provider: claude-sdk | Model: claude-sonnet-4-20250514`

## Test 4: Slash command — switch provider mid-session

```bash
node packages/deep-factor-tui/dist/cli.js
```

1. Type `Hello` → responds via LangChain
2. Type `/provider claude-sdk` → Header updates to `Provider: claude-sdk | Model: claude-sonnet-4-6`
3. Type `Hello` → responds via Claude SDK
4. Type `/provider langchain --model openai:gpt-4.1-mini` → Header updates back
5. Type `Hello` → responds via LangChain

## Test 5: Print mode with provider

```bash
node packages/deep-factor-tui/dist/cli.js -p "What is 2+2?"
node packages/deep-factor-tui/dist/cli.js -p --provider claude-sdk "What is 2+2?"
```

- **Expect**: Both output an answer to stdout

## Test 6: Invalid provider

```bash
node packages/deep-factor-tui/dist/cli.js --provider invalid
```

- **Expect**: Error message and exit
