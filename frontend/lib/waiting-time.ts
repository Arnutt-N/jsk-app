/**
 * Pure helpers for the live-chat queue waiting-time badge (finding M15).
 *
 * Computes how long a session has been WAITING, maps it to an SLA tier
 * (amber/red), and formats a compact label. `now` is injectable so the elapsed
 * calculation is deterministic in tests — do not read the wall clock inside the
 * logic the tests exercise.
 *
 * SLA thresholds (Q2 defaults, single source of truth — change here only):
 *   amber >= 5 minutes, red >= 15 minutes.
 */

export const WAITING_AMBER_SECONDS = 300; // 5 minutes
export const WAITING_RED_SECONDS = 900; // 15 minutes

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

export type WaitingTier = 'normal' | 'amber' | 'red';

/**
 * Whole seconds elapsed since `startedAt`. Returns 0 (never negative) for a
 * future or unparseable timestamp. `now` defaults to the current time but is
 * injectable for deterministic tests.
 */
export function getWaitingSeconds(startedAt: string, now: Date = new Date()): number {
  const startedMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedMs)) return 0;
  const diffMs = now.getTime() - startedMs;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / 1000);
}

/**
 * Maps elapsed seconds to an SLA tier:
 *   < amber threshold        -> 'normal'
 *   [amber, red) threshold   -> 'amber'
 *   >= red threshold         -> 'red'
 */
export function getWaitingTier(seconds: number): WaitingTier {
  if (seconds >= WAITING_RED_SECONDS) return 'red';
  if (seconds >= WAITING_AMBER_SECONDS) return 'amber';
  return 'normal';
}

/**
 * Compact human-readable waiting label:
 *   < 1 minute  -> 'now'
 *   < 1 hour    -> '7m'
 *   >= 1 hour   -> '1h 3m' (minutes omitted when zero -> '2h')
 */
export function formatWaiting(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return 'now';
  if (seconds < SECONDS_PER_HOUR) {
    const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
    return `${minutes}m`;
  }
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}
