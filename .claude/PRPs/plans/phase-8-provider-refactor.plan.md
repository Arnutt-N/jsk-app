# Plan: Phase 8 — Provider Refactor (split LiveChatProvider into custom hooks)

---

## 🔄 REFRESH 2026-06-28 — re-review vs current code (3 ecc reviewers: architect + react + code-reviewer). APPLY BEFORE IMPLEMENTING — where these conflict with the original task bodies below, THESE WIN.

**Verdict (unanimous): NEEDS-REFRESH-THEN-GO.** The architecture (4-hook split + single `useLiveChatSocket` call kept in the provider as the composition seam) is still sound. The deltas below are content/count/scope drift from Phases 1/5/6/7 — `LiveChatContext.tsx` is now **~874 lines** (plan was written at 803). Re-locate everything by SYMBOL, not the plan's line numbers.

### BLOCKERS (reflect before Task 0)
- **B-R1 — Contract = 34 keys, NOT 31, and there is NO `state` member.** Phase 1/M3 removed the dead `state`; Phase 6 added `currentUserId`, `onlineOperators`, `claimContenders`, `getClaimContender`. Delete every "31 keys" and the "`state` has 21 keys" assertion (errata B7's "~30" is ALSO stale → it's 34). Task 0 must assert exactly these 34 (capture live from the `value` useMemo): `wsStatus, isMobileView, typingUsersCount, focusedMessageId, isHumanMode, selectedConversation, currentUserId, onlineOperators, claimContenders, getClaimContender, setSearchQuery, setFilterStatus, setInputText, setShowCustomerPanel, setActiveActionMenu, setShowTransferDialog, setShowCannedPicker, setSoundEnabled, selectConversation, jumpToMessage, clearFocusedMessage, fetchConversations, fetchChatDetail, sendMessage, sendMedia, claimSession, closeSession, transferSession, toggleMode, loadOlderMessages, reconnect, retryMessage, startTyping, formatTime`.
- **B-R2 — No `state` memo / no "21 subscriptions".** Provider now subscribes only 4 store slices (`conversations, selectedId, currentChat, messages`) + derives `selectedConversation` (memo) + `isHumanMode`. Strike all "21 selectors / keep the state memo" text from Summary, the Subscription-block pattern, Task 5, Task 6.
- **B-R3 — `value` is ALREADY `useMemo`-wrapped** (Phase 1 H3) with a 34-dep array. Task 6 = PRESERVE the memo and rebuild its 34 deps from hook returns. Drop the "check if memoized / don't add memo" branch — it's done.

### HIGH (resolve while writing the hooks)
- **H-R1 — Phase 6 presence + claim-contention is a 5th responsibility the plan ignores → KEEP IT IN THE PROVIDER** (socket-coupled + cross-cutting; consistent with "socket stays in provider"). Provider-owned: state `onlineOperators`/`claimContenders`/`currentUserId` + `getClaimContender` useCallback + socket callbacks `onPresenceUpdate` (sets onlineOperators) + `onError` (claim-conflict → `setClaiming(false)` + `addNotification`) + contender logic inside `onSessionClaimed`/`onSessionClosed`/`onSessionTransferred` (uses `resolveOperatorName` + `removeKey`). Task 4's "small inline onTyping/onConnectionChange/onSession* block" is NOT small — enumerate all of the above when reassembling the socket config.
- **H-R2 — `API_BASE` already lives in `_lib/constants.ts`** → Task 2 IMPORTS it (`from '../_lib/constants'`); do not move/redefine.
- **H-R3 — Three Phase-6 exported pure helpers must also move to `liveChatApi.ts`:** `reorderConversationsToTop`, `resolveOperatorName`, `removeKey` (alongside `mergeSession`/`mergeConversationUpdate`/`readErrorMessage`). ⚠ `reorderConversationsToTop` is imported by `_context/__tests__/conversationUpdate.test.ts` → either re-export it from `LiveChatContext` OR update that test's import. ("0 consumer changes" = the 4 UI components, NOT this test.)
- **H-R4 — Export/move the `ClaimContender` interface** (currently ≈ top of provider) so the socket config / `useChatRoom` can type contenders — put in `_types.ts` or export from the provider.
- **H-R5 — New `wsStatusRef` sync effect** (`useEffect(() => { wsStatusRef.current = wsStatus }, [wsStatus])`) must STAY in the provider — add to Task 6 keep-list (without it, callbacks read a frozen ws status).

### MEDIUM
- **M-R1 — Split the combined ref-sync effect** (`selectedIdRef.current = selectedId; messagesRef.current = messages` in ONE effect): delete it; `messagesRef` sync → `useMessageFlow`, `selectedIdRef` sync stays in provider. Keep both as PURE ref-sync (no setState — React-Compiler `set-state-in-effect`).
- **M-R2 — Cross-apply errata B6 + B7** (not in the plan body): B6 = 3 ack-timeout race cases in `useMessageFlow.test.tsx` (late-ack must-not-resurrect / retry new-tempId no-dup-bubble / HTTP fallback stays `Promise.all` parallel — don't revert Phase 5 L9.3); B7 = assert by member+type, count = 34.
- **M-R3 — Inject `fetchMessagesPage` into `useChatRoom`** (its selected-id load effect uses both `fetchChatDetail` + `fetchMessagesPage`).
- **M-R4 — Branch note stale:** we are ON `docs/livechat-audit-remediation-prp` (Phases 1–7 committed, unmerged, no PR) — do NOT "branch off main"; continue on this branch, one-task-per-commit.
- **M-R5 — Reuse existing Task-0 scaffolding:** `LiveChatContextMemo.test.tsx` + `claimContention.test.tsx` already render the provider with a `matchMedia` stub + `useLiveChatSocket` mock — extend, don't rebuild (and `LiveChatContextMemo.test.tsx` may need updating after the split).

### LOW
- **L-R1 — React-Compiler guards:** do NOT `useCallback`-wrap `onConnectionChange` (closes over `wsStatus` for `wasOffline` — keep inline). Ack-timeout `getStore()`-in-setTimeout is safe. `typingUsersRef` mutation in `onTyping` is an event callback (safe).
- **L-R2 — Line refs ~+30–70 off**; every symbol still findable → symbol-relative.
- **L-R3 — File-size target:** with presence/contention + socket config + 34-dep memo staying in the provider, target provider **< 400** (< 300 is aspirational); each hook < 400.

---

## Summary

`LiveChatContext.tsx` is an 803-line god-component (`LiveChatProvider`) that owns *everything*: 21 Zustand store subscriptions, a media-query effect, every API method (fetch/send/claim/close/transfer/toggle/history), every WebSocket handler (`onNewMessage`, `onMessageSent`, `onMessageAck`, `onMessageFailed`, `onTyping`, `onSessionClaimed`, `onSessionClosed`, `onSessionTransferred`, `onConversationUpdate`, `onConnectionChange`), the optimistic-send + 10s ack-timeout flow, room join/leave lifecycle, polling fallbacks, and the assembly of the context `value`. This phase extracts four focused custom hooks — `useMediaQuery`, `useConversationSync`, `useMessageFlow`, `useChatRoom` — so the provider becomes a thin composition root under 400 lines and each hook file is under 400 lines. **No behavior changes.** This is a pure mechanical refactor: move code into hooks, wire them back together, verify every flow still works identically.

## User Story

As a developer maintaining the live-chat console, I want the provider split into focused, testable hooks, so that I can change message-send logic without scrolling past room-join logic, reason about one responsibility at a time, and add unit tests to the extracted pieces — without any operator-visible behavior change.

## Problem → Solution

| Problem | Solution |
|---------|----------|
| `LiveChatProvider` is 803 lines — single file owns 5 unrelated responsibilities | Extract 4 hooks by responsibility; provider becomes composition root |
| Hard to test send/ack-timeout in isolation (buried in 800-line component) | `useMessageFlow` becomes an independently importable hook |
| WS handlers + API methods + effects interleaved → high cognitive load | Each hook co-locates its handlers, effects, and methods |
| Any future edit risks touching unrelated flows | File ownership per responsibility; smaller diff surface |

The architecture (Zustand store + thin Context that exposes methods/non-store state) is **already proven correct** by Phases 1–6. We are NOT changing that architecture — we are decomposing one oversized file inside it. Components already read most *state* directly from `useLiveChatStore` and only pull *methods* + non-store values (`wsStatus`, `isMobileView`, `typingUsersCount`, `focusedMessageId`, `isHumanMode`, `selectedConversation`) from `useLiveChatContext()`. That public contract MUST be preserved byte-for-byte.

## Metadata

- **Complexity**: Large (mechanical but high blast-radius; 1 god-file → 5 files; touches the most critical real-time surface)
- **Source PRD**: `D:/genAI/jsk-app/.claude/PRPs/prds/livechat-audit-remediation.prd.md`
- **PRD Phase**: Phase 8 — Provider Refactor (depends on Phase 6)
- **Estimated Files**: 5 created (4 hooks + 1 barrel/types helper optional), 1 heavily rewritten (`LiveChatContext.tsx`), 0 consumer changes (contract preserved). Test files: 2–3 new.

## UX Design

N/A — internal refactor. Zero visual or interaction change. Acceptance is defined by behavioral parity, not new UX.

## Mandatory Reading

| Priority | File | Lines | Why |
|----------|------|-------|-----|
| P0 | `frontend/app/admin/live-chat/_context/LiveChatContext.tsx` | 1–803 (whole) | The file being split. Every line moves or stays — read all of it. |
| P0 | `frontend/app/admin/live-chat/_context/LiveChatContext.tsx` | 49–81 | `LiveChatContextValue` interface = the public contract that MUST NOT change |
| P0 | `frontend/app/admin/live-chat/_store/liveChatStore.ts` | 1–207 | Source of truth for state + actions. Hooks must call `getStore()`/`store(selector)` exactly as today. |
| P0 | `frontend/hooks/useLiveChatSocket.ts` | 20–52, 60–78, 259–273 | `useLiveChatSocket` options (all the `onX` callbacks) + return shape consumed by `useChatRoom`/`useMessageFlow` |
| P1 | `frontend/app/admin/live-chat/_components/ChatArea.tsx` | 26–65 | Largest consumer — destructures 18 context members. Verify all still resolve. |
| P1 | `frontend/app/admin/live-chat/_components/LiveChatShell.tsx` | 13–28 | Consumes `isMobileView, fetchConversations, setShowTransferDialog, transferSession, setShowCustomerPanel` |
| P1 | `frontend/app/admin/live-chat/_components/ConversationList.tsx` | 23–36 | Consumes `formatTime, selectConversation, jumpToMessage, fetchConversations` |
| P1 | `frontend/app/admin/live-chat/_components/CustomerPanel.tsx` | 12–20 | Consumes `fetchChatDetail, fetchConversations` |
| P1 | `frontend/app/admin/live-chat/_types.ts` | 1–34 | `Session`, `Conversation`, `CurrentChat` types used by merge helpers |
| P2 | `frontend/app/admin/live-chat/page.tsx` | 1–31 | Confirms `LiveChatProvider` mount point + Suspense wrapper (uses `useSearchParams`) |
| P2 | `frontend/app/admin/live-chat/_hooks/useConversations.ts` | 1–25 | Existing hook naming/style convention to mirror (`'use client'`, named export) |
| P2 | `frontend/hooks/__tests__/useGuardedUpdate.test.tsx` | 1–45 | Test structure to mirror (renderHook, controllable promise, vi.fn) |
| P2 | `frontend/vitest.config.ts` | whole | Test placement: `<dir>/__tests__/*.test.{ts,tsx}`, jsdom, globals |

## Patterns to Mirror

### Naming + `'use client'` hook convention

```ts
// SOURCE: frontend/app/admin/live-chat/_hooks/useConversations.ts:1-6
'use client';

import type { Conversation } from '../_types';

export function useConversations(conversations: Conversation[], query: string) {
```

Every new hook lives in `frontend/app/admin/live-chat/_hooks/`, starts with `'use client';`, uses a named `export function useX(...)`, and a `use` camelCase prefix. New hooks are deeper than the existing two (they own effects + refs), but the file-level convention is identical.

### Store access — never re-implement, mirror exactly

```ts
// SOURCE: frontend/app/admin/live-chat/_context/LiveChatContext.tsx:86-87
// Helper to get current store state without subscribing
const getStore = () => useLiveChatStore.getState();
```

`getStore()` (non-subscribing, for use inside callbacks/effects) and `store((s) => s.x)` (subscribing, for reactive values) are the two access modes. **When code moves to a hook, copy the access mode unchanged.** Do NOT convert a `getStore()` call into a subscription or vice-versa — that silently changes render behavior.

### Subscription block (moves into `useConversationSync` reactive returns)

```ts
// SOURCE: frontend/app/admin/live-chat/_context/LiveChatContext.tsx:140-163
const store = useLiveChatStore;
const conversations = store((s) => s.conversations);
const selectedId = store((s) => s.selectedId);
// ...21 selectors total ending at isLoadingHistory
```

These 21 selectors feed the memoized `state` object (731–757). The provider still needs them to build `state`, so the *subscriptions* stay in the provider (or a tiny `useChatState()` helper), but the methods that *act* on them move into the responsibility hooks.

### Error handling pattern (stays with the API methods that move)

```ts
// SOURCE: frontend/app/admin/live-chat/_context/LiveChatContext.tsx:116-137
const readErrorMessage = async (response: Response, fallbackMessage: string): Promise<string> => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const payload = await response.clone().json();
      if (typeof payload?.detail === 'string' && payload.detail.trim()) return payload.detail;
      // ...
    } catch { /* fall through */ }
  }
  // ...
  return fallbackMessage;
};
```

`readErrorMessage` is used by `claimSession`/`closeSession`/`transferSession`. Those methods move to `useChatRoom`, so `readErrorMessage` moves with them (or into a shared `_hooks/liveChatApi.ts` helper module). Keep the function body identical.

### Optimistic send + ack-timeout (the heart of `useMessageFlow`)

```ts
// SOURCE: frontend/app/admin/live-chat/_context/LiveChatContext.tsx:533-547
if (wsStatusRef.current === 'connected') {
  wsSendMessage(text, tempId);
  // Fallback: fail the optimistic message if the WS ack never arrives.
  setTimeout(() => {
    const store = getStore();
    if (store.pendingMessages.has(tempId)) {
      store.removePending(tempId);
      store.setFailed(tempId, 'Message acknowledgment timed out');
    }
    if (store.sending) { store.setSending(false); }
  }, 10000);
  return;
}
```

This 10000ms magic number and the WS-vs-HTTP branch are load-bearing. Preserve exactly. (Optionally extract `const ACK_TIMEOUT_MS = 10000;` as a named constant per coding-style — but keep the value.)

### Test structure to mirror

```ts
// SOURCE: frontend/hooks/__tests__/useGuardedUpdate.test.tsx:1-3,37-43
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useGuardedUpdate } from '../useGuardedUpdate'

describe('useGuardedUpdate', () => {
  it('starts with submitting=false', () => {
    const updateFn = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useGuardedUpdate(updateFn))
    // ...
  })
```

Use `renderHook` + `vi.useFakeTimers()` for the ack-timeout test, mock `useLiveChatStore` / `fetch`, controllable promises for in-flight windows.

## Files to Change

| File | Action | Justification |
|------|--------|---------------|
| `frontend/app/admin/live-chat/_hooks/useMediaQuery.ts` | CREATE | Extract `isMobileView` matchMedia effect (lines 176, 180–187). Smallest, zero-dependency → extract first to de-risk. |
| `frontend/app/admin/live-chat/_hooks/liveChatApi.ts` | CREATE | Shared pure helpers + fetch wrappers: `readErrorMessage`, `mergeSession`, `mergeConversationUpdate`, `API_BASE`. Imported by sync/message/room hooks to avoid duplication (DRY). |
| `frontend/app/admin/live-chat/_hooks/useConversationSync.ts` | CREATE | Conversation list fetch + `handleConversationUpdate` + polling fallback + `selectConversation`/`jumpToMessage` + initial chat-id-from-URL effect. |
| `frontend/app/admin/live-chat/_hooks/useMessageFlow.ts` | CREATE | `sendMessage` (optimistic + ack-timeout), `sendMedia`, `retryMessage`, `loadOlderMessages`, `handleNewMessage`, `handleMessageSent`, `handleMessageAck`, message-failed handler. |
| `frontend/app/admin/live-chat/_hooks/useChatRoom.ts` | CREATE | `joinRoom`/`leaveRoom` lifecycle effect, `claimSession`, `closeSession`, `transferSession`, `toggleMode`, session WS handlers (claimed/closed/transferred), `useLiveChatSocket` wiring. |
| `frontend/app/admin/live-chat/_context/LiveChatContext.tsx` | UPDATE | Becomes thin composition root: keep `LiveChatContext`, `LiveChatContextValue`, `useLiveChatContext`, the 21 store subscriptions feeding `state`, and assemble `value` from the hooks. Target < 300 lines. |
| `frontend/app/admin/live-chat/_hooks/__tests__/useMediaQuery.test.tsx` | CREATE | Unit test for matchMedia behavior |
| `frontend/app/admin/live-chat/_hooks/__tests__/useMessageFlow.test.tsx` | CREATE | Unit test for ack-timeout + optimistic send |
| `frontend/app/admin/live-chat/_context/__tests__/LiveChatContext.contract.test.tsx` | CREATE | Asserts `value` exposes all 31 contract members (guards against accidental drops) |

## NOT Building

- **No architecture change**: Zustand store stays the source of truth; Context still only exposes methods + non-store values. No migration to a new state library, no removal of the Context layer.
- **No behavior change**: no new error messages, no changed timeouts, no changed polling intervals (5000ms conv poll, 3000ms detail poll, 10000ms ack timeout all preserved), no new notifications.
- **No consumer refactor**: `ChatArea`, `ConversationList`, `CustomerPanel`, `LiveChatShell` are NOT edited. If a consumer needs editing, the contract was broken — stop and fix the hook instead.
- **No new features** from other phases (presence picker UX, waiting-time badge, etc. — those are Phase 6/7 and assumed already merged).
- **No `ChatState` interface deletion** — that was Phase 1 (M3). If still present, leave it; do not bundle that change here.
- **No splitting of `useLiveChatSocket.ts`** itself — it is already a separate, reasonably-sized hook. Out of scope.

## Step-by-Step Tasks

> **Golden rule for the whole phase:** after EACH task, run `npx tsc --noEmit` and `npx vitest run`, then manually exercise the 7 flows (receive message, send message, claim, transfer, close, reconnect, typing). Commit per task. One hook at a time — never two in one commit.

---

### Task 0 — Pre-flight: capture the contract baseline

- **ACTION**: Establish a parity reference before moving any code.
- **IMPLEMENT**:
  1. Copy the `LiveChatContextValue` interface (LiveChatContext.tsx:49–81) into a comment block in the new test file `LiveChatContext.contract.test.tsx`.
  2. Write a test that renders `LiveChatProvider` (wrapped in the providers it needs — see GOTCHA) and asserts `useLiveChatContext()` returns an object whose keys === the 31 expected keys: `state, wsStatus, isMobileView, typingUsersCount, focusedMessageId, isHumanMode, selectedConversation, setSearchQuery, setFilterStatus, setInputText, setShowCustomerPanel, setActiveActionMenu, setShowTransferDialog, setShowCannedPicker, setSoundEnabled, selectConversation, jumpToMessage, clearFocusedMessage, fetchConversations, fetchChatDetail, sendMessage, sendMedia, claimSession, closeSession, transferSession, toggleMode, loadOlderMessages, reconnect, retryMessage, startTyping, formatTime`.
- **MIRROR**: `frontend/hooks/__tests__/useGuardedUpdate.test.tsx:1-43` (renderHook + vi).
- **IMPORTS**: `renderHook` from `@testing-library/react`; mock `@/contexts/AuthContext`, `@/hooks/useLiveChatSocket`, `@/hooks/useNotificationSound`, `next/navigation` (`useSearchParams`).
- **GOTCHA**: The provider calls `useAuth()`, `useLiveChatSocket()`, `useNotificationSound()`, `useSearchParams()`, and `window.matchMedia`. In jsdom `matchMedia` is undefined unless polyfilled — add a `matchMedia` stub in the test (or `vitest.setup.ts`) before render. Mock `useLiveChatSocket` to return the full `UseLiveChatSocketReturn` shape (see useLiveChatSocket.ts:39–52) so destructuring at LiveChatContext.tsx:369–380 doesn't throw.
- **VALIDATE**: `npx vitest run app/admin/live-chat/_context/__tests__/LiveChatContext.contract.test.tsx` → PASS (green BEFORE refactor; this is the regression net). EXPECT: 31 keys present.

---

### Task 1 — Extract `useMediaQuery` (isMobileView)

- **ACTION**: Move the matchMedia logic out first — it is the only fully self-contained, zero-store-coupling piece. Lowest risk.
- **IMPLEMENT**:
  - Create `_hooks/useMediaQuery.ts`:
    ```ts
    'use client';
    import { useEffect, useState } from 'react';

    export function useMediaQuery(query: string): boolean {
      const [matches, setMatches] = useState(false);
      useEffect(() => {
        if (typeof window === 'undefined') return;
        const mediaQuery = window.matchMedia(query);
        const update = () => setMatches(mediaQuery.matches);
        update();
        mediaQuery.addEventListener('change', update);
        return () => mediaQuery.removeEventListener('change', update);
      }, [query]);
      return matches;
    }
    ```
  - In `LiveChatContext.tsx`: delete the `isMobileView` state (line 176) and its effect (180–187); replace with `const isMobileView = useMediaQuery('(max-width: 767px)');`.
- **MIRROR**: original effect at LiveChatContext.tsx:180–187 (behavior must match: initial sync `update()`, `change` listener, cleanup).
- **IMPORTS**: add `import { useMediaQuery } from '../_hooks/useMediaQuery';` to the provider.
- **GOTCHA**: Original used `React.useState`; new hook uses bare `useState` import — fine. Preserve the exact query string `'(max-width: 767px)'` (LiveChatContext.tsx:182). Initial value `false` matches original (line 176).
- **VALIDATE**: `npx tsc --noEmit` (PASS) → `npx vitest run` (contract test still green) → manual: resize below 767px, drawer/mobile layout toggles as before.

---

### Task 2 — Extract shared API helpers into `liveChatApi.ts`

- **ACTION**: Centralize the pure helpers so the three remaining hooks import them instead of duplicating (DRY) — do this before the big hooks so they can import cleanly.
- **IMPLEMENT**:
  - Create `_hooks/liveChatApi.ts` and move VERBATIM: `API_BASE` (line 84), `mergeSession` (89–97), `mergeConversationUpdate` (99–114), `readErrorMessage` (116–137). Export all four.
  - These are module-level pure functions (no React) — they move with zero change.
  - In `LiveChatContext.tsx`: delete the originals, import what the provider still references directly (likely none after the hooks take them; but keep import if any inline use remains).
- **MIRROR**: LiveChatContext.tsx:84, 89–137 (copy exactly).
- **IMPORTS**: `import type { ConversationUpdatePayload } from '@/lib/websocket/types';` and `import type { CurrentChat, Session } from '../_types';` (these are the types referenced by the helpers — see LiveChatContext.tsx:16–23).
- **GOTCHA**: `mergeConversationUpdate` references `CurrentChat`/`ConversationUpdatePayload`; `mergeSession` references `Session`. Bring those type imports along. `getStore` (line 87) is React-store-coupled — do NOT move it here; it stays a per-hook local or a shared store-helper, but `liveChatApi.ts` should remain framework-pure.
- **VALIDATE**: `npx tsc --noEmit` (PASS, no unresolved refs) → `npx vitest run` (green). No runtime change — pure move.

---

### Task 3 — Extract `useMessageFlow` (message send / optimistic / retry / ack-timeout)

- **ACTION**: Move all message-lifecycle logic into one hook. This maps the PRD finding "message send/optimistic/retry/ack-timeout".
- **IMPLEMENT**: Create `_hooks/useMessageFlow.ts` exporting `useMessageFlow(deps)`. Move:
  - `handleMessageAck` (283–286), `handleNewMessage` (288–310), `handleMessageSent` (312–317).
  - `sendMessage` (514–566) including the `ACK_TIMEOUT_MS = 10000` fallback (533–547).
  - `sendMedia` (568–587), `loadOlderMessages` (693–710), `fetchMessagesPage` (274–281).
  - The message-failed callback body (388–390) — expose it so `useChatRoom` can pass it into `useLiveChatSocket`.
  - The `messagesRef` (line 170) + its sync effect (189–192, the `messagesRef.current = messages` half) belong here since only message logic reads it. (Keep `selectedIdRef` shared — see GOTCHA.)
  - Hook signature (inject what it cannot own):
    ```ts
    export function useMessageFlow(params: {
      selectedIdRef: React.RefObject<string | null>;
      wsStatusRef: React.RefObject<ConnectionState>;
      wsSendMessage: (text: string, tempId?: string) => void;
      playNotification: () => void;
      userDisplayName?: string;
      fetchChatDetail: (id: string, includeMessages?: boolean) => Promise<void>;
      fetchConversations: () => Promise<void>;
    }) { ... return { sendMessage, sendMedia, retryMessage, loadOlderMessages, handleNewMessage, handleMessageSent, handleMessageAck, handleMessageFailed, fetchMessagesPage }; }
    ```
- **MIRROR**: optimistic-send pattern at LiveChatContext.tsx:514–566; ack-timeout at 533–547.
- **IMPORTS**: `useCallback, useEffect, useRef` from react; `getStore`-equivalent (`useLiveChatStore.getState()`); `Message, ConnectionState` from `@/lib/websocket/types`; `API_BASE` from `../_hooks/liveChatApi`.
- **GOTCHA**:
  - `retryMessage` from `useLiveChatSocket` is just re-exported (LiveChatContext.tsx:379) — pass it through, do not reimplement.
  - `sendMessage` reads `getStore().selectedId` (line 516) and uses `user?.display_name` (526) → inject `userDisplayName`.
  - The 10000ms timeout and the `pendingMessages.has(tempId)` re-check are load-bearing — copy verbatim.
  - `handleNewMessage` dedupes by `m.id === message.id || temp_id` (303) and only adds notification when `line_user_id !== selectedIdRef.current` (292) — preserve exactly; this is the "receive message" flow.
  - `handleMessageSent` calls `handleNewMessage` then acks then `setSending(false)` + `setInputText('')` (312–317) — keep the order.
- **VALIDATE**: `npx tsc --noEmit` → `npx vitest run` → write `useMessageFlow.test.tsx`: (a) optimistic message added + pending set on send; (b) with fake timers, after 10000ms with no ack → `setFailed('...timed out')` + `setSending(false)`; (c) HTTP fallback path when `wsStatusRef !== 'connected'`. Manual: send via WS (ack clears pending), send while disconnected (HTTP path), retry a failed message.

---

### Task 4 — Extract `useChatRoom` (join/leave/claim/close/transfer + room state + session WS handlers)

- **ACTION**: Move room lifecycle + session actions + the `useLiveChatSocket` wiring into one hook. Maps PRD finding "join/leave/claim/close/transfer + room state". This is the largest extraction; `useLiveChatSocket` is configured here because most of its callbacks are session/room concerns.
- **IMPLEMENT**: Create `_hooks/useChatRoom.ts` exporting `useChatRoom(params)`. Move:
  - `handleSessionTransferred` (356–366); the `useLiveChatSocket({...})` call (369–445) — but its `onNewMessage/onMessageSent/onMessageAck/onMessageFailed` come from `useMessageFlow` (inject), and `onConversationUpdate` comes from `useConversationSync` (inject), and `onTyping`/`onConnectionChange` set typing/ws state (inject setters or keep in provider — see GOTCHA).
  - room join/leave effect (499–503), detail-poll effect (505–512), the selected-id load effect (487–497).
  - `claimSession` (589–612), `closeSession` (614–634), `transferSession` (636–680), `toggleMode` (682–691).
  - `refreshConversationState` (269–272), `fetchChatDetail` (251–267).
  - Returns: `{ joinRoom, leaveRoom, claimSession, closeSession, transferSession, toggleMode, fetchChatDetail, refreshConversationState, reconnect, retryMessage, startTyping, wsSendMessage, wsConnected, wsStatus, typingUsersCount, isConnected }` (the pieces the provider/other hooks need).
- **MIRROR**: claim/close error handling at LiveChatContext.tsx:589–634 (uses `readErrorMessage`); transfer WS-first-then-HTTP at 636–680.
- **IMPORTS**: `readErrorMessage` from `../_hooks/liveChatApi`; `useLiveChatSocket` from `@/hooks/useLiveChatSocket`; refs (`selectedIdRef`, `wsStatusRef`) injected; `SessionTransferredPayload, ConnectionState` types.
- **GOTCHA**:
  - **Ordering problem**: `useLiveChatSocket` needs message handlers (from `useMessageFlow`) AND conversation handler (from `useConversationSync`) AND its return (`wsSendMessage`) feeds back into `useMessageFlow`. Break the cycle by hoisting `useLiveChatSocket` into `useChatRoom` and passing the message/conversation handlers IN as params; `useMessageFlow` must be called BEFORE `useChatRoom` in the provider so its handlers exist, and `wsSendMessage` is then passed from `useChatRoom`'s return back... which is circular. **Resolution**: pass `wsSendMessage` to `useMessageFlow` via a ref (a `wsSendMessageRef` the provider owns and `useChatRoom` populates), OR keep `useLiveChatSocket` call in the **provider** and pass its outputs down to both hooks. **Recommended: keep the single `useLiveChatSocket({...})` call in the provider** (it is the natural composition seam), build its config object from handlers returned by `useMessageFlow` + `useConversationSync` + a small inline `onTyping/onConnectionChange/onSession*` block, and pass `joinRoom/leaveRoom/wsSendMessage/...` down. Then `useChatRoom` owns only the *effects* (join/leave/poll/load) and the *action methods* (claim/close/transfer/toggle), receiving ws functions as params. Document this seam in a header comment.
  - `transferSession` WS-first: tries `wsTransferSession` (returns boolean dispatched); only HTTP-fallbacks if not dispatched (640–647). Preserve.
  - `onConnectionChange` reads `wsStatus` to compute `wasOffline` (432) then `setWsStatus` — keep `wsStatus` state in the provider (it is non-store context value) and pass setter.
  - Typing: `typingUsersRef` (174) + `setTypingUsersCount` (177) — the `onTyping` handler (391–397) mutates a Set ref and sets count. Keep this with the socket config block.
- **VALIDATE**: `npx tsc --noEmit` → `npx vitest run` → manual ALL session flows: claim (WS + HTTP fallback), close (WS + HTTP), transfer (WS dispatched + HTTP fallback + error notification), toggleMode, join on select / leave on deselect, reconnect banner.

---

### Task 5 — Extract `useConversationSync` (list + conversation_update handling)

- **ACTION**: Move conversation-list fetching, the `conversation_update` WS handler, polling fallback, and selection/URL logic. Maps PRD finding "conversation list + WS conversation_update handling".
- **IMPLEMENT**: Create `_hooks/useConversationSync.ts` exporting `useConversationSync(params)`. Move:
  - `fetchConversations` (233–249), `handleConversationUpdate` (319–354).
  - conv-poll effect (479–485, 5000ms, skips when ws connected), initial-chat-from-URL effect (471–477).
  - `selectConversation` (447–460), `jumpToMessage` (462–465), `clearFocusedMessage` (467–469), `focusedMessageId` state (178).
  - `selectedConversation` memo (712–714).
  - Returns `{ fetchConversations, handleConversationUpdate, selectConversation, jumpToMessage, clearFocusedMessage, focusedMessageId, selectedConversation }`.
- **MIRROR**: `handleConversationUpdate` reorder-to-top logic at LiveChatContext.tsx:319–354 (splice + unshift, unread accounting).
- **IMPORTS**: `useCallback, useEffect, useMemo, useState` ; `mergeConversationUpdate, API_BASE` from `../_hooks/liveChatApi`; `useSearchParams` from `next/navigation`; `ConversationUpdatePayload` type.
- **GOTCHA**:
  - `handleConversationUpdate` unread logic (324–329): if `data.unread_count` is a number use it, else if not selected increment. Preserve exactly — this drives the unread badge.
  - `selectConversation` does `window.history.replaceState` (450, 456) and zeroes unread (451–454). Preserve URL side-effects.
  - The conv-poll effect reads `wsStatusRef.current` (482) → inject `wsStatusRef`.
  - `selectedConversation` memo depends on `conversations` + `selectedId` subscriptions which the provider owns — either subscribe inside this hook (`useLiveChatStore((s)=>s.conversations)`) or pass them in. **Subscribe inside** to keep the hook self-contained (matches existing `useConversations` style).
  - The initial-URL effect uses `initializedRef` (173) guard — bring the ref into this hook.
- **VALIDATE**: `npx tsc --noEmit` → `npx vitest run` → manual: incoming `conversation_update` moves convo to top + bumps unread; selecting clears unread + updates URL `?chat=`; deep-link `?chat=U...` selects on load; poll fallback fetches list when WS down.

---

### Task 6 — Rewrite `LiveChatContext.tsx` as composition root

- **ACTION**: Reduce the provider to: imports, the `LiveChatContextValue` interface (unchanged), the 21 store subscriptions that build `state`, the `wsStatus`/`typingUsersCount` non-store state, the four hook calls, the single `useLiveChatSocket` config, the `formatTime` util, the `state` memo, the `value` object, and `useLiveChatContext`.
- **IMPLEMENT**:
  - Order the hook calls to satisfy data flow: `useMediaQuery` → `useConversationSync` → `useMessageFlow` → build `useLiveChatSocket` config from their handlers → pass `joinRoom/wsSendMessage/...` into `useChatRoom`/`useMessageFlow` as needed (per Task 4 GOTCHA, socket lives here).
  - Keep `formatTime` (718–728) in the provider (tiny, presentation util) OR move to `liveChatApi.ts` as a pure fn — either is fine; if moved, import it.
  - Reassemble `value` (759–791) with EXACTLY the same 31 keys, sourced from the hooks.
  - Keep the `state` memo (731–757) and its 21-dep array unchanged.
- **MIRROR**: the `value` object shape at LiveChatContext.tsx:759–791 (do not add/remove keys).
- **IMPORTS**: the four new hooks from `../_hooks/*`; keep `useAuth`, `useNotificationSound`, `useLiveChatSocket`, store, types.
- **GOTCHA**:
  - `value` is currently NOT memoized (759 is a plain object literal — this is the H3 finding that Phase 1 was meant to fix). **Check whether Phase 1 already wrapped `value` in `useMemo`.** If Phase 1 memoized it, preserve that memo and its deps. If not, do NOT introduce the memo here (that is H3/Phase 1 scope, not Phase 8) — keep behavior identical to current `main`. Confirm by reading the file at implementation time.
  - `adminId = user?.id || '1'` (368) must stay.
  - The `wsStatusRef`/`selectedIdRef`/`messagesRef`/`firstLoadRef` refs (169–173): decide ownership — `selectedIdRef` + `wsStatusRef` are shared across hooks, so keep them in the provider and pass down; `messagesRef` → `useMessageFlow`; `initializedRef`/`firstLoadRef` → the hook that uses them. Document each ref's owner.
- **VALIDATE**: `npx tsc --noEmit` (PASS) → `npx eslint` the 6 files (no errors) → `npx vitest run` (contract test green: 31 keys) → `npm run build` (PASS) → full manual 7-flow pass.

---

### Task 7 — Verify file sizes + final regression

- **ACTION**: Confirm the goal (each file < 400 lines) and run the full validation matrix.
- **IMPLEMENT**: `wc -l` each of the 5 new/changed files; if any exceeds 400, split further (e.g., move `fetchMessagesPage` + history into a sub-helper). Run full CI-equivalent locally (Actions are disabled per project memory).
- **VALIDATE**: see Validation Commands. EXPECT all green; provider < 300 lines, each hook < 400.

## Testing Strategy

### Unit test table

| Test file | Target | Cases |
|-----------|--------|-------|
| `_context/__tests__/LiveChatContext.contract.test.tsx` | provider value shape | 31 keys present; each method is a function; `state` has 21 keys |
| `_hooks/__tests__/useMediaQuery.test.tsx` | `useMediaQuery` | returns false initially (no match); flips on `change` event; cleans up listener on unmount |
| `_hooks/__tests__/useMessageFlow.test.tsx` | `useMessageFlow` | optimistic add + pending on WS send; ack-timeout (fake timers, 10000ms) → failed + sending=false; HTTP fallback when disconnected; `handleNewMessage` dedupe by id/temp_id; no-op when no `selectedId` |

> Hooks that are heavily effect/WS-coupled (`useChatRoom`, `useConversationSync`) are verified primarily by the contract test + manual 7-flow walkthrough + existing Playwright smoke, per PRD: "ไม่ทำ unit-test coverage ใหม่ทั้งหน้า — เพิ่มเทสเฉพาะจุดที่แก้ logic". The mechanical-move nature means the contract test is the main regression net.

### Edge-case checklist (manual, run after every task)

- [ ] **Receive message**: incoming WS message into selected room appends; into non-selected room → toast + unread bump, no append
- [ ] **Send message (WS)**: optimistic bubble → ack clears pending → input cleared
- [ ] **Send message (WS, no ack)**: after 10s → message marked failed, sending released
- [ ] **Send message (HTTP fallback)**: disconnected → POST → detail+list refetch
- [ ] **Retry**: failed message retry re-sends via socket
- [ ] **Claim**: WS path + HTTP fallback + error notification on 4xx
- [ ] **Transfer**: WS dispatched path + HTTP fallback + error notification + success toast
- [ ] **Close**: WS + HTTP; chat_mode reverts to BOT
- [ ] **Reconnect**: banner shows on disconnect; "Connected" toast on restore (only if was offline)
- [ ] **Typing**: typing indicator count updates from `onTyping`
- [ ] **Select / deselect**: join on select, leave on deselect, URL `?chat=` updates, unread zeroes
- [ ] **Deep link**: load with `?chat=U...` selects that conversation
- [ ] **History**: scroll up loads older page; `hasMoreHistory` flips false at end
- [ ] **Mobile**: `isMobileView` toggles layout under 767px
- [ ] **Polling fallback**: with WS down, conv list + detail keep refreshing (5s / 3s)

## Validation Commands

Run from `D:/genAI/jsk-app/frontend`:

```bash
npx tsc --noEmit
# EXPECT: no output, exit 0 (no type errors; contract preserved)

npx eslint app/admin/live-chat/_context/LiveChatContext.tsx app/admin/live-chat/_hooks/useMediaQuery.ts app/admin/live-chat/_hooks/liveChatApi.ts app/admin/live-chat/_hooks/useConversationSync.ts app/admin/live-chat/_hooks/useMessageFlow.ts app/admin/live-chat/_hooks/useChatRoom.ts
# EXPECT: no errors/warnings on the 6 files

npx vitest run
# EXPECT: all suites pass, including the new contract + useMediaQuery + useMessageFlow tests

npm run build
# EXPECT: tsc + next build succeed (route /admin/live-chat compiles)

npx playwright test
# EXPECT: live-chat smoke spec passes (requires dev server) — no flow regression

# File-size goal verification:
wc -l app/admin/live-chat/_context/LiveChatContext.tsx app/admin/live-chat/_hooks/use*.ts app/admin/live-chat/_hooks/liveChatApi.ts
# EXPECT: LiveChatContext.tsx < 300; each hook file < 400
```

## Acceptance Criteria

1. `LiveChatContext.tsx` < 400 lines (target < 300); each new hook file < 400 lines.
2. Four hooks exist and are named exactly `useMediaQuery`, `useConversationSync`, `useMessageFlow`, `useChatRoom` in `_hooks/`.
3. `LiveChatContextValue` interface unchanged; `value` exposes all 31 members; contract test green.
4. Zero edits to `ChatArea.tsx`, `ConversationList.tsx`, `CustomerPanel.tsx`, `LiveChatShell.tsx`.
5. `npx tsc --noEmit`, `npx eslint`, `npx vitest run`, `npm run build` all green.
6. All 16 manual edge-case checks pass — no flow regression.
7. No changed magic numbers (5000 / 3000 / 10000 ms), no changed error strings.

## Completion Checklist

- [ ] Task 0 contract baseline test written + green on current `main`
- [ ] Task 1 `useMediaQuery` extracted, validated, committed
- [ ] Task 2 `liveChatApi.ts` helpers extracted, validated, committed
- [ ] Task 3 `useMessageFlow` extracted + tested, validated, committed
- [ ] Task 4 `useChatRoom` extracted, validated, committed
- [ ] Task 5 `useConversationSync` extracted, validated, committed
- [ ] Task 6 provider rewritten as composition root, validated, committed
- [ ] Task 7 file sizes verified < 400, full matrix green
- [ ] All 16 manual flows re-verified end-to-end
- [ ] PR diff shows 0 consumer-component changes

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Circular dependency between message handlers, conversation handler, and `wsSendMessage` | High | Build fails / runtime undefined | Keep single `useLiveChatSocket` call in the provider as the composition seam (Task 4 GOTCHA); pass functions down, not up |
| Accidentally converting `getStore()` (non-subscribing) to a subscription → extra re-renders or stale reads | Medium | Subtle perf/behavior regression | Copy access mode verbatim; review each moved callback; Profiler spot-check |
| Dropping a `value` key during reassembly | Medium | Consumer crashes (`undefined is not a function`) | Contract test (Task 0) asserts all 31 keys before + after |
| Ref ownership confusion (`selectedIdRef`/`wsStatusRef` read across hooks) | Medium | Stale closures, wrong-room messages | Keep shared refs in provider, pass down; document owner per ref |
| Re-introducing or removing H3 `value` memo out of Phase 8 scope | Medium | Behavior drift vs main | Read file at impl time; preserve whatever Phase 1 left; do not add/remove memo here |
| `matchMedia` undefined in jsdom breaks tests | Low | Test red | Stub `window.matchMedia` in test/setup |
| Effect dependency arrays change during move → effect runs at wrong time | Medium | Polling/join misfires | Copy dep arrays verbatim; tsc + eslint `react-hooks/exhaustive-deps` catch drift |
| Phase 6 not actually merged (this depends on it) | Low | Merge conflicts on same file | Confirm Phase 6 merged to `main` before branching; rebase if needed |

## Notes

- **Dependency**: Per PRD table, Phase 8 depends on Phase 6 (same file `LiveChatContext.tsx`). Confirm Phase 6 is merged before starting; branch off updated `main`.
- **Branch**: create `refactor/livechat-provider-split` off `main`. Commit one task per commit (`refactor(live-chat): extract useMediaQuery`, etc.) for reviewable, bisectable history.
- **CI**: GitHub Actions are disabled on this repo (project memory: free minutes exhausted). Run the full validation matrix **locally** before opening the PR — it will not run automatically.
- **Why socket stays in provider**: it is the one place that legitimately needs handlers from three different hooks at once. Forcing it into `useChatRoom` creates the circular dependency in the top risk row. The provider being the "wiring harness" for the socket is the cleanest seam and keeps each hook unidirectional.
- **Optional further split** if `useChatRoom` exceeds 400 lines: peel session actions (`claim/close/transfer/toggle`) into `useSessionActions` and leave only join/leave/poll effects in `useChatRoom`. Only do this if the size goal is actually missed — YAGNI otherwise.
- **Line references** in this plan are against the current 803-line `LiveChatContext.tsx`. If Phase 1's H3/M3 changes shifted lines, re-locate by symbol name (function name) rather than line number.
