'use client';

import { useMemo } from 'react';
import type { Conversation } from '../_types';

export interface ConversationStats {
  filtered: Conversation[];
  waitingCount: number;
  activeCount: number;
  closedCount: number;
}

export type ConversationSort = 'recent' | 'longest-waiting';

/**
 * Group rank for 'longest-waiting' sort:
 *   0 = WAITING session with a started_at (longest-waiting group, top)
 *   1 = has a session but not waiting (ACTIVE / CLOSED, middle)
 *   2 = no session at all (pushed to the end)
 */
function waitingGroupRank(conv: Conversation): number {
  if (conv.session?.status === 'WAITING' && conv.session.started_at) return 0;
  if (conv.session) return 1;
  return 2;
}

function toTimeMs(value?: string): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Comparator for 'longest-waiting': WAITING conversations first ordered by
 * oldest `started_at` (i.e. longest waiting on top), then conversations that
 * have a non-waiting session, then conversations with no session. Ties break by
 * most-recent last message. Pure — never mutates its inputs.
 */
function compareLongestWaiting(a: Conversation, b: Conversation): number {
  const rankA = waitingGroupRank(a);
  const rankB = waitingGroupRank(b);
  if (rankA !== rankB) return rankA - rankB;

  if (rankA === 0) {
    // both WAITING with started_at: oldest first => longest waiting on top
    const diff = toTimeMs(a.session?.started_at) - toTimeMs(b.session?.started_at);
    if (diff !== 0) return diff;
  }

  // stable tiebreak: most recent last message first
  return toTimeMs(b.last_message?.created_at) - toTimeMs(a.last_message?.created_at);
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
  sortBy: ConversationSort = 'recent',
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

  // 'recent' preserves the existing order exactly (same array reference).
  // 'longest-waiting' returns a non-mutating sorted copy.
  const sorted = sortBy === 'longest-waiting' ? [...filtered].sort(compareLongestWaiting) : filtered;

  return { filtered: sorted, waitingCount, activeCount, closedCount };
}

export function useConversationStats(
  conversations: Conversation[],
  query: string,
  sortBy: ConversationSort = 'recent',
): ConversationStats {
  return useMemo(
    () => computeConversationStats(conversations, query, sortBy),
    [conversations, query, sortBy],
  );
}
