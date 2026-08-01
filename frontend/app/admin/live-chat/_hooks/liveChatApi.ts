/**
 * Shared pure helpers for the live-chat provider + responsibility hooks.
 *
 * Extracted from LiveChatContext.tsx (Phase 8 / Task 2) so useConversationSync,
 * useChatRoom, and the provider import ONE copy instead of duplicating. This
 * module is framework-pure: no React, no store coupling — every export is a
 * plain, deterministic data transform.
 *
 * Two intentional non-moves:
 *   - `readErrorMessage` is NOT duplicated here. It already exists canonically
 *     in `@/lib/api-error` and the live-chat copy was byte-identical, so callers
 *     import it from there (removes a 22-line duplicate).
 *   - `API_BASE` lives in `../_lib/constants` (single source) — import it there.
 */
import type { CurrentChat, Session } from '../_types';
import type { ConversationUpdatePayload, PresencePayload } from '@/lib/websocket/types';

/**
 * Move (or insert) the updated conversation to the top of the list in a single
 * pass, preserving the relative order of the remaining conversations. A
 * not-present id is simply prepended (matching the old "new conversation"
 * branch). Pure + immutable: returns a new array, never mutates the input.
 */
export function reorderConversationsToTop<T extends { line_user_id: string }>(list: T[], updated: T): T[] {
  const next: T[] = [updated];
  for (let i = 0; i < list.length; i++) {
    if (list[i].line_user_id !== updated.line_user_id) next.push(list[i]);
  }
  return next;
}

const mergeSession = (existing: Session | undefined, incoming?: Session): Session | undefined => {
  if (!incoming) return existing;
  return {
    id: incoming.id ?? existing?.id ?? 0,
    status: incoming.status ?? existing?.status ?? 'WAITING',
    started_at: incoming.started_at ?? existing?.started_at,
    operator_id: incoming.operator_id ?? existing?.operator_id,
  };
};

/**
 * Resolve an operator's human-readable name from the presence list, normalizing
 * the string presence id against the numeric operator id. Falls back to the
 * `Operator #id` convention shared with the backend payload.
 */
export const resolveOperatorName = (
  operators: PresencePayload['operators'],
  operatorId: number,
): string => {
  const match = operators.find((op) => Number(op.id) === operatorId);
  return match?.display_name || match?.name || `Operator #${operatorId}`;
};

/**
 * Immutably drop a key from a record. Returns the same reference when the key is
 * absent so React can bail out of a no-op state update.
 */
export const removeKey = <V,>(record: Record<string, V>, key: string): Record<string, V> => {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
};

export const mergeConversationUpdate = (
  existing: CurrentChat | null,
  data: ConversationUpdatePayload,
  unreadCount: number,
): CurrentChat => ({
  line_user_id: data.line_user_id,
  display_name: data.display_name ?? existing?.display_name ?? '',
  picture_url: data.picture_url ?? existing?.picture_url ?? '',
  friend_status: existing?.friend_status ?? 'ACTIVE',
  chat_mode: data.chat_mode ?? existing?.chat_mode ?? 'BOT',
  session: mergeSession(existing?.session, data.session),
  last_message: data.last_message ?? existing?.last_message,
  unread_count: unreadCount,
  tags: data.tags ?? existing?.tags,
  messages: data.messages ?? existing?.messages,
});

/**
 * Relative-time label for a message timestamp: 'now', '5m', '3h', 'Yesterday',
 * or a th-TH short date. Pure presentation util (extracted from the provider so
 * it stays a thin composition root). Module-level → stable identity.
 */
export function formatTime(value: string): string {
  const d = new Date(value);
  const now = new Date();
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  if (hours < 48) return 'Yesterday';
  return d.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });
}

const NON_TEXT_PREVIEW: Record<string, string> = {
  image: '[รูปภาพ]',
  sticker: '[สติกเกอร์]',
  video: '[วิดีโอ]',
  audio: '[เสียง]',
  location: '[ตำแหน่ง]',
  file: '[ไฟล์]',
  flex: '[Flex Message]',
  template: '[Template]',
  imagemap: '[Imagemap]',
};

/**
 * Sidebar preview text for a message. Text messages use their content;
 * non-text types (image, sticker, video, …) get a Thai bracket label so
 * the conversation list never shows an empty or raw-URL preview.
 */
export function messagePreview(content: string, messageType: string): string {
  if (messageType !== 'text') return NON_TEXT_PREVIEW[messageType] || `[${messageType}]`;
  return content;
}
