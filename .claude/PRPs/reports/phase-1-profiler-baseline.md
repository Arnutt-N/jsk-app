# Profiler Baseline: Live-Chat Phase 1 (H3 — memoize context value)

**Plan**: `PRPs/plans/` (Live-Chat Phase 1 — Quick Wins)
**Scope**: `app/admin/live-chat/_context/LiveChatContext.tsx`
**Date**: 2026-06-26

## Purpose

H3 of Phase 1 memoizes the `LiveChatProvider` context `value`. This document
records the performance success-metric for that change and how it is verified.

## Success metric

> Type 1 character in `MessageInput` → unrelated consumers
> (`ConversationList`, `ConversationItem`, `CustomerPanel`) re-render = **0**.

## How it is verified (no interactive DevTools)

The CI / headless (jsdom) environment cannot run the React DevTools Profiler
interactively, so the metric is **not** captured from a manual DevTools session.
Instead it is verified by the automated test:

- `app/admin/live-chat/_context/__tests__/LiveChatContextMemo.test.tsx`

Per errata **B4**, this test is *the executable form of the PRD perf
success-metric*. It pins the deterministic invariants that make the metric true:

1. Typing a character writes only `inputText` (read directly from the Zustand
   store by `MessageInput`). The provider no longer subscribes to `inputText`
   (M3 removed the `state` mirror), so it does **not** re-render and the
   context `value` reference stays identical (`===`).
2. Even across a real provider re-render whose value-dependencies are unchanged
   (e.g. `conversations` changes while nothing is selected), the memoized
   `value` keeps its identity, so a memoized consumer does not re-render.
3. The context `value` no longer exposes a `state` member (Phase 8 contract).

## Before vs. after

| | Behavior |
|---|---|
| **Before** | The provider built `const value = { ... }` as a fresh object literal on every render. Every render produced a new reference, so React notified **every** context consumer and they all re-rendered — even when nothing they read had changed. Typing in `MessageInput` (which updates store-only `inputText`) cascaded re-renders into `ConversationList`, `ConversationItem`, and `CustomerPanel`. |
| **After** | `value` is wrapped in `useMemo` keyed on the exact set of derived values and callbacks it exposes. The reference only changes when one of those dependencies changes identity. Updating store-only fields (`inputText`, pickers, `sending`, etc.) does not change any dependency — and is no longer even subscribed by the provider — so unrelated consumers do not re-render. |

## Expected DevTools result (if run later)

If a developer later runs the React DevTools Profiler against the
type-1-character scenario, the expected after-state is **0 re-renders** of
`ConversationList`, `ConversationItem`, and `CustomerPanel`. `MessageInput`
itself still re-renders (it reads `inputText`), which is correct and intended.

## Related changes (same PR)

- **H3**: context `value` wrapped in `useMemo` with an exhaustive dependency
  array (all exposed derived values + callbacks).
- **M3**: removed the dead `ChatState` mirror — the `interface ChatState`, the
  `state` member of `LiveChatContextValue`, the `state` `useMemo`, and the 16
  store subscriptions that existed only to build it. The 4 subscriptions still
  used by derived values / effects (`conversations`, `selectedId`,
  `currentChat`, `messages`) were kept. The context `value` now has 30 keys and
  no `state` member.
