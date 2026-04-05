'use client';

import React from 'react';
import Image from 'next/image';
import { Bell, Calendar, Clock, Copy, ExternalLink, MessageSquare, RefreshCw, Star, Trash2, User, X } from 'lucide-react';

import type { CurrentChat } from '../_types';
import { useAuth } from '@/contexts/AuthContext';
import { useLiveChatContext } from '../_context/LiveChatContext';

export function CustomerPanel({
  currentChat,
  onClose,
}: {
  currentChat: CurrentChat | null;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const { fetchChatDetail, fetchConversations } = useLiveChatContext();
  const [refreshing, setRefreshing] = React.useState(false);
  if (!currentChat) return null;

  const encodedLineUserId = encodeURIComponent(currentChat.line_user_id);
  const exportCsvUrl = `/api/v1/admin/export/conversations/${encodedLineUserId}/csv`;
  const exportPdfUrl = `/api/v1/admin/export/conversations/${encodedLineUserId}/pdf`;
  const isActive = currentChat.session?.status === 'ACTIVE';
  const isWaiting = currentChat.session?.status === 'WAITING';

  const downloadExport = async (url: string, fallbackName: string) => {
    try {
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || fallbackName;
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error(error);
    }
  };

  const refreshProfile = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/v1/admin/live-chat/conversations/${encodedLineUserId}/refresh-profile`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`);
      }
      await Promise.all([
        fetchChatDetail(currentChat.line_user_id),
        fetchConversations(),
      ]);
    } catch (error) {
      console.error(error);
    } finally {
      setRefreshing(false);
    }
  };

  const copyLineId = () => {
    navigator.clipboard.writeText(currentChat.line_user_id);
  };

  return (
    <aside className="w-72 bg-surface border-l border-border-default flex flex-col flex-shrink-0 z-20 thai-text">
      {/* Header */}
      <div className="h-20 px-4 border-b border-border-default flex items-center justify-between">
        <span className="font-bold text-slate-800 text-xs tracking-widest uppercase">Customer Info</span>
        <button onClick={onClose} className="p-1.5 text-text-tertiary hover:text-text-primary rounded-lg hover:bg-gray-100 transition-colors" aria-label="Close customer panel">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Profile section */}
      <div className="p-5 border-b border-border-default text-center">
        <div className="relative inline-block">
          <Image src={currentChat.picture_url} width={80} height={80} className="w-20 h-20 rounded-full object-cover mx-auto ring-4 ring-surface shadow-md" alt={currentChat.display_name} />
          <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${isActive ? 'bg-online' : isWaiting ? 'bg-away' : 'bg-offline'}`} />
        </div>
        <p className="font-semibold text-text-primary text-sm mt-3 thai-no-break">{currentChat.display_name}</p>
        <div className="flex items-center justify-center gap-2 mt-1.5">
          <button
            onClick={refreshProfile}
            disabled={refreshing}
            className="text-xs text-text-tertiary hover:text-brand-600 flex items-center gap-1 disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <span className="text-text-tertiary">·</span>
          <button className="text-xs text-brand-600 hover:underline flex items-center gap-1">
            View Profile <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        {/* Action icon row */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={copyLineId}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-50 hover:bg-brand-50 text-text-tertiary hover:text-brand-600 border border-border-default transition-all"
            aria-label="Copy LINE ID"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-50 hover:bg-brand-50 text-text-tertiary hover:text-brand-600 border border-border-default transition-all"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <button
            className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-50 hover:bg-amber-50 text-text-tertiary hover:text-amber-500 border border-border-default transition-all"
            aria-label="Mark as VIP"
          >
            <Star className="w-4 h-4" />
          </button>
        </div>

        {/* Tags */}
        {!!currentChat.tags?.length && (
          <div className="mt-3 flex items-center justify-center gap-1.5 flex-wrap">
            {currentChat.tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white thai-no-break"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-gray-50 rounded-xl p-2.5">
            <MessageSquare className="w-3.5 h-3.5 text-text-tertiary mx-auto mb-1" />
            <div className="text-sm font-bold text-text-primary">N/A</div>
            <div className="text-[10px] text-text-tertiary">Chats</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-2.5">
            <Star className="w-3.5 h-3.5 text-text-tertiary mx-auto mb-1" />
            <div className="text-sm font-bold text-text-primary">N/A</div>
            <div className="text-[10px] text-text-tertiary">Rating</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-2.5">
            <Calendar className="w-3.5 h-3.5 text-text-tertiary mx-auto mb-1" />
            <div className="text-sm font-bold text-text-primary">N/A</div>
            <div className="text-[10px] text-text-tertiary">Joined</div>
          </div>
        </div>
      </div>

      {/* Details section */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {/* LINE ID */}
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-[10px] text-text-tertiary font-semibold mb-1.5 uppercase tracking-wider">LINE ID</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-text-secondary font-mono truncate flex-1">{currentChat.line_user_id}</p>
            <button onClick={copyLineId} className="p-1 text-text-tertiary hover:text-brand-600 rounded transition-colors" aria-label="Copy LINE ID">
              <Copy className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Session Status */}
        <div className="bg-gray-50 rounded-xl p-3 flex justify-between items-center">
          <span className="text-xs text-text-tertiary">Session</span>
          <span className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${
            isActive ? 'bg-online/15 text-online' : isWaiting ? 'bg-away/15 text-away' : 'bg-gray-100 text-text-tertiary'
          }`}>
            {currentChat.session?.status || 'None'}
          </span>
        </div>

        {/* Activity */}
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <p className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wider">Activity</p>
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Clock className="w-3.5 h-3.5 text-text-tertiary" />
            <span>Last active: {currentChat.session?.started_at ? new Date(currentChat.session.started_at).toLocaleDateString() : 'N/A'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <User className="w-3.5 h-3.5 text-text-tertiary" />
            <span>Agent: {currentChat.session?.operator_id ? `Operator #${currentChat.session.operator_id}` : 'Unassigned'}</span>
          </div>
        </div>

        {/* Internal Notes */}
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <p className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wider">Internal Notes</p>
          <textarea
            placeholder="Add notes about this customer..."
            className="w-full text-xs bg-white border border-border-default rounded-lg px-3 py-2 text-text-primary placeholder:text-text-tertiary outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
            rows={3}
          />
        </div>

        {/* Export */}
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <p className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wider">Export</p>
          <div className="flex gap-2">
            <button
              onClick={() => downloadExport(exportCsvUrl, `${currentChat.line_user_id}.csv`)}
              className="flex-1 text-center text-xs px-2 py-2 rounded-lg border border-border-default bg-white hover:bg-gray-50 text-text-secondary transition-colors"
            >
              CSV
            </button>
            <button
              onClick={() => downloadExport(exportPdfUrl, `${currentChat.line_user_id}.pdf`)}
              className="flex-1 text-center text-xs px-2 py-2 rounded-lg border border-border-default bg-white hover:bg-gray-50 text-text-secondary transition-colors"
            >
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border-default">
        <button className="w-full py-2.5 text-xs font-medium text-text-tertiary hover:text-danger hover:bg-danger/8 rounded-xl border border-border-default hover:border-danger/20 flex items-center justify-center gap-1.5 transition-all">
          <Trash2 className="w-4 h-4" />Delete Conversation
        </button>
      </div>
    </aside>
  );
}
