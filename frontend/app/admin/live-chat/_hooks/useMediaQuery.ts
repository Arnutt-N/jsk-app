'use client';

import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query and return whether it currently matches.
 *
 * Extracted from LiveChatProvider's inline `isMobileView` effect (Phase 8 /
 * Task 1). Behaviour is identical to the original: initial value `false`,
 * synced on mount via `update()`, kept in sync through the `change` event, and
 * the listener is removed on cleanup. SSR-safe (no-op when `window` is absent).
 */
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
