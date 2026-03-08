# Manual Test: Claude SDK Provider in `deepfactor`

## Prerequisites

- LangChain provider auth for the default provider, for example `OPENAI_API_KEY`
- Claude SDK auth via `claude auth login`
- Build the repo: `pnpm install && pnpm -r build`

## Test 1: Default startup path

```bash
deepfactor
```

- Expect the header to show `Provider: langchain | Model: gpt-4.1-mini`
- Enter a prompt and confirm the inline TUI still behaves normally

## Test 2: Claude SDK in print mode

```bash
deepfactor --provider claude-sdk -p "What is 2+2?"
```

- Expect a successful stdout response

## Test 3: Claude SDK in interactive mode

```bash
deepfactor --provider claude-sdk
```

- Expect the header to show `Provider: claude-sdk | Model: claude-sonnet-4-6`
- Enter a prompt and confirm the response completes normally

## Test 4: Explicit model override

```bash
deepfactor --provider claude-sdk --model claude-sonnet-4-6
```

- Expect the header to show the explicit model value

## Test 5: Resume restores provider and model

1. Run `deepfactor --provider claude-sdk`
2. Send a prompt, then exit
3. Run `deepfactor --resume`

- Expect the resumed session to reopen on `claude-sdk` with the stored model unless `--provider` or `--model` is passed explicitly

## Test 6: Resume flag precedence

```bash
deepfactor --resume --provider langchain
deepfactor --resume --model gpt-4.1
deepfactor --resume --provider claude-sdk --model claude-sonnet-4-6
```

- Expect explicit flags to override any stored provider or model metadata

## Test 7: Plan mode print auto-approve

```bash
deepfactor --provider claude-sdk --mode plan -p "Plan a refactor for this repo"
```

- Expect plan mode to auto-approve and print the final plan output

## Test 8: Repeated provider errors surface visibly

Temporarily force an auth or provider failure, then run:

```bash
deepfactor --provider claude-sdk
```

- Expect repeated failures to surface in the transcript as error/tool-result lines
- Expect the final stop reason detail to include the last underlying error message
