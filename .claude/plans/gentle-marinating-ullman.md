# Plan: Create GitHub Issue for Example 12 — Interactive HITL with Multiple Choice

## Context

The user wants a GitHub issue created for a new example (`12-hitl-multiple-choice.ts`) that combines:
- **Example 11** (`11-xml-tools-stream.ts`): interactive multi-turn streaming chat with bash tool + XML thread serialization
- **Human-in-the-loop** (`human-in-the-loop.ts`): the `requestHumanInput` tool which already supports `multiple_choice` format with a `choices` array

The new example should present the user with a multiple choice question during the interaction, with a fallback to free-text input if none of the choices fit.

## Action

Create a single GitHub issue via `gh issue create` with a well-structured description covering:
- The example's purpose and what it derives from
- Key requirements (multiple choice, free-text fallback, streaming, XML thread)
- Acceptance criteria
- Reference to existing code that should be reused

## Key files referenced
- `packages/deep-factor-agent/examples/11-xml-tools-stream.ts` — base example to derive from
- `packages/deep-factor-agent/examples/06-human-in-the-loop.ts` — existing HITL example
- `packages/deep-factor-agent/src/human-in-the-loop.ts` — HITL tool (already supports `multiple_choice` format + `choices` array)

## Verification
- Confirm the issue is created on GitHub and return the URL
