# Plan: Pin Header at Top of Chat (Like Claude Code)

## Context

Currently, the Deep Factor TUI header ("Deep Factor TUI | Provider: ... | Model: ...") is rendered in the **dynamic/live area** of Ink's layout (line 117 of `app.tsx`, outside `<Static>`). This means it re-renders in-place at the bottom of the terminal above the active turn — not pinned at the top of the chat. The user wants it to behave like Claude Code, where the header appears once at the very top and the conversation scrolls below it.

## Approach

Move the Header into the `<Static>` component so it renders once at the top of stdout and scrolls up with conversation history.

### Files to Modify

1. **`packages/deep-factor-tui/src/app.tsx`**

   - Create a union-typed items array that includes a header item first, followed by static turns
   - Replace the standalone `<Header>` + `<Static items={staticTurns}>` with a single `<Static>` that renders the header as the first item and turns for subsequent items

   Concretely:
   ```tsx
   // Build combined static items: header + completed turns
   type StaticItem =
     | { kind: "header"; id: "header"; provider: string; model: string }
     | { kind: "turn"; id: string; turn: TranscriptTurnData };

   const staticItems = useMemo<StaticItem[]>(() => [
     { kind: "header", id: "header", provider, model },
     ...staticTurns.map((turn) => ({ kind: "turn" as const, id: turn.id, turn })),
   ], [provider, model, staticTurns]);
   ```

   Then in JSX, replace lines 117-120:
   ```tsx
   <Static items={staticItems}>
     {(item) =>
       item.kind === "header" ? (
         <Header key="header" provider={item.provider} model={item.model} />
       ) : (
         <TranscriptTurn key={item.id} turn={item.turn} isActiveTurn={false} />
       )
     }
   </Static>
   ```

   This renders the header exactly once at the top of stdout, and it scrolls up naturally with the rest of the conversation — matching Claude Code's behavior.

## Verification

1. `pnpm -C packages/deep-factor-tui build` — ensure it compiles
2. `pnpm -C packages/deep-factor-tui type-check` — no type errors
3. Run `deepfactor "Who won the 2001 world series?"` and confirm:
   - Header appears once at the very top
   - Header does NOT repeat between turns
   - Conversation scrolls below it naturally
4. `pnpm -r test` — existing tests pass
