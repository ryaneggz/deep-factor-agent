# Manual Test: Claude CLI Provider in `deepfactor`

## Prerequisites

- LangChain provider auth for the default provider, for example `OPENAI_API_KEY`
- Claude CLI auth via `claude auth login`
- Build the repo: `pnpm install && pnpm -r build`

## Test 1: Default startup path

```bash
deepfactor
```

- Expect the header to show `Provider: langchain | Model: gpt-4.1-mini`
- Enter a prompt and confirm the inline TUI still behaves normally

## Test 2: Claude in print mode

```bash
deepfactor --provider claude -p "What is 2+2?"
```

- Expect a successful stdout response

## Test 3: Claude in interactive mode

```bash
deepfactor --provider claude
```

- Expect the header to show `Provider: claude | Model: sonnet`
- Enter a prompt and confirm the response completes normally

## Test 4: Explicit model override

```bash
deepfactor --provider claude --model sonnet
```

- Expect the header to show the explicit model value

## Test 5: Resume restores provider and model

1. Run `deepfactor --provider claude`
2. Send a prompt, then exit
3. Run `deepfactor --resume`

- Expect the resumed session to reopen on `claude` with the stored model unless `--provider` or `--model` is passed explicitly
- Expect older sessions saved as `claude-sdk` to normalize to `claude`

## Test 6: Resume flag precedence

```bash
deepfactor --resume --provider langchain
deepfactor --resume --model gpt-4.1
deepfactor --resume --provider claude --model sonnet
```

- Expect explicit flags to override any stored provider or model metadata

## Test 7: Plan mode print auto-approve

```bash
deepfactor --provider claude --mode plan -p "Plan a refactor for this repo"
```

- Expect plan mode to auto-approve and print the final plan output

## Test 8: Repeated provider errors surface visibly

Temporarily force an auth or provider failure, then run:

```bash
deepfactor --provider claude
```

- Expect repeated failures to surface in the transcript as error/tool-result lines
- Expect the final stop reason detail to include the last underlying error message
