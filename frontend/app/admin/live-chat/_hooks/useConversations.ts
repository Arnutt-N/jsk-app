'use client';

// Backward-compat re-export. The implementation now lives in
// useConversationStats.ts (single-pass, memoized). `useConversations` is kept
// as an alias so existing imports keep working.
export {
  useConversationStats,
  useConversationStats as useConversations,
  computeConversationStats,
} from './useConversationStats';
export type { ConversationStats } from './useConversationStats';
