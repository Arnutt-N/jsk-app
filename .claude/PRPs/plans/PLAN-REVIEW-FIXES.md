# PLAN-REVIEW-FIXES — Errata for the 8 Live-Chat PRP Plans

> **READ THIS BEFORE IMPLEMENTING ANY PHASE.** Resolutions for the 7 cross-phase BLOCKERs + 2 wrong snippets found by the 12-expert plan review (`wf_634ea6c6-886`, see `.claude/PRPs/reviews/livechat-plan-review.md`). The 8 phase plans are otherwise high quality (snippet faithfulness 99%); apply these deltas on top of them. Verified against live source 2026-06-22.

## Status
- [ ] B1 — Phase 6 hook rename alignment
- [ ] B2 — ConversationItem/List ownership chain (see PRD File Ownership table — already updated)
- [ ] B3 — e2e baseline (`frontend/e2e/live-chat-smoke.spec.ts` — created in this commit)
- [ ] B4 — H3 memo automated test (Phase 1)
- [ ] B5 — claim-contention automated test (Phase 6)
- [ ] B6 — ack-timeout race tests (Phase 8)
- [ ] B7 — Phase 8 contract = capture-live (~30), assert by type not count
- [ ] S1 — Phase 3 `--text-2xs` snippet consistency (`@theme`, not `:root`)
- [ ] S2 — Phase 5 M13 props already exist

---

## BLOCKER-1 + BLOCKER-2 — Phase 6 ↔ Phase 5 hook/prop incompatibility

**Verified:** Phase 5 Task 2 renames `useConversations` → `useConversationStats` with signature `(conversations: Conversation[], query: string)` (2 params, no `sortBy`) and keeps a backward-compat re-export `export { useConversationStats as useConversations }`. Phase 5 also changes `ConversationItem` props: `onClick → onSelect(id)`, `onMenuClick → onMenuToggle(id)`. `useConversations.ts:5` currently is `useConversations(conversations, query)` (2 params already — no `sortBy`).

**Problem:** Phase 6 plan (`phase-6-operator-ux-multi-operator.plan.md`) Task 12 + Files table (lines 259-260, 403-410) targets `useConversations(conversations, searchQuery, sortBy)` — old name, 3 params — and edits `ConversationItem` assuming the old `onClick`/`onMenuClick` props. Both break after Phase 5.

**Fix (apply when implementing Phase 6):**
1. M15 sort belongs in `useConversationStats` (owner = Phase 5). Add `sortBy: 'recent' | 'longest-waiting' = 'recent'` as a 3rd param to **`useConversationStats`**, not a phantom `useConversations`. Coordinate with the Phase 5 owner (or fold M15-sort into Phase 5 Task 2 directly).
2. In `ConversationList.tsx`, call `useConversationStats(conversations, searchQuery, sortBy)`.
3. Phase 6 ConversationItem edits (waiting badge, claim contender) must build on Phase 5's new prop signature (`onSelect(id)` / `onMenuToggle(id)`), not `onClick`/`onMenuClick`.
4. Respect the serialize chain **P1 → P3 → P4 → P5 → P6** for `ConversationItem.tsx` / `ConversationList.tsx` (PRD File Ownership table, updated).

---

## BLOCKER-3 — No Playwright spec touches /admin/live-chat

**Fix:** `frontend/e2e/live-chat-smoke.spec.ts` created in this commit as the regression baseline (currently `test.skip` / TODO-guarded — needs an authenticated session + selectors confirmed against the running app before un-skipping). Run it green **before** starting Phase 1 so "no regression" claims are verifiable.

---

## BLOCKER-4 — H3 memoization has no automated test (Phase 1)

**Fix (add to Phase 1 tasks):** create `frontend/app/admin/live-chat/_context/__tests__/LiveChatContextMemo.test.tsx`:
- Render a `React.memo` child that increments a render counter and consumes the context.
- After the H3 `useMemo(value)` fix, dispatch an unrelated state change (e.g. `setInputText('a')` via the store) and assert the child render count does **not** increase for state it doesn't read.
- This is the executable form of the PRD perf success-metric ("type 1 char → unrelated consumers re-render = 0").

---

## BLOCKER-5 — Claim contention has no automated test (Phase 6)

**Fix (add to Phase 6 tasks):** create `claimContention.test.ts`:
- Mock `onSessionClaimed` with `operator_id !== currentUser` → assert the contender/lock state (e.g. `claimContenders[lineUserId]`) is set and the Claim button is disabled for others.
- Fire `onSessionClosed` / `onSessionClaimed`-by-self → assert the lock clears.
- Mark the 2-client manual test as **required** (not optional) in the phase acceptance.

---

## BLOCKER-6 — Phase 8 ack-timeout test misses races (Phase 8)

**Fix (add 3 cases to `useMessageFlow.test.tsx`):**
1. ACK arrives **after** the 10s timeout already flipped the message to `failed` → must NOT resurrect/double-handle.
2. `retryMessage` issues a **new** tempId and the old optimistic entry is reconciled (no duplicate bubble).
3. WebSocket-down HTTP fallback keeps `Promise.all` **parallel** (must not revert Phase 5 L9.3 sequential→parallel optimization).

---

## BLOCKER-7 — Phase 8 contract count (31 → ~30) + assertion style

**Verified:** `phase-8-provider-refactor.plan.md` hardcodes "31 keys" (lines 159, 185, 313, 321, 337, 390, 415) and assumes a `state` member ("state has 21 keys"). Phase 1 / M3 **removes the dead `state` field from the context value** (no consumer reads `context.state`). Phase 8 runs after Phase 1, so the live contract is ~30 keys and contains no `state`.

**Fix (apply when implementing Phase 8):**
1. Task 0 must capture the contract **live at that point in time** (snapshot `Object.keys(value)` from the running provider) — do **not** hardcode 31; expect `state` to be absent.
2. Replace count-only assertion (`Object.keys(value).length === 31`) with **member existence + type** checks, e.g. `expect(typeof value.sendMessage).toBe('function')`, plus a negative assertion that no unexpected key was added. (`Object.keys().length` passes even when every value is `undefined`.)
3. Remove the `state has 21 keys` assertion (line 337) — `state` no longer exists post-M3.

---

## SNIPPET-1 (S1) — Phase 3 `--text-2xs` must be in `@theme`

**Verified:** `globals.css` **does** have an `@theme { }` block (line 6). Tailwind-v4 default text tokens (`--text-xs`, `--text-sm`) sit in `:root` (lines 232-233) and work only because they are *default* token names Tailwind already generates utilities for. A **new** name `--text-2xs` has no default utility, so it MUST be declared in `@theme` to generate `text-2xs`.

**Status:** Phase 3 **Task 1 GOTCHA (line 190) is already correct** (`@theme`, not `:root`). The inconsistency is in the supporting material:
- Pattern-to-Mirror snippet (`phase-3...:123-127`) shows a `:root` block with "เพิ่ม --text-2xs ที่นี่" — **misleading**, change the comment to point at `@theme`.
- Mandatory-reading row (`:69`) lists "230-248 (`:root` fluid type) ... ตำแหน่งเพิ่ม `--text-2xs`" — clarify that the **new** token goes in `@theme` (6-228), while `:root` only holds value overrides for existing default tokens.

(The plan review's claim "globals.css has no `@theme` block" was itself inaccurate — `@theme` exists at line 6. The actionable fix is the snippet/mandatory-reading consistency only.)

---

## SNIPPET-2 (S2) — Phase 5 M13: `optionId`/`formattedTime` already exist

**Verified:** `ConversationList.tsx` already passes `optionId` (line 220) and `formattedTime` (line 223) to `ConversationItem`. They are NOT new work.

**Fix:** In Phase 5 Task 2/3, the only prop changes are the renames `onClick → onSelect(id)` (ConversationList.tsx:224) and `onMenuClick → onMenuToggle(id)` (:228). Keep `optionId`/`formattedTime` as-is. Do not re-add them to the interface as if new — the `ConversationItemProps` interface already declares them. (The `formattedTime` move in Phase 5 L9.2 concerns `MessageBubble`, a different component — don't conflate.)

---

## Gate before implementation
Apply B1/B2 (already reflected in PRD File Ownership), B7, S1, S2 to the respective plans (or keep this errata open beside them), land the B3 e2e baseline green, and ensure B4/B5/B6 tests are written as part of their phase's TDD. Then start **Phase 1** via `/ecc:prp-implement .claude/PRPs/plans/phase-1-quick-wins.plan.md`.
