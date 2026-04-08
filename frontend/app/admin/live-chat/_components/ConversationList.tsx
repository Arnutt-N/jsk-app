'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Archive, Home, Inbox, LogOut, MessageSquarePlus, Search, Users } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useLiveChatStore } from '../_store/liveChatStore';
import { useConversations } from '../_hooks/useConversations';
import { useLiveChatContext } from '../_context/LiveChatContext';
import { ConversationItem } from './ConversationItem';
import { CreateChatSheet } from './CreateChatSheet';

interface SearchMessageResult {
  id: number;
  line_user_id: string;
  display_name?: string | null;
  content: string;
  direction: 'INCOMING' | 'OUTGOING';
  sender_role?: 'USER' | 'BOT' | 'ADMIN' | null;
  created_at?: string | null;
}

export function ConversationList() {
  // Read state from Zustand
  const conversations = useLiveChatStore((s) => s.conversations);
  const selectedId = useLiveChatStore((s) => s.selectedId);
  const searchQuery = useLiveChatStore((s) => s.searchQuery);
  const filterStatus = useLiveChatStore((s) => s.filterStatus);
  const loading = useLiveChatStore((s) => s.loading);
  const activeActionMenu = useLiveChatStore((s) => s.activeActionMenu);
  const setSearchQuery = useLiveChatStore((s) => s.setSearchQuery);
  const setFilterStatus = useLiveChatStore((s) => s.setFilterStatus);
  const setActiveActionMenu = useLiveChatStore((s) => s.setActiveActionMenu);

  // Auth context
  const { token, logout } = useAuth();

  // API methods from Context
  const { formatTime, selectConversation, jumpToMessage, fetchConversations } = useLiveChatContext();

  const { filtered, waitingCount, activeCount } = useConversations(conversations, searchQuery);

  // Apply filter chip selection to the search-filtered list
  const filteredConversations = useMemo(() => {
    if (!filterStatus) return filtered;
    return filtered.filter((c) => {
      const status = c.session?.status || 'CLOSED';
      return status === filterStatus;
    });
  }, [filtered, filterStatus]);

  const selectedIndex = filteredConversations.findIndex((c) => c.line_user_id === selectedId);
  const selectedConversation = selectedIndex >= 0 ? filteredConversations[selectedIndex] : null;
  const [searchResults, setSearchResults] = React.useState<SearchMessageResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [showCreateChat, setShowCreateChat] = React.useState(false);
  const [archiving, setArchiving] = React.useState<string | null>(null);
  const closedCount = conversations.filter((c) => !c.session || c.session.status === 'CLOSED').length;

  // Archive (ซ่อน) conversation ที่ปิดแล้ว
  const handleArchive = React.useCallback(async (lineUserId: string) => {
    if (!token) return;
    setArchiving(lineUserId);
    try {
      const res = await fetch(`/api/v1/admin/live-chat/conversations/${encodeURIComponent(lineUserId)}/archive`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await fetchConversations();
      }
    } catch (err) {
      console.error('Archive failed:', err);
    } finally {
      setArchiving(null);
    }
  }, [token, fetchConversations]);

  React.useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/v1/admin/live-chat/messages/search?q=${encodeURIComponent(q)}&limit=10`);
        if (!res.ok) return;
        const data = await res.json();
        setSearchResults(data.items || []);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const filterButtons = [
    { key: null, label: 'All', count: conversations.length },
    { key: 'WAITING', label: 'Waiting', count: waitingCount },
    { key: 'ACTIVE', label: 'Active', count: activeCount },
  ] as const;

  return (
    <aside className="w-full md:w-80 bg-sidebar-bg text-sidebar-fg relative overflow-hidden flex flex-col flex-shrink-0 border-r border-white/10 thai-text">
      <div className="absolute inset-0 bg-gradient-to-b from-sidebar-bg via-sidebar-accent to-sidebar-border opacity-100 pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay pointer-events-none" />

      <div className="relative z-10 flex h-full flex-col">
      {/* Header */}
      <div className="h-20 px-4 border-b border-white/10 flex items-center gap-3">
        <Link
          href="/admin"
          className="w-10 h-10 rounded-2xl gradient-active flex items-center justify-center text-white shadow-lg shadow-brand-500/20 ring-4 ring-brand-500/10 hover:shadow-brand-500/30 transition-shadow flex-shrink-0"
          aria-label="Back to admin dashboard"
        >
          <Home className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-bold text-base tracking-wide">Live Chat</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[9px] font-semibold text-green-400">
              <Users className="w-2.5 h-2.5" />
              {activeCount} online
            </span>
          </div>
        </div>
        <button
          onClick={() => setShowCreateChat(true)}
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all flex-shrink-0"
          aria-label="เริ่มแชทใหม่"
          title="เริ่มแชทใหม่"
        >
          <MessageSquarePlus className="w-5 h-5" />
        </button>
        <button
          onClick={() => logout()}
          className="w-10 h-10 rounded-xl bg-white/10 hover:bg-red-500/30 flex items-center justify-center text-sidebar-text-muted hover:text-white transition-all flex-shrink-0"
          aria-label="ออกจากระบบ"
          title="ออกจากระบบ"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Search + Filter */}
      <div className="px-3 py-3 space-y-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sidebar-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-10 pr-3 py-2 bg-white/5 border border-white/10 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/40 placeholder:text-sidebar-text-muted transition-all thai-no-break"
            aria-label="Search conversations"
          />
        </div>
        <div className="flex gap-1.5">
          {filterButtons.map((btn) => (
            <button
              key={btn.key ?? 'all'}
              className={`flex-1 py-1.5 px-2 text-[11px] font-semibold rounded-lg transition-all ${
                filterStatus === btn.key
                  ? 'gradient-active text-white shadow-lg shadow-brand-900/30'
                  : 'bg-white/5 text-sidebar-text-muted hover:text-white'
              }`}
              onClick={() => setFilterStatus(btn.key)}
            >
              <span className="flex items-center justify-center gap-1">
                {btn.label}
                <span className={`min-w-[16px] h-4 px-1 text-[10px] rounded-full inline-flex items-center justify-center ${
                  filterStatus === btn.key ? 'bg-white/20' : 'bg-white/10'
                }`}>
                  {btn.count}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation list */}
      <div
        className="flex-1 overflow-y-auto custom-scrollbar px-2"
        role="listbox"
        aria-label="Conversation list"
        aria-activedescendant={selectedConversation ? `conversation-option-${selectedConversation.line_user_id}` : undefined}
        tabIndex={0}
        onKeyDown={(event) => {
          if (!filteredConversations.length) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            const next = Math.min((selectedIndex < 0 ? -1 : selectedIndex) + 1, filteredConversations.length - 1);
            selectConversation(filteredConversations[next].line_user_id);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            const next = Math.max((selectedIndex < 0 ? 0 : selectedIndex) - 1, 0);
            selectConversation(filteredConversations[next].line_user_id);
          } else if (event.key === 'Enter' && selectedIndex >= 0) {
            event.preventDefault();
            selectConversation(filteredConversations[selectedIndex].line_user_id);
          }
        }}
      >
        {/* Search results */}
        {searchQuery.trim() && (
          <div className="px-1 pt-2 pb-1">
            <div className="px-2 py-1 text-[10px] tracking-wide text-sidebar-text-muted font-semibold uppercase">
              Message Search
            </div>
            {searching && <div className="px-2 py-2 text-xs text-sidebar-text-muted">Searching...</div>}
            {!searching && searchResults.length === 0 && (
              <div className="px-2 py-2 text-xs text-sidebar-text-muted">No matching messages</div>
            )}
            {!searching && searchResults.length > 0 && (
              <div className="space-y-1 mb-2">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => jumpToMessage(result.line_user_id, result.id)}
                    className="w-full text-left p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                  >
                    <div className="text-[11px] text-white font-medium truncate">
                      {result.display_name || result.line_user_id}
                    </div>
                    <div className="text-[11px] text-sidebar-text-muted truncate">{result.content}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Loading skeletons */}
        {loading && conversations.length === 0 ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 p-3 bg-muted rounded-xl animate-pulse">
                <div className="w-10 h-10 bg-muted rounded-full" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 bg-muted rounded w-2/3" />
                  <div className="h-2.5 bg-muted/50 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-60">
            <Inbox className="w-10 h-10 text-sidebar-text-muted mb-3" />
            <span className="text-sidebar-text-muted text-sm">No conversations</span>
          </div>
        ) : (
          <div className="space-y-1 py-2">
            {filteredConversations.map((conversation) => {
              const isClosed = !conversation.session || conversation.session.status === 'CLOSED';
              const isArchiving = archiving === conversation.line_user_id;

              return (
                <div key={conversation.line_user_id} className="relative group/conv">
                  <ConversationItem
                    optionId={`conversation-option-${conversation.line_user_id}`}
                    conversation={conversation}
                    selected={selectedId === conversation.line_user_id}
                    formattedTime={conversation.last_message?.created_at ? formatTime(conversation.last_message.created_at) : undefined}
                    onClick={() => {
                      selectConversation(conversation.line_user_id);
                      setActiveActionMenu(null);
                    }}
                    onMenuClick={() => setActiveActionMenu(activeActionMenu === conversation.line_user_id ? null : conversation.line_user_id)}
                  />
                  {/* ปุ่ม Archive สำหรับ session ที่ปิดแล้ว */}
                  {isClosed && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleArchive(conversation.line_user_id);
                      }}
                      disabled={isArchiving}
                      className="absolute top-2 right-10 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sidebar-text-muted hover:text-white opacity-0 group-hover/conv:opacity-100 transition-all disabled:opacity-50"
                      aria-label={`Archive ${conversation.display_name}`}
                      title="Archive"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary bar */}
      <div className="px-4 py-2.5 border-t border-white/10 bg-black/20 text-[11px] text-sidebar-fg/80 flex items-center justify-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-online" />
          {activeCount} active
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-away" />
          {waitingCount} waiting
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-offline" />
          <span className="text-sidebar-text-muted">{closedCount} offline</span>
        </span>
      </div>
      </div>

      {/* Sheet สำหรับสร้างแชทใหม่ */}
      <CreateChatSheet
        isOpen={showCreateChat}
        onClose={() => setShowCreateChat(false)}
        onCreated={() => {
          setShowCreateChat(false);
          fetchConversations();
        }}
      />
    </aside>
  );
}
