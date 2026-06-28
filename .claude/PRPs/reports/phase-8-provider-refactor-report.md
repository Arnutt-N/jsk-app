# Implementation Report: Phase 8 — Provider Refactor (LiveChatProvider → custom hooks)

**Date:** 2026-06-28 · **Branch:** `docs/livechat-audit-remediation-prp` · **Plan:** `phase-8-provider-refactor.plan.md`

## Summary

Split the 805-line `LiveChatContext.tsx` god-component into a thin (395-line) composition
root plus six focused, single-responsibility hooks. **Zero behavior change** — the 34-key
public context contract is preserved byte-for-byte and the four consumer components are
untouched. Orchestrated sequentially (one task per commit, validate after each) because the
file has a circular socket seam that makes parallel authoring unsafe; multi-expertise review
was fanned out in two parallel rounds (7 agents total).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large (high blast-radius) | Large — confirmed; the circular seam was the crux |
| Files created | 5 (4 hooks + 1 helper) | 6 hooks/helpers + 3 test files |
| Provider size | < 400 (target < 300) | **395** |
| Contract | 34 keys, unchanged | 34 keys, unchanged (contract test green) |
| Consumer edits | 0 | **0** (git diff empty) |

## Tasks Completed (one commit each)

| # | Task | Commit | Notes |
|---|---|---|---|
| 0 | Contract baseline test (34 keys) | `75e86d0` | Green on original code first (regression net) |
| 1 | Extract `useMediaQuery` | `af0a505` | + unit test |
| 2 | Extract `liveChatApi.ts` pure helpers | `69eded0` | **Deviation:** imported `readErrorMessage` from `@/lib/api-error` (the live-chat copy was byte-identical) instead of duplicating |
| 3 | Extract `useMessageFlow` + tests | `f9a2492` | `wsSendMessageRef` bridge breaks the cycle; B6 ack-timeout race tests added |
| 4 | Extract `useChatRoom` | `2b4c945` | **Deviation:** dropped dead `firstLoadRef`; `fetchChatDetail` kept provider-side (then moved to `useConversationSync` in T5) to break a `useMessageFlow`↔`useChatRoom` cycle |
| — | Review round 1 (4 agents) | `a16afc9` | See below |
| 5 | Extract `useConversationSync` | `76f9fb9` | + `currentChat`→`updatedChat` rename |
| 6 | Trim provider < 400 | `604e779` | Extracted 8 setters → `useLiveChatActions`; moved `formatTime` to `liveChatApi` (module-stable) |
| 7 | Verify sizes + full matrix | (no code) | All green |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Type check (`tsc --noEmit`) | ✅ Pass | 0 errors |
| Lint (`eslint`, 8 files) | ✅ Pass | 0 errors, 0 warnings |
| Unit tests (`vitest run`) | ✅ Pass | **259 tests / 33 files** (incl. 3 new Phase-8 suites) |
| Build (`tsc && next build`) | ✅ Pass | `/admin/live-chat` route compiles |
| Manual 16-flow e2e | ⏳ Deferred | Requires the live WSL backend+frontend stack + 2-client browser; behavior parity is instead evidenced by the contract/memo/claim-contention tests + 3-reviewer byte-diff analysis. Recommended before merge. |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `_context/LiveChatContext.tsx` | REWRITTEN | 805 → 395 |
| `_hooks/useMediaQuery.ts` | CREATED | 26 |
| `_hooks/liveChatApi.ts` | CREATED | 98 |
| `_hooks/useMessageFlow.ts` | CREATED | 218 |
| `_hooks/useChatRoom.ts` | CREATED | 186 |
| `_hooks/useConversationSync.ts` | CREATED | 170 |
| `_hooks/useLiveChatActions.ts` | CREATED | 60 |
| `_context/__tests__/LiveChatContext.contract.test.tsx` | CREATED | 3 tests |
| `_hooks/__tests__/useMediaQuery.test.tsx` | CREATED | 4 tests |
| `_hooks/__tests__/useMessageFlow.test.tsx` | CREATED | 7 tests |
| `_context/__tests__/conversationUpdate.test.ts` | UPDATED | import path → liveChatApi |

## Architecture: the composition order (acyclic, one ref-bridge)

`useMediaQuery` → `useConversationSync` (owns the data-fetches) → `useMessageFlow` (reads
`wsSendMessage` via a provider-owned `wsSendMessageRef`) → build socket config from both
hooks' handlers → `useLiveChatSocket()` **stays in the provider** (composition seam) →
`useChatRoom` (receives socket fns + fetches as params). The WebSocket presence +
claim-contention logic intentionally stays in the provider (refresh errata H-R1).

## Deviations from Plan (all sound, reviewer-confirmed)

1. **`readErrorMessage` deduped** — imported from canonical `@/lib/api-error` (identical impl) rather than copied. −22 duplicate lines, zero wording change.
2. **`fetchChatDetail`/`fetchConversations`/`refreshConversationState` live in `useConversationSync`**, injected down into the other hooks — breaks the cross-hook cycle (plan put `fetchChatDetail` in `useChatRoom`).
3. **`firstLoadRef` dropped** — provably write-only dead code in the original.
4. **8 setters → `useLiveChatActions`** and **`formatTime` → `liveChatApi`** — to bring the provider under 400 without violating H-R1.

## Review Findings (2 rounds, 7 agents — all SHIP)

- **Round 1** (react, typescript, silent-failure, code-quality) on the socket seam: no regressions. 1 HIGH (`toggleMode` no try/catch) ruled **pre-existing & out-of-scope** (adding it would change behavior). Reverted an over-eager dep-array "fix": param-refs MUST be listed in dep arrays (exhaustive-deps cannot prove param-ref stability — unlike locally-created refs), so the original arrays were correct.
- **Round 2** (react, typescript, code-quality) on the new extractions + final composition: consumer-untouched **PASS**; all deviations sound; contract intact; timers/strings preserved.

## Pre-existing follow-ups (NOT introduced by Phase 8 — out of scope for a behavior-preserving refactor)

- `toggleMode` lacks try/catch → unhandled rejection on network failure (add notification like claim/close).
- `res.json() as CurrentChat` / `as {messages,has_more}` unvalidated casts (consider Zod at the boundary).
- Initial-load `.catch(() => undefined)` swallows `fetchMessagesPage` errors (consider `setHasMoreHistory(false)`).
- `sendMedia` failure shows no toast (only backend-offline banner).
- No `AbortController` on list/detail fetches (poll vs filter-change race).
- Optional: explicit return types on the new hooks; `PAGE_SIZE` constant for the `50` page-size.

## Next Steps

- [ ] Manual 16-flow walkthrough on the live WSL stack (claim/transfer/close/reconnect/typing/history/mobile/deep-link).
- [ ] Open PR for the whole `docs/livechat-audit-remediation-prp` branch (Phases 1–8).
