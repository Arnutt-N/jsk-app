'use client';
import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger';

/** Minimal profile surface the LIFF forms rely on. */
export interface LiffProfile {
  userId: string;
}

/**
 * SDK surface the init flow drives, derived from the single loader
 * (`window.liff` injected by `liff/layout.tsx`). `getProfile` stays narrowed
 * to the one field forms read so callers are not coupled to LINE's full shape.
 */
export type LiffSdk = Pick<
  NonNullable<Window['liff']>,
  'init' | 'isLoggedIn' | 'isInClient' | 'login' | 'getIDToken'
> & {
  getProfile(): Promise<LiffProfile>;
};

/**
 * Shared loader for every LIFF page: the edge script in `liff/layout.tsx`
 * populates `window.liff`; a blocked/slow script (or SSR) means undefined.
 */
export function getWindowLiff(): LiffSdk | undefined {
  return typeof window !== 'undefined' ? window.liff : undefined;
}

export interface UseLiffInitOptions {
  /** Returns the LIFF SDK to drive (normally `getWindowLiff`). */
  getLiff: () => LiffSdk | null | undefined;
  /** Throw (surfaced via `liffError`) when NEXT_PUBLIC_LIFF_ID is missing; when false, skip silently. */
  requireLiffId?: boolean;
  /** Call liff.login() when not logged in instead of skipping profile fetch. */
  redirectLogin?: boolean;
  /** Track LINE in-app context, including the post-error re-detection fallback. */
  trackInLineApp?: boolean;
  /** Console-warn when getLiff() yields nothing (SDK script not loaded). */
  warnWhenSdkMissing?: boolean;
  /** Skip liff.getProfile() (an extra round trip) for pages that only need the ID token. Default true. */
  fetchProfile?: boolean;
  /** Extra per-page reaction to an init failure (e.g. a user-facing error message). */
  onError?: (err: unknown) => void;
}

export interface UseLiffInitResult {
  profile: LiffProfile | null;
  idToken: string | null;
  isInLineApp: boolean;
  liffError: unknown;
  /** True once the init effect finished (success, failure, or skip). */
  initDone: boolean;
  /** Direct setter for pages that re-sync the in-client flag outside init. */
  setIsInLineApp: (value: boolean) => void;
}

export function useLiffInit({
  getLiff,
  requireLiffId = true,
  redirectLogin = true,
  trackInLineApp = false,
  warnWhenSdkMissing = false,
  fetchProfile = true,
  onError
}: UseLiffInitOptions): UseLiffInitResult {
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [isInLineApp, setIsInLineApp] = useState(false);
  const [liffError, setLiffError] = useState<unknown>(null);
  const [initDone, setInitDone] = useState(false);

  useEffect(() => {
    const initLiff = async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) {
          if (requireLiffId) {
            throw new Error('LIFF ID is not specified in environment variables.');
          }
          return;
        }

        const liffApi = getLiff();
        if (!liffApi) {
          if (warnWhenSdkMissing) {
            console.warn('LIFF SDK not found. Running in browser mode?');
          }
          return;
        }

        // Initialize LIFF
        await liffApi.init({ liffId });

        // Check if running inside LINE App
        if (trackInLineApp) {
          setIsInLineApp(liffApi.isInClient());
        }

        if (!liffApi.isLoggedIn()) {
          if (redirectLogin) {
            // Not logged in - trigger login
            liffApi.login();
          }
          return;
        }

        // The ID token is available synchronously after init, so publish it
        // before the profile round trip: token-gated fetches start sooner.
        try {
          setIdToken(liffApi.getIDToken());
        } catch (tokenErr) {
          logger.error('LIFF getIDToken Error:', tokenErr);
        }

        if (fetchProfile) {
          const userProfile = await liffApi.getProfile();
          setProfile(userProfile);
        }
      } catch (err: unknown) {
        logger.error('LIFF Init Error:', err);
        setLiffError(err);
        onError?.(err);
        if (trackInLineApp) {
          // Still try to detect the LINE in-app context so the success
          // screen + auto-close behave correctly even if init hiccupped
          // (otherwise isInLineApp stays false on mobile and never closes).
          try {
            setIsInLineApp(getLiff()?.isInClient() ?? false);
          } catch {
            // Not in the LINE client (or LIFF unavailable) — leave as false.
          }
        }
      } finally {
        setInitDone(true);
      }
    };

    initLiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { profile, idToken, isInLineApp, liffError, initDone, setIsInLineApp };
}
