'use client';

import { useMemo } from 'react';
import type { Conversation } from '../_types';

export interface ConversationStats {
  filtered: Conversation[];
  waitingCount: number;
  activeCount: number;
  closedCount: number;
}

/**
 * Single-pass computation of conversation list stats + search filtering.
 *
 * One loop derives the WAITING / ACTIVE / closed counts (no-session or CLOSED
 * both count as closed) and builds the filtered list:
 * - query starting with '#' or 'tag:' matches against tag names (case-insensitive,
 *   prefix stripped)
 * - otherwise matches display_name OR line_user_id (case-insensitive)
 * - empty query matches everything
 */
export function computeConversationStats(
  conversations: Conversation[],
  query: string,
): ConversationStats {
  const q = query.trim().toLowerCase();
  const isTagFilter = q.startsWith('#') || q.startsWith('tag:');
  const tagQuery = isTagFilter ? q.replace(/^tag:/, '').replace(/^#/, '').trim() : '';

  const filtered: Conversation[] = [];
  let waitingCount = 0;
  let activeCount = 0;
  let closedCount = 0;

  for (const conv of conversations) {
    const status = conv.session?.status;
    if (status === 'WAITING') {
      waitingCount += 1;
    } else if (status === 'ACTIVE') {
      activeCount += 1;
    } else {
      // no session or CLOSED => closed
      closedCount += 1;
    }

    if (!q) {
      filtered.push(conv);
      continue;
    }

    if (isTagFilter) {
      if ((conv.tags || []).some((tag) => tag.name.toLowerCase().includes(tagQuery))) {
        filtered.push(conv);
      }
    } else if (
      (conv.display_name || '').toLowerCase().includes(q) ||
      conv.line_user_id.toLowerCase().includes(q)
    ) {
      filtered.push(conv);
    }
  }

  return { filtered, waitingCount, activeCount, closedCount };
}

export function useConversationStats(
  conversations: Conversation[],
  query: string,
): ConversationStats {
  return useMemo(
    () => computeConversationStats(conversations, query),
    [conversations, query],
  );
}
