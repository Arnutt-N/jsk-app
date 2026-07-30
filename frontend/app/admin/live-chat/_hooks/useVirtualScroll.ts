'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import type { Message } from '@/lib/websocket/types';

// Hand-rolled virtualization uses a FIXED row-height estimate, which fights
// variable-height chat bubbles and makes the scroll position drift → jitter
// loop → freeze on long conversations. The non-virtual path (render all) is
// proven smooth, and chats page in 50 at a time so realistic threads rarely
// approach this. Keep the windowing only as a safety net for pathological
// (multi-thousand message) threads. See issue: "freeze on very long chats".
const VIRTUALIZATION_THRESHOLD = 1500;
const VIRTUAL_ESTIMATED_ROW_HEIGHT = 88;
const VIRTUAL_OVERSCAN = 12;

interface UseVirtualScrollDeps {
  messages: Message[];
  selectedId: string | null;
  hasMoreHistory: boolean;
  isLoadingHistory: boolean;
  loadOlderMessages: () => Promise<void>;
  focusedMessageId: number | null;
  clearFocusedMessage: () => void;
  reducedMotion: boolean;
}

export interface VisibleWindow {
  startIndex: number;
  endIndex: number;
  topPadding: number;
  bottomPadding: number;
}

/**
 * Scroll behavior + safety-net virtualization for the ChatArea message list:
 * RAF-throttled scroll tracking, near-bottom auto-scroll, scroll-to-bottom on
 * conversation open, focused-message jump, IntersectionObserver history
 * paging, and the fixed-row-height window computation. Verbatim move out of
 * ChatArea — no behavior or timing changes.
 */
export function useVirtualScroll({
  messages,
  selectedId,
  hasMoreHistory,
  isLoadingHistory,
  loadOlderMessages,
  focusedMessageId,
  clearFocusedMessage,
  reducedMotion,
}: UseVirtualScrollDeps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(0);
  // L9.2 (bug #3): Allow screen-reader users to disable virtualization so all
  // messages are in the DOM and readable. Virtualization removes off-screen
  // messages from the DOM, violating WCAG 2.1 AA (1.3.2, 4.1.2, 2.4.3).
  const [forceAllMessages, setForceAllMessages] = React.useState(false);

  // L9.3 (auto-scroll fix): Track "pending scroll to bottom" — set true when
  // selectedId changes, consumed when messages actually load (0 → N). The old
  // code only used double rAF on selectedId change, but messages are fetched
  // async so they're still [] when the rAF fires. This ref bridges the gap.
  const pendingScrollToBottomRef = useRef(false);

  // L9.1: throttle scroll-driven setState with requestAnimationFrame so the
  // virtualization recompute runs at most once per frame instead of on every
  // scroll event. Read scrollTop synchronously BEFORE the rAF callback because
  // React nullifies e.currentTarget after the handler returns.
  const scrollRafRef = useRef<number | null>(null);
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      setScrollTop(top);
    });
  }, []);
  useEffect(() => () => {
    if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
  }, []);

  // L7: baseline count of messages that already existed when this conversation
  // was opened. Anything appended after the baseline (absolute idx >= baseline)
  // is treated as "new" and gets the entrance animation. The baseline is captured
  // during render via the React-sanctioned "adjust state when a prop changes"
  // pattern (https://react.dev/learn/you-might-not-need-an-effect) — re-captured
  // synchronously whenever selectedId changes, so existing/historical messages
  // never animate and the entrance does not replay when switching rooms.
  const [prevSelectedId, setPrevSelectedId] = React.useState<string | null>(selectedId);
  const [baselineCount, setBaselineCount] = React.useState(messages.length);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    setBaselineCount(messages.length);
    // L9.2 (bug #3): Reset "load all" when switching conversations
    setForceAllMessages(false);
  }

  // Only auto-scroll if near bottom (not when user scrolled up to read older messages).
  // Scroll the messages container directly — scrollIntoView also scrolls overflow-hidden
  // ancestors (the shell), shifting the whole 3-column layout upward.
  // L9.2 (bug #6): Atomic snapshot — read scrollHeight once and use the same
  // value for both the near-bottom check and the scroll target. Previously
  // isNearBottom() and scrollTo() each read scrollHeight independently, so a
  // DOM change between reads (new message rendered) could cause the check to
  // pass but the scroll to target the wrong position.
  // L9.3 (auto-scroll fix): If pendingScrollToBottom is set (new conversation
  // opened), force scroll to bottom regardless of near-bottom check, because
  // messages just loaded from 0 → N and the user is at scrollTop=0.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (pendingScrollToBottomRef.current && messages.length > 0) {
      // Messages just loaded for a new conversation — force scroll to bottom
      pendingScrollToBottomRef.current = false;
      // Use rAF to ensure DOM has painted the new messages before scrolling
      requestAnimationFrame(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
      });
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = container;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 100;
    if (nearBottom) {
      container.scrollTo({ top: scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }, [messages.length, reducedMotion]);

  // Auto-scroll to bottom when opening a new conversation.
  // L9.2 (bug #4): Use a cancelled flag + separate rAF ID variables instead of
  // the type-unsafe (rafId1 as any).rafId2 = rafId2 mutation. The cancelled flag
  // prevents the inner rAF callback from executing after cleanup, and
  // cancelAnimationFrame is called on both IDs (0 is a safe no-op if the inner
  // rAF hasn't been scheduled yet).
  // L9.3 (auto-scroll fix): Set pendingScrollToBottomRef here (in effect, not
  // render body) so the messages-loaded effect knows to force-scroll.
  useEffect(() => {
    if (!selectedId) return;
    pendingScrollToBottomRef.current = true;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let rafId1 = 0;
    let rafId2 = 0;

    // Use double rAF to wait for layout/paint to complete
    // (more reliable than setTimeout for variable-height messages)
    rafId1 = requestAnimationFrame(() => {
      if (cancelled) return;
      rafId2 = requestAnimationFrame(() => {
        if (cancelled) return;
        container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId1);
      cancelAnimationFrame(rafId2);
    };
  }, [selectedId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setViewportHeight(container.clientHeight);
    const observer = new ResizeObserver(() => {
      setViewportHeight(container.clientHeight);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [selectedId]);

  useEffect(() => {
    if (!focusedMessageId) return;
    const idx = messages.findIndex((m) => m.id === focusedMessageId);
    if (idx < 0) return;
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = Math.max(
      0,
      idx * VIRTUAL_ESTIMATED_ROW_HEIGHT - container.clientHeight / 2,
    );
    const timer = window.setTimeout(() => {
      const target = document.getElementById(`message-${focusedMessageId}`);
      if (target) target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
      clearFocusedMessage();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [clearFocusedMessage, focusedMessageId, messages, reducedMotion]);

  useEffect(() => {
    if (!sentinelRef.current || !selectedId) return;
    const observer = new IntersectionObserver(async (entries) => {
      if (!entries[0]?.isIntersecting) return;
      if (!hasMoreHistory || isLoadingHistory) return;
      const container = containerRef.current;
      const prevHeight = container?.scrollHeight || 0;
      await loadOlderMessages();
      requestAnimationFrame(() => {
        if (!container) return;
        const delta = container.scrollHeight - prevHeight;
        container.scrollTop += delta;
      });
    }, { root: containerRef.current, threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadOlderMessages, hasMoreHistory, isLoadingHistory, selectedId]);

  const virtualEnabled = !forceAllMessages && messages.length > VIRTUALIZATION_THRESHOLD;
  const visibleWindow = useMemo<VisibleWindow>(() => {
    const total = messages.length;
    if (!virtualEnabled || total === 0) {
      return { startIndex: 0, endIndex: total, topPadding: 0, bottomPadding: 0 };
    }
    const start = Math.max(0, Math.floor(scrollTop / VIRTUAL_ESTIMATED_ROW_HEIGHT) - VIRTUAL_OVERSCAN);
    const visibleCount = Math.ceil(viewportHeight / VIRTUAL_ESTIMATED_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2;
    const end = Math.min(total, start + visibleCount);
    return {
      startIndex: start,
      endIndex: end,
      topPadding: start * VIRTUAL_ESTIMATED_ROW_HEIGHT,
      bottomPadding: Math.max(0, (total - end) * VIRTUAL_ESTIMATED_ROW_HEIGHT),
    };
  }, [scrollTop, messages.length, viewportHeight, virtualEnabled]);

  return {
    containerRef,
    sentinelRef,
    onScroll,
    virtualEnabled,
    visibleWindow,
    forceAllMessages,
    setForceAllMessages,
    baselineCount,
  };
}
