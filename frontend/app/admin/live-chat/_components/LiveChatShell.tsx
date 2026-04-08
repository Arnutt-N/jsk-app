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

      {/* Connection lost is now shown inline in ChatArea */}

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
