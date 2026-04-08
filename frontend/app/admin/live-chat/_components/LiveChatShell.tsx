'use client';

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

import { useLiveChatStore } from '../_store/liveChatStore';
import { useLiveChatContext } from '../_context/LiveChatContext';
import { ChatArea } from './ChatArea';
import { ConversationList } from './ConversationList';
import { CustomerPanel } from './CustomerPanel';
import { NotificationToast } from './NotificationToast';
import { TransferDialog } from './TransferDialog';

export function LiveChatShell() {
  // Read state from Zustand
  const selectedId = useLiveChatStore((s) => s.selectedId);
  const currentChat = useLiveChatStore((s) => s.currentChat);
  const showCustomerPanel = useLiveChatStore((s) => s.showCustomerPanel);
  const showTransferDialog = useLiveChatStore((s) => s.showTransferDialog);
  const backendOnline = useLiveChatStore((s) => s.backendOnline);

  // API methods from Context
  const {
    isMobileView,
    fetchConversations,
    setShowTransferDialog,
    transferSession,
    setShowCustomerPanel,
  } = useLiveChatContext();

  return (
    <>
      {/* Toast notifications */}
      <NotificationToast />

      {/* Connection lost — floating banner visible regardless of chat selection */}
      {!backendOnline && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] thai-text">
          <div className="bg-surface border border-danger/30 px-5 py-2.5 rounded-2xl shadow-xl flex items-center gap-3 text-sm font-medium backdrop-blur-md">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-danger" />
            </span>
            <span className="text-text-secondary thai-no-break">ขาดการเชื่อมต่อกับเซิร์ฟเวอร์</span>
            <button
              onClick={fetchConversations}
              className="ml-1 px-3 py-1 text-xs font-semibold rounded-lg bg-danger/10 hover:bg-danger/20 text-danger transition-colors cursor-pointer"
              aria-label="ลองเชื่อมต่อใหม่"
            >
              ลองใหม่
            </button>
          </div>
        </div>
      )}

      {/* 3-Column Layout: Conversation List (dark) | Chat Area (light) | Customer Panel (optional) */}
      <div className="flex h-screen w-full bg-bg overflow-hidden font-sans">
        {/* Column 1: Conversation List - Dark sidebar, fixed 320px width */}
        {(!isMobileView || !selectedId) && <ConversationList />}

        {/* Column 2: Chat Area - Light content, flexible width */}
        {(!isMobileView || selectedId) && <ChatArea />}
        
        {/* Column 3: Customer Profile Panel - Light, fixed 320px width, conditional */}
        {selectedId && showCustomerPanel && (
          <div
            className={isMobileView ? 'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm' : 'hidden md:flex'}
            onClick={isMobileView ? () => setShowCustomerPanel(false) : undefined}
          >
            <div
              className={isMobileView ? 'absolute right-0 top-0 h-full w-[88%] max-w-sm' : 'h-full'}
              onClick={isMobileView ? (e) => e.stopPropagation() : undefined}
            >
              <CustomerPanel currentChat={currentChat} onClose={() => setShowCustomerPanel(false)} />
            </div>
          </div>
        )}
        <TransferDialog
          open={showTransferDialog}
          onClose={() => setShowTransferDialog(false)}
          onTransfer={transferSession}
        />
      </div>
    </>
  );
}
