'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Debounce window for autosaving notes to localStorage. Short enough to feel
 * instant after the operator stops typing, long enough to avoid a write per
 * keystroke.
 */
const SAVE_DEBOUNCE_MS = 600;

/** Per-conversation storage key. */
const storageKey = (lineUserId: string): string => `livechat:notes:${lineUserId}`;

/**
 * Read the persisted note for a conversation. Returns '' for a null id, during
 * SSR, or when localStorage is unavailable (e.g. private mode) — never throws.
 */
function readNotes(lineUserId: string | null): string {
  if (lineUserId === null || typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(storageKey(lineUserId)) ?? '';
  } catch {
    return '';
  }
}

interface UseCustomerNotesReturn {
  notes: string;
  setNotes: (value: string) => void;
  saved: boolean;
}

/**
 * localStorage-backed Internal Notes for a live-chat conversation.
 *
 * - Lazy-inits from `livechat:notes:${lineUserId}` (mirrors `useTheme` /
 *   `useNotificationSound`: lazy read, SSR guard, try/catch around storage).
 * - `setNotes` updates state immediately, flips `saved` to false, then writes
 *   after a {@link SAVE_DEBOUNCE_MS} debounce and flips `saved` back to true.
 * - Switching `lineUserId` reloads that conversation's note and cancels any
 *   pending write so it can never land under the wrong key.
 * - A null id is a no-op for persistence (no write, no throw).
 *
 * Reload-on-change uses React's "adjust state during render" pattern rather
 * than an effect, which the project's React-Compiler ESLint rules reject
 * (set-state-in-effect). Timer cancellation lives in an effect *cleanup* (no
 * setState there), mirroring `useSessionTimeout`.
 */
export function useCustomerNotes(lineUserId: string | null): UseCustomerNotesReturn {
  const [notes, setNotesState] = useState<string>(() => readNotes(lineUserId));
  const [saved, setSaved] = useState<boolean>(true);
  // Which conversation `notes` currently reflects; drives the reload below.
  const [trackedId, setTrackedId] = useState<string | null>(lineUserId);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestIdRef = useRef<string | null>(lineUserId);

  const clearPending = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Conversation changed: load its saved note and clear the "saving" state.
  // Conditional setState during render is React's supported way to reset state
  // when a prop changes; the pending write is cancelled by the effect cleanup.
  if (lineUserId !== trackedId) {
    setTrackedId(lineUserId);
    setNotesState(readNotes(lineUserId));
    setSaved(true);
  }

  // Keep a live id for the debounced writer, and cancel any pending write when
  // the conversation changes or the component unmounts — so a queued save can
  // never land under the wrong conversation.
  useEffect(() => {
    latestIdRef.current = lineUserId;
    return clearPending;
  }, [lineUserId, clearPending]);

  const setNotes = useCallback(
    (value: string) => {
      setNotesState(value);

      // No persistence target when no conversation is selected.
      if (lineUserId === null) {
        clearPending();
        setSaved(true);
        return;
      }

      setSaved(false);
      clearPending();
      // Capture the id so the write always targets the conversation that owns
      // this text, and only confirm "saved" if we are still on it.
      const targetId = lineUserId;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (typeof window === 'undefined') return;
        try {
          localStorage.setItem(storageKey(targetId), value);
          if (latestIdRef.current === targetId) setSaved(true);
        } catch {
          // Private mode / quota exceeded — degrade gracefully, leave unsaved.
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [lineUserId, clearPending],
  );

  return { notes, setNotes, saved };
}
