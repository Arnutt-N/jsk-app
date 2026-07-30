import type { Message, PresencePayload } from '@/lib/websocket/types';

export type OnlineOperator = PresencePayload['operators'][number];

/**
 * Claim-contention lock entry: which operator holds (or is racing for) a room.
 */
export interface ClaimContender {
  operatorId: number;
  name: string;
}

export interface Session {
  id: number;
  status: 'WAITING' | 'ACTIVE' | 'CLOSED';
  started_at?: string;
  operator_id?: number;
}

export interface ConversationTag {
  id: number;
  name: string;
  color: string;
}

export interface Conversation {
  line_user_id: string;
  display_name: string;
  picture_url: string;
  friend_status: string;
  chat_mode: 'BOT' | 'HUMAN';
  session?: Session;
  last_message?: {
    content: string;
    created_at: string;
  };
  unread_count: number;
  tags?: ConversationTag[];
  is_pinned?: boolean;
  is_muted?: boolean;
  is_spam?: boolean;
}

export interface CurrentChat extends Conversation {
  messages?: Message[];
}

/**
 * Normalized operator entry for the Transfer picker. Online entries are derived
 * from WebSocket presence; offline entries are merged from the roster endpoint
 * (`/admin/users/workload`). `online` is the convenience flag for status !==
 * 'offline'.
 */
export interface OperatorOption {
  id: number;
  display_name: string;
  status: 'online' | 'away' | 'offline';
  active_chats: number;
  online: boolean;
}
