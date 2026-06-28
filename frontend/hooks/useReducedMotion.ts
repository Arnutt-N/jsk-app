'use client';
import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Subscribe React to the OS reduced-motion media query. Module-level (stable
 * identity) so useSyncExternalStore never re-subscribes on re-render.
 */
function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onStoreChange);
  return () => mql.removeEventListener('change', onStoreChange);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

/** Server (and pre-hydration) value — always false to avoid a hydration mismatch. */
function getServerSnapshot(): boolean {
  return false;
}

/** Returns true when the user has requested reduced motion at the OS level. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
