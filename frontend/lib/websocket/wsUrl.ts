/**
 * Live-chat WebSocket URL resolution.
 *
 * Vercel's rewrite proxy strips the WebSocket upgrade headers, so in
 * production the socket must connect directly to the backend host taken
 * from NEXT_PUBLIC_API_URL. Same-host proxying stays as the fallback for
 * setups where the API URL is unset or relative (Next dev rewrites).
 */

const WS_PATH = '/ws/live-chat';

interface LocationLike {
  protocol: string;
  host: string;
}

export function buildLiveChatWsUrl(
  apiUrl: string | undefined,
  location: LocationLike
): string {
  if (apiUrl && /^https?:\/\//i.test(apiUrl)) {
    const base = apiUrl.replace(/\/+$/, '');
    return `${base.replace(/^http/i, 'ws')}${WS_PATH}`;
  }
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/api/v1${WS_PATH}`;
}

export function getLiveChatWsUrl(): string {
  if (typeof window === 'undefined') return '';
  return buildLiveChatWsUrl(process.env.NEXT_PUBLIC_API_URL, window.location);
}
