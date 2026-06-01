/**
 * Production-aware logger.
 *
 * Why a wrapper:
 *   - `console.error` / `console.warn` / `console.info` pollute the browser
 *     DevTools console in production builds and may leak PII.
 *   - The agent review (Task #6, 2026-06-01 22:39) called out 78
 *     `console.error` calls in production catch blocks; the recommended
 *     fix is to route everything through a single utility that:
 *       * logs to the console in development (where engineers need it)
 *       * no-ops or forwards to telemetry in production (where end-users
 *         do not benefit from browser console noise)
 *
 * Telemetry hook:
 *   The `reportError` function is a no-op placeholder. Wire your telemetry
 *   provider (Sentry, Datadog RUM, custom `/api/v1/telemetry` endpoint) by
 *   replacing its body. The signature is stable so call sites do not change.
 *
 * What stays as `console.error`:
 *   - `ErrorBoundary.componentDidCatch` — must always log, even in tests
 *   - `WebSocket` connection state machine — needs visibility for ops
 *   - `AuthContext` token refresh failures — security-relevant
 *
 * Migration plan (per Task #40, 2026-06-01):
 *   1. Replace `console.error` in `frontend/app/**` pages → `logger.error`
 *   2. Replace `console.error` in non-critical lib code → `logger.error`
 *   3. Leave `console.error` in critical boundaries (see above)
 */

const isDev = process.env.NODE_ENV !== 'production';

type ErrorContext = Record<string, unknown>;

/**
 * Report an error to telemetry. No-op until a provider is wired up.
 * @param _error The error or message to report.
 * @param _context Optional structured context (route, userId, etc.).
 */
function reportError(_error: unknown, _context?: ErrorContext): void {
  // TODO: forward to Sentry/Datadog when telemetry is added.
  // Example wiring (when ready):
  //   Sentry.captureException(_error, { extra: _context });
}

function formatMessage(msg: string, args: unknown[]): unknown[] {
  if (args.length === 0) return [];
  // Prefix with a tag so browser DevTools filtering still works.
  return [`[logger] ${msg}`, ...args];
}

export const logger = {
  /**
   * Log an error. Dev: console.error. Prod: telemetry only (no console).
   * Use for caught exceptions, failed network calls, invalid state.
   *
   * Flexible call patterns:
   *   logger.error('fetch failed', err)
   *   logger.error(err)            // bare error
   *   logger.error('msg', err, { route: '/x' })
   */
  error(msgOrError: string | unknown, errorOrContext?: unknown, context?: ErrorContext): void {
    const [msg, err, ctx] = typeof msgOrError === 'string'
      ? [msgOrError, errorOrContext, context]
      : [String(msgOrError ?? 'Unknown error'), errorOrContext, context as ErrorContext | undefined];
    if (isDev) {
      console.error(...formatMessage(msg, [err, ctx]));
    }
    reportError(err ?? msg, ctx);
  },

  /**
   * Log a warning. Dev: console.warn. Prod: silent (may add telemetry).
   * Use for recoverable issues, deprecated usage, soft validation failures.
   */
  warn(msg: string, ...args: unknown[]): void {
    if (isDev) {
      console.warn(...formatMessage(msg, args));
    }
  },

  /**
   * Log an info message. Dev only. Use sparingly — most info should be
   * surfaced via toast notifications, not the browser console.
   */
  info(msg: string, ...args: unknown[]): void {
    if (isDev) {
      console.info(...formatMessage(msg, args));
    }
  },

  /**
   * Log a debug message. Dev only. Use for verbose tracing.
   */
  debug(msg: string, ...args: unknown[]): void {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.debug(...formatMessage(msg, args));
    }
  },
};

export default logger;
