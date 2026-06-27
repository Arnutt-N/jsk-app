'use client';

import React from 'react';

import { useLiveChatStore } from '../_store/liveChatStore';
import { useLiveChatContext } from '../_context/LiveChatContext';
import { ChatArea } from './ChatArea';
import { ConversationList } from './ConversationList';
import { CustomerPanel } from './CustomerPanel';
import { NotificationToast } from './NotificationToast';
import { MobileDrawer } from './MobileDrawer';
import { TransferDialog } from './TransferDialog';
import { useOperatorRoster } from '../_hooks/useOperatorRoster';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { PanelErrorFallback } from './PanelErrorFallback';

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
    currentUserId,
    onlineOperators,
  } = useLiveChatContext();

  // Operator roster for the Transfer picker — lazily fetched while the dialog is
  // open, merging live presence (online/away) with the offline workload roster.
  const { operators: rosterOperators, loading: rosterLoading } = useOperatorRoster(
    onlineOperators,
    currentUserId,
    showTransferDialog,
  );

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
        {(!isMobileView || !selectedId) && (
          <ErrorBoundary fallback={(_e, reset) => (
            <aside className="w-full md:w-80 flex-shrink-0 border-r border-white/10 bg-sidebar-bg flex flex-col">
              <PanelErrorFallback label="รายการแชท" reset={reset} />
            </aside>
          )}>
            <ConversationList />
          </ErrorBoundary>
        )}

        {/* Column 2: Chat Area - Light content, flexible width */}
        {(!isMobileView || selectedId) && (
          <ErrorBoundary fallback={(_e, reset) => <PanelErrorFallback label="หน้าต่างแชท" reset={reset} />}>
            <ChatArea />
          </ErrorBoundary>
        )}

        {/* Column 3: Customer Profile Panel - Light, fixed 320px width, conditional */}
        {selectedId && showCustomerPanel && (
          isMobileView ? (
            <MobileDrawer open onClose={() => setShowCustomerPanel(false)} titleId="customer-panel-title">
              <ErrorBoundary fallback={(_e, reset) => <PanelErrorFallback label="ข้อมูลลูกค้า" reset={reset} />}>
                <CustomerPanel currentChat={currentChat} onClose={() => setShowCustomerPanel(false)} />
              </ErrorBoundary>
            </MobileDrawer>
          ) : (
            <div className="hidden md:flex">
              <div className="h-full">
                <ErrorBoundary fallback={(_e, reset) => <PanelErrorFallback label="ข้อมูลลูกค้า" reset={reset} />}>
                  <CustomerPanel currentChat={currentChat} onClose={() => setShowCustomerPanel(false)} />
                </ErrorBoundary>
              </div>
            </div>
          )
        )}
        <TransferDialog
          open={showTransferDialog}
          onClose={() => setShowTransferDialog(false)}
          onTransfer={transferSession}
          operators={rosterOperators}
          loading={rosterLoading}
        />
      </div>
    </>
  );
}
