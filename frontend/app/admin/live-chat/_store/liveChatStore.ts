import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Message } from '@/lib/websocket/types'
import type { Conversation, CurrentChat } from '../_types'

// ──────────────────────────────────────────────
// UI state for new features (not in current reducer)
// ──────────────────────────────────────────────
export interface ToastNotification {
  id: string
  title: string
  message: string
  avatar?: string
  type: 'message' | 'system'
  timestamp: number
  // Present only for clickable 'message' toasts — opens that conversation on click.
  lineUserId?: string
}

// ──────────────────────────────────────────────
// Full store: mirrors ChatState + UI extensions
// ──────────────────────────────────────────────
interface LiveChatState {
  // Core data (mirrors useChatReducer exactly)
  conversations: Conversation[]
  selectedId: string | null
  currentChat: CurrentChat | null
  messages: Message[]
  loading: boolean
  backendOnline: boolean
  filterStatus: string | null
  searchQuery: string
  inputText: string
  sending: boolean
  claiming: boolean
  showCustomerPanel: boolean
  activeActionMenu: string | null
  showTransferDialog: boolean
  showCannedPicker: boolean
  soundEnabled: boolean
  pendingMessages: Set<string>
  failedMessages: Map<string, string>
  // temp_ids whose failure must NOT be retried (e.g. the backend confirmed the
  // message already reached LINE — a resend would duplicate it for the customer)
  nonRetryableMessages: Set<string>
  hasMoreHistory: boolean
  isLoadingHistory: boolean
  // L9.4 (unread divider): Captures the unread count at the moment a
  // conversation is opened, BEFORE it's cleared to 0. Used by ChatArea to
  // render the UnreadDivider at the correct position. Reset on switch.
  initialUnreadCount: number

  // UI extensions (new features)
  showEmojiPicker: boolean
  showStickerPicker: boolean
  showQuickReplies: boolean
  inputExpanded: boolean
  notifications: ToastNotification[]
  liveMessage: string
}

interface LiveChatActions {
  // Data actions
  setConversations: (conversations: Conversation[]) => void
  selectChat: (id: string | null) => void
  setCurrentChat: (chat: CurrentChat | null) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  prependMessages: (messages: Message[]) => void
  setLoading: (loading: boolean) => void
  setBackendOnline: (online: boolean) => void
  setFilterStatus: (status: string | null) => void
  setSearchQuery: (query: string) => void
  setInputText: (text: string) => void
  setSending: (sending: boolean) => void
  setClaiming: (claiming: boolean) => void
  setShowCustomerPanel: (show: boolean) => void
  toggleCustomerPanel: () => void
  setActiveActionMenu: (id: string | null) => void
  setShowTransferDialog: (show: boolean) => void
  setShowCannedPicker: (show: boolean) => void
  setSoundEnabled: (enabled: boolean) => void
  addPending: (tempId: string) => void
  removePending: (tempId: string) => void
  setFailed: (tempId: string, error: string, retryable?: boolean) => void
  clearFailed: (tempId: string) => void
  setHasMoreHistory: (hasMore: boolean) => void
  setIsLoadingHistory: (loading: boolean) => void
  markRead: (lineUserId: string) => void

  // UI extension actions
  toggleEmojiPicker: () => void
  toggleStickerPicker: () => void
  toggleQuickReplies: () => void
  toggleInputExpanded: () => void
  closeAllPickers: () => void
  addNotification: (notification: Omit<ToastNotification, 'id' | 'timestamp'>) => void
  removeNotification: (id: string) => void
}

type LiveChatStore = LiveChatState & LiveChatActions

const initialState: LiveChatState = {
  conversations: [],
  selectedId: null,
  currentChat: null,
  messages: [],
  loading: true,
  backendOnline: true,
  filterStatus: null,
  searchQuery: '',
  inputText: '',
  sending: false,
  claiming: false,
  showCustomerPanel: true,
  activeActionMenu: null,
  showTransferDialog: false,
  showCannedPicker: false,
  soundEnabled: true,
  pendingMessages: new Set(),
  failedMessages: new Map(),
  nonRetryableMessages: new Set(),
  hasMoreHistory: true,
  isLoadingHistory: false,
  initialUnreadCount: 0,
  showEmojiPicker: false,
  showStickerPicker: false,
  showQuickReplies: false,
  inputExpanded: false,
  notifications: [],
  liveMessage: '',
}

export const useLiveChatStore = create<LiveChatStore>()(
  devtools(
    (set) => ({
      ...initialState,

      // Data actions (1:1 with reducer cases)
      setConversations: (conversations) => set({ conversations }),
      selectChat: (id) => set({ selectedId: id }),
      setCurrentChat: (chat) => set({ currentChat: chat }),
      setMessages: (messages) => set({ messages }),
      addMessage: (message) => set((s) => ({
        messages: [...s.messages, message],
        liveMessage: message.direction === 'INCOMING'
          ? `ข้อความใหม่จาก ${message.operator_name || s.currentChat?.display_name || 'ผู้ใช้'}`
          : s.liveMessage,
      })),
      prependMessages: (messages) => set((s) => ({ messages: [...messages, ...s.messages] })),
      setLoading: (loading) => set({ loading }),
      setBackendOnline: (online) => set({ backendOnline: online }),
      setFilterStatus: (status) => set({ filterStatus: status }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setInputText: (text) => set((s) => ({
        inputText: text,
        showCannedPicker: text === '/' ? true : text.startsWith('/') ? s.showCannedPicker : false,
      })),
      setSending: (sending) => set({ sending }),
      setClaiming: (claiming) => set({ claiming }),
      setShowCustomerPanel: (show) => set({ showCustomerPanel: show }),
      toggleCustomerPanel: () => set((s) => ({ showCustomerPanel: !s.showCustomerPanel })),
      setActiveActionMenu: (id) => set({ activeActionMenu: id }),
      setShowTransferDialog: (show) => set({ showTransferDialog: show }),
      setShowCannedPicker: (show) => set({ showCannedPicker: show }),
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      addPending: (tempId) => set((s) => {
        const next = new Set(s.pendingMessages)
        next.add(tempId)
        return { pendingMessages: next }
      }),
      removePending: (tempId) => set((s) => {
        const next = new Set(s.pendingMessages)
        next.delete(tempId)
        return { pendingMessages: next }
      }),
      setFailed: (tempId, error, retryable = true) => set((s) => {
        const next = new Map(s.failedMessages)
        next.set(tempId, error)
        const nextNonRetryable = new Set(s.nonRetryableMessages)
        if (retryable) {
          nextNonRetryable.delete(tempId)
        } else {
          nextNonRetryable.add(tempId)
        }
        return { failedMessages: next, nonRetryableMessages: nextNonRetryable }
      }),
      clearFailed: (tempId) => set((s) => {
        const next = new Map(s.failedMessages)
        next.delete(tempId)
        const nextNonRetryable = new Set(s.nonRetryableMessages)
        nextNonRetryable.delete(tempId)
        return { failedMessages: next, nonRetryableMessages: nextNonRetryable }
      }),
      setHasMoreHistory: (hasMore) => set({ hasMoreHistory: hasMore }),
      setIsLoadingHistory: (loading) => set({ isLoadingHistory: loading }),
      markRead: (lineUserId) => set((s) => ({
        conversations: s.conversations.map((c) =>
          c.line_user_id === lineUserId ? { ...c, unread_count: 0 } : c),
      })),

      // UI extension actions
      toggleEmojiPicker: () => set((s) => ({
        showEmojiPicker: !s.showEmojiPicker,
        showStickerPicker: false,
        showQuickReplies: false,
      })),
      toggleStickerPicker: () => set((s) => ({
        showStickerPicker: !s.showStickerPicker,
        showEmojiPicker: false,
        showQuickReplies: false,
      })),
      toggleQuickReplies: () => set((s) => ({
        showQuickReplies: !s.showQuickReplies,
        showEmojiPicker: false,
        showStickerPicker: false,
      })),
      toggleInputExpanded: () => set((s) => ({ inputExpanded: !s.inputExpanded })),
      closeAllPickers: () => set({
        showEmojiPicker: false,
        showStickerPicker: false,
        showQuickReplies: false,
      }),
      addNotification: (notification) => set((s) => ({
        notifications: [...s.notifications, {
          ...notification,
          id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
        }],
      })),
      removeNotification: (id) => set((s) => ({
        notifications: s.notifications.filter((n) => n.id !== id),
      })),
    }),
    { name: 'LiveChatStore' }
  )
)
