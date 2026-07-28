import { API_BASE } from './constants';

/**
 * Conversation action API calls for the sidebar kebab menu. Plain `fetch` is
 * used because the global admin authFetch interceptor automatically attaches
 * cookies + CSRF for `/api/v1/admin/` URLs on mutating methods.
 */

export interface PreferenceFlags {
  is_pinned: boolean;
  is_muted: boolean;
  is_spam: boolean;
}

export async function updateConversationPreferences(
  lineUserId: string,
  patch: Partial<PreferenceFlags>,
): Promise<PreferenceFlags> {
  const res = await fetch(
    `${API_BASE}/admin/live-chat/conversations/${encodeURIComponent(lineUserId)}/preferences`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) throw new Error('failed to update preferences');
  return res.json() as Promise<PreferenceFlags>;
}

export async function archiveConversation(lineUserId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/admin/live-chat/conversations/${encodeURIComponent(lineUserId)}/archive`,
    { method: 'PATCH' },
  );
  if (!res.ok) throw new Error('failed to archive conversation');
}

export async function deleteConversation(lineUserId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/admin/live-chat/conversations/${encodeURIComponent(lineUserId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error('failed to delete conversation');
}
