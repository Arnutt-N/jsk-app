# Live-Chat Frontend Reassembly — PRP Implementation Plan

> **Status:** REVIEWED 2026-07-30 (4 amendments applied: F1 stale closure, F2 wsStatusRef ordering, F3 type exports, F4 useVirtualScroll API) — approved for implementation
> **Branch:** `refactor/live-chat-frontend`
> **PRD:** `.claude/PRPs/prds/live-chat-frontend-reassembly.prd.md`
> **Master plan:** `~/.qoder/plans/pale-storm-wagtail.md` (PR C section, approved)

## Goal

Surgical extraction, not a rewrite: move virtualization/scroll logic out of `ChatArea.tsx` into `useVirtualScroll`, move WS session-event handlers out of `LiveChatContext.tsx` into `useSessionEvents`, and consolidate the 4 Context-local state values into the Zustand store. Zero behavior change; the 34-field context contract is preserved byte-for-byte.

## Current State (verified 2026-07-30 against `main` d1b47f7)

- `_components/ChatArea.tsx` — 534 lines. Virtualization constants L30-32; window computation L277-292; render slice L444-483; RAF scroll throttle L120-131; IO history paging L245-261 (sentinel L397); auto-scroll near-bottom L160-178; double-rAF on `selectedId` change L188-214; focused-message jump L227-243; viewport ResizeObserver L216-225; leftover `console.log` L169, L205, L435-440. No props — 17 store selectors (L36-52) + 25 context fields (L55-80).
- `_context/LiveChatContext.tsx` — 419 lines. Local useState L95-100: `wsStatus`, `typingUsersCount` (+ `typingUsersRef` L94), `onlineOperators`, `claimContenders`. Inline WS handlers in `useLiveChatSocket` call L196-308: `handleConnectionChange` L181-195, `onTyping` L214-220, `onSessionClaimed` L221-252, `onSessionClosed` L253-260, `onSessionTransferred` L261-269 (+ `handleSessionTransferred` L163-173), `onPresenceUpdate` L270, `onError` L271-305. 34-field context value memo L339-408.
- `_store/liveChatStore.ts` — 252 lines. Has core data + UI state; **lacks** `wsStatus`, `onlineOperators`, `claimContenders`, `typingUsersCount`.
- Guard tests: `_context/__tests__/LiveChatContext.contract.test.tsx` (contract), `LiveChatContextMemo.test.tsx`, `claimContention.test.tsx`, `conversationUpdate.test.ts`, `_store/__tests__/liveChatStore.test.ts`. No ChatArea unit test (e2e only: `e2e/live-chat-smoke.spec.ts`).

## Phase 1 — Store consolidation (lowest risk)

**Files:** `_store/liveChatStore.ts`, `_store/__tests__/liveChatStore.test.ts`

1. Add to store state: `wsStatus: ConnectionState` (init `'disconnected'`), `onlineOperators: OnlineOperator[]` (init `[]`), `claimContenders: Record<string, ClaimContender>` (init `{}`), `typingUsersCount: number` (init `0`).
2. Add actions: `setWsStatus`, `setOnlineOperators`, `setClaimContenders` (accepts updater or value, matching existing store action style), `setTypingUsersCount`.
3. Types (review F3): `ConnectionState` imports from `@/lib/websocket/types` (unchanged). `ClaimContender` is currently a PRIVATE interface in `LiveChatContext.tsx:30` — move it to `_types.ts` and export; context re-imports it. Alias `export type OnlineOperator = PresencePayload['operators'][number]` in `_types.ts` (context field type stays `PresencePayload['operators']`, i.e. `OnlineOperator[]`).
4. Unit tests: extend `liveChatStore.test.ts` with the 4 new fields/actions.

**Validation:** `vitest run app/admin/live-chat` green. No consumer changes yet (context still uses useState — switched in Phase 2).

## Phase 2 — Extract `useSessionEvents` + switch context to store state

**Files:** NEW `_hooks/useSessionEvents.ts`, `_context/LiveChatContext.tsx`

1. Create `useSessionEvents(deps)` returning the handler bundle consumed by `useLiveChatSocket`: `{ onConnectionChange, onTyping, onSessionClaimed, onSessionClosed, onSessionTransferred, onPresenceUpdate, onError }`.
   - Move logic verbatim from LiveChatContext L163-173, L181-195, L214-305.
   - `typingUsersRef` (Set) lives inside the hook; it writes `typingUsersCount` to the store.
   - Handlers write `wsStatus`/`onlineOperators`/`claimContenders` via store actions instead of setState.
   - **Review F1 (stale closure):** `onSessionClaimed` currently reads `onlineOperators` from closure (L231). After the move it must read presence at event time via `getStore().onlineOperators` — handlers READ from the store as well as write, so no handler recreates on presence churn and no stale roster is used for name resolution.
   - **Review F2 (wsStatusRef ordering):** `handleConnectionChange` reads `wsStatusRef.current` BEFORE writing the new status (the `wasOffline` check, L182) and relies on the ref being synced AFTERWARDS by the `useEffect` at L115-117. The sync effect moves into `useSessionEvents` (it owns the status write); keep read-ref → write-store → effect-syncs-ref ordering. Alternative (equivalent): set `wsStatusRef.current = status` inline after the `wasOffline` read and drop the effect — either way the wasOffline semantics must be preserved.
   - Dependencies passed in (not imported) where they are context-owned: `fetchConversations`, `selectedIdRef`, `wsStatusRef`, `currentUserId`, `playNotification` if needed. `getStore`/`mapWsErrorToThai`/`resolveOperatorName`/`removeKey` are module-level and can be imported directly by the hook.
2. In `LiveChatContext.tsx`: delete the 4 useState + inline handlers; read `wsStatus`, `onlineOperators`, `claimContenders`, `typingUsersCount` from the store (subscribe only to what the provider itself needs for the context value); pass hook's handler bundle to `useLiveChatSocket`.
3. Context value keeps the same 34 fields — values now sourced from store. `getClaimContender` stays a stable callback backed by store state.

**Validation:** contract + memo + claimContention + conversationUpdate tests green **without changing test expectations** (mock adjustments only if a test constructed provider-internal state directly). `tsc --noEmit` clean.

**Gotcha:** memo test asserts provider re-render behavior — moving state to Zustand changes which subscriptions trigger renders; provider must subscribe narrowly (per-field selectors) to keep memoization semantics.

**Test-setup note (review, minor):** contract + memo tests reset the singleton store in `beforeEach` — add the 4 new fields to those resets so cross-file leakage can't flip `wsStatus` etc. (counts as allowed mock/setup adjustment, not an expectation change).

## Phase 3 — Extract `useVirtualScroll` from ChatArea

**Files:** NEW `_hooks/useVirtualScroll.ts`, `_components/ChatArea.tsx`

1. Create `useVirtualScroll({ messages, selectedId, hasMoreHistory, isLoadingHistory, loadOlderMessages, focusedMessageId, clearFocusedMessage, reducedMotion })` returning (review F4 — API corrected to what ChatArea's render actually consumes):
   - `{ containerRef, sentinelRef, onScroll, virtualEnabled, visibleWindow: { startIndex, endIndex, topPadding, bottomPadding }, forceAllMessages, setForceAllMessages, baselineCount }`.
   - `onScroll` = the RAF-throttled scroll handler (L121-128); `baselineCount` = entrance-animation baseline used in render as `isNew={idx >= baselineCount}` (L478). NO `scrollToBottom` member — auto-scroll is effect-internal today and stays that way (verbatim move, no new API).
2. Move verbatim: constants L30-32, scrollTop/viewportHeight state, RAF throttle L120-131, near-bottom auto-scroll L160-178 (+ `pendingScrollToBottomRef`), double-rAF on selection change L188-214, ResizeObserver L216-225, focused-message jump L227-243, IO history paging L245-261, window computation L277-292, render-time baseline adjust L140-147.
3. Drop leftover `console.log` L169, L205, L435-440 (debug noise; behavior unchanged).
4. ChatArea keeps: render slice + spacers, sr-only "load all" escape hatch, all JSX/composition. Target ≤ ~320 lines.
5. NEW unit test `_hooks/__tests__/useVirtualScroll.test.tsx`: window bounds math (below/above threshold, overscan clamping), forceAllMessages escape hatch, history-sentinel guard conditions.

**Validation:** vitest green; `npm run build` passes.

## Phase 4 — Full verification + PR

1. Full local CI mirror (background per machine gotchas): `npm run lint` (0 project errors), `tsc --noEmit`, `node_modules/.bin/vitest run` (441+ green), `npm run build`.
2. Manual browser (dev stack): open `/admin/live-chat` — send message, scroll long history (paging + auto-scroll), claim/close/transfer session, presence roster, typing indicator, reconnect toast.
3. e2e smoke: `npm run test:e2e` (live-chat-smoke).
4. Commit per phase (3 commits), push, open PR, CI green, review round, merge with `--admin`.

## Scope boundary

- No changes to `useLiveChatSocket`, `useWebSocket`, `useMessageFlow`, `useConversationSync`, `useChatRoom`, `useLiveChatActions`, backend, or WS protocol.
- No virtualization redesign; windowing algorithm moves as-is.
- No apiFetch migration of `liveChatApi.ts` (future PR).

## Testing Strategy

- Existing context tests are the primary regression guard — pass unmodified.
- New: store field tests (Phase 1), `useVirtualScroll` unit tests (Phase 3).
- e2e live-chat smoke + manual browser pass before merge (frontend rule: verify in browser, not just tests).

## What This Does NOT Do

- Does not change any user-visible behavior, timing heuristics (100px near-bottom, 3s typing throttle), or Thai UI strings.
- Does not remove the fixed-row-height "safety net" virtualization or its 1500-message threshold.

## Implementation Notes (deviations from plan)

_(fill during implementation)_
