# Plan: Update Example Specs to Default to OpenAI

## Context

The two example spec files (`specs/01-examples-setup-basic.md` and `specs/02-examples-advanced.md`) were written defaulting to Anthropic (`claude-sonnet-4-5`, `@langchain/anthropic`, `ANTHROPIC_API_KEY`). The user already has an `OPENAI_API_KEY` in `.env` and wants OpenAI as the default provider.

## Changes

Update both spec files to swap the default provider from Anthropic to OpenAI:

### `specs/01-examples-setup-basic.md`
| Location | Old | New |
|----------|-----|-----|
| `.env.example` | `ANTHROPIC_API_KEY=your-api-key-here` lead | `OPENAI_API_KEY=your-api-key-here` lead |
| `.env.example` | Default model comment `claude-sonnet-4-5` | `gpt-4o` |
| `package.json` changes | `@langchain/anthropic` | `@langchain/openai` |
| `env.ts` — `MODEL_ID` default | `"claude-sonnet-4-5"` | `"gpt-4o"` |
| `env.ts` — key validation | Check `ANTHROPIC_API_KEY` first | Check `OPENAI_API_KEY` first |
| `README.md` — setup instructions | `ANTHROPIC_API_KEY=sk-ant-...` | `OPENAI_API_KEY=sk-...` |
| `README.md` — config example | Anthropic first in list | OpenAI first, Anthropic as alt |

### `specs/02-examples-advanced.md`
No code changes needed — advanced examples reference `MODEL_ID` from `env.ts` and don't hardcode a provider. Already correct.

## Files to Edit

| File | Description |
|------|-------------|
| `specs/01-examples-setup-basic.md` | Update defaults from Anthropic → OpenAI |

## Verification

1. Read updated `specs/01-examples-setup-basic.md` and confirm all Anthropic defaults are replaced with OpenAI
2. Confirm `specs/02-examples-advanced.md` has no Anthropic-specific defaults to change
