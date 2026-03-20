export enum MessageType {
  // Client → Server
  AUTH = 'auth',
  JOIN_ROOM = 'join_room',
  LEAVE_ROOM = 'leave_room',
  SEND_MESSAGE = 'send_message',
  TYPING_START = 'typing_start',
  TYPING_STOP = 'typing_stop',
  CLAIM_SESSION = 'claim_session',
  CLOSE_SESSION = 'close_session',
  TRANSFER_SESSION = 'transfer_session',
  SUBSCRIBE_ANALYTICS = 'subscribe_analytics',
  UNSUBSCRIBE_ANALYTICS = 'unsubscribe_analytics',
  PING = 'ping',

  // Server → Client
  AUTH_SUCCESS = 'auth_success',
  AUTH_ERROR = 'auth_error',
  NEW_MESSAGE = 'new_message',
  MESSAGE_SENT = 'message_sent',
  MESSAGE_ACK = 'message_ack',
  MESSAGE_FAILED = 'message_failed',
  TYPING_INDICATOR = 'typing_indicator',
  SESSION_CLAIMED = 'session_claimed',
  SESSION_CLOSED = 'session_closed',
  SESSION_TRANSFERRED = 'session_transferred',
  PRESENCE_UPDATE = 'presence_update',
  CONVERSATION_UPDATE = 'conversation_update',
  OPERATOR_JOINED = 'operator_joined',
  OPERATOR_LEFT = 'operator_left',
  ANALYTICS_UPDATE = 'analytics_update',
  ERROR = 'error',
  PONG = 'pong'
}

export interface WebSocketMessage {
  type: MessageType;
  payload: unknown;
  timestamp: string;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'reconnecting';

export interface UseWebSocketOptions {
  url: string;
  adminId?: string;
  token?: string;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export interface UseWebSocketReturn {
  send: (type: MessageType, payload: unknown) => boolean;
  connectionState: ConnectionState;
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectAttempts: number;
  reconnect: () => void;
  disconnect: () => void;
}

export interface Message {
  id: number;
  line_user_id: string;
  direction: 'INCOMING' | 'OUTGOING';
  content: string;
  message_type: string;
  payload?: Record<string, unknown> | null;
  sender_role?: 'USER' | 'BOT' | 'ADMIN';
  operator_name?: string;
  created_at: string;
  temp_id?: string;
}

export interface Session {
  id: number;
  status: 'WAITING' | 'ACTIVE' | 'CLOSED';
  operator_id?: number;
}

export interface ConversationUpdatePayload {
  line_user_id: string;
  display_name: string;
  picture_url?: string;
  chat_mode: 'BOT' | 'HUMAN';
  unread_count?: number;
  tags?: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  session?: Session;
  messages?: Message[];
  last_message?: {
    content: string;
    created_at: string;
  };
}

export interface TypingIndicatorPayload {
  line_user_id: string;
  admin_id: string;
  is_typing: boolean;
}

export interface SessionPayload {
  line_user_id: string;
  session_id: number;
  status: string;
  operator_id?: number;
}

export interface PresencePayload {
  operators: Array<{
    id: number;
    status: string;
    active_chats: number;
  }>;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

export interface MessageAckPayload {
  temp_id: string;
  message_id: number;
  timestamp: string;
}

export interface MessageFailedPayload {
  temp_id: string;
  error: string;
  retryable: boolean;
}

export interface SessionTransferredPayload {
  line_user_id: string;
  session_id: number;
  from_operator_id: number;
  to_operator_id: number;
  reason?: string;
}
