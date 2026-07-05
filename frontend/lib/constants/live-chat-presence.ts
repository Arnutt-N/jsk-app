/**
 * Shared presence/status-dot mapping for live-chat avatars — single source of
 * truth so every surface (ConversationItem, ChatHeader, CustomerPanel,
 * ProfileDropdown) renders the same semantic colors:
 *
 *   online  (green) — ACTIVE session / operator connected
 *   away    (amber) — WAITING session / connection in progress
 *   offline (gray)  — no live session / disconnected
 */

import type { Session } from '@/app/admin/live-chat/_types';

export type PresenceStatus = 'online' | 'away' | 'offline';

/** Tailwind background class per presence state (tokens in globals.css). */
export const PRESENCE_DOT_CLASS: Record<PresenceStatus, string> = {
  online: 'bg-online',
  away: 'bg-away',
  offline: 'bg-offline',
};

/** Thai label per presence state (aria/sr-only text). */
export const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  online: 'ออนไลน์',
  away: 'กำลังรอ',
  offline: 'ออฟไลน์',
};

/** Map a conversation's session status onto the shared presence states. */
export function getSessionPresence(status?: Session['status']): PresenceStatus {
  if (status === 'ACTIVE') return 'online';
  if (status === 'WAITING') return 'away';
  return 'offline';
}

/** Map the operator's own WebSocket connection status onto presence states. */
export function getConnectionPresence(wsStatus: string): PresenceStatus {
  if (wsStatus === 'connected') return 'online';
  if (wsStatus === 'disconnected') return 'offline';
  return 'away'; // connecting / authenticating / reconnecting
}
