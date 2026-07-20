'use client';

import React from 'react';
import Image from 'next/image';
import { Check, Clock, Copy, RefreshCw, User, X } from 'lucide-react';

import type { CurrentChat } from '../_types';
import { useLiveChatContext } from '../_context/LiveChatContext';
import { useCustomerNotes } from '@/hooks/useCustomerNotes';
import { PRESENCE_DOT_CLASS, PRESENCE_LABEL, getSessionPresence } from '@/lib/constants/live-chat-presence';
import { logger } from '@/lib/logger';

export function CustomerPanel({
  currentChat,
  onClose,
}: {
  currentChat: CurrentChat | null;
  onClose: () => void;
}) {
  const { fetchChatDetail, fetchConversations } = useLiveChatContext();
  const [refreshing, setRefreshing] = React.useState(false);
  // Hooks must run unconditionally — call before the early return with a
  // nullable id (the hook no-ops persistence when no conversation is selected).
  const { notes, setNotes, saved } = useCustomerNotes(currentChat?.line_user_id ?? null);
  if (!currentChat) return null;

  const encodedLineUserId = encodeURIComponent(currentChat.line_user_id);
  const exportCsvUrl = `/api/v1/admin/export/conversations/${encodedLineUserId}/csv`;
  const exportPdfUrl = `/api/v1/admin/export/conversations/${encodedLineUserId}/pdf`;
  const isActive = currentChat.session?.status === 'ACTIVE';
  const isWaiting = currentChat.session?.status === 'WAITING';
  const presence = getSessionPresence(currentChat.session?.status);

  const downloadExport = async (url: string, fallbackName: string) => {
    try {
      const response = await fetch(url);
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
      logger.error(error);
    }
  };

  const refreshProfile = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/v1/admin/live-chat/conversations/${encodedLineUserId}/refresh-profile`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`);
      }
      await Promise.all([
        fetchChatDetail(currentChat.line_user_id),
        fetchConversations(),
      ]);
    } catch (error) {
      logger.error(error);
    } finally {
      setRefreshing(false);
    }
  };

  const copyLineId = () => {
    navigator.clipboard.writeText(currentChat.line_user_id);
  };

  return (
    <aside className="w-72 h-full min-h-0 bg-surface border-l border-border-default flex flex-col flex-shrink-0 z-20 thai-text">
      {/* Header */}
      <div className="h-20 px-4 border-b border-border-default flex items-center justify-between">
        <span id="customer-panel-title" className="font-bold text-text-primary text-xs tracking-widest uppercase">Customer Info</span>
        <button onClick={onClose} className="p-1.5 text-text-tertiary hover:text-text-primary rounded-lg hover:bg-muted transition-colors focus-ring" aria-label="Close customer panel">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Profile section */}
      <div className="p-5 border-b border-border-default text-center">
        <div className="relative inline-block">
          {currentChat.picture_url ? (
            <Image src={currentChat.picture_url} width={80} height={80} className="w-20 h-20 rounded-full object-cover mx-auto ring-4 ring-surface shadow-md" alt={currentChat.display_name} />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center text-white text-2xl font-bold mx-auto ring-4 ring-surface shadow-md">
              {currentChat.display_name?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
          {/* bottom-1/right-1 keeps the dot on the circumference of the larger
              80px avatar (bottom-0/right-0 lands outside a circle this big). */}
          <div aria-hidden="true" className={`absolute bottom-1 right-1 h-3 w-3 rounded-full ring-2 ring-surface ${PRESENCE_DOT_CLASS[presence]}`} />
          <span className="sr-only">{PRESENCE_LABEL[presence]}</span>
        </div>
        <p className="font-semibold text-text-primary text-sm mt-3 thai-no-break break-words">{currentChat.display_name}</p>
        <div className="flex items-center justify-center gap-2 mt-1.5">
          <button
            onClick={refreshProfile}
            disabled={refreshing}
            className="text-xs text-text-tertiary hover:text-brand-600 flex items-center gap-1 disabled:opacity-60 transition-colors focus-ring"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Action icon row */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={copyLineId}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-muted hover:bg-brand-50 text-text-tertiary hover:text-brand-600 border border-border-default transition-all focus-ring"
            aria-label="Copy LINE ID"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>

        {/* Tags */}
        {!!currentChat.tags?.length && (
          <div className="mt-3 flex items-center justify-center gap-1.5 flex-wrap">
            {currentChat.tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium text-white thai-no-break"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Details section */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {/* LINE ID */}
        <div className="bg-muted rounded-xl p-3">
          <p className="text-2xs text-text-tertiary font-semibold mb-1.5 uppercase tracking-wider">LINE ID</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-text-secondary font-mono truncate break-words flex-1">{currentChat.line_user_id}</p>
            <button onClick={copyLineId} className="p-1 text-text-tertiary hover:text-brand-600 rounded transition-colors focus-ring" aria-label="Copy LINE ID">
              <Copy className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Session Status */}
        <div className="bg-muted rounded-xl p-3 flex justify-between items-center">
          <span className="text-xs text-text-tertiary">Session</span>
          <span className={`px-2 py-1 rounded-lg text-2xs font-semibold ${
            isActive ? 'bg-online/15 text-emerald-700 dark:text-emerald-400' : isWaiting ? 'bg-away/15 text-amber-700 dark:text-amber-400' : 'bg-muted text-text-secondary'
          }`}>
            {currentChat.session?.status || 'None'}
          </span>
        </div>

        {/* Activity */}
        <div className="bg-muted rounded-xl p-3 space-y-2">
          <p className="text-2xs text-text-tertiary font-semibold uppercase tracking-wider">Activity</p>
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Clock className="w-3.5 h-3.5 text-text-tertiary" />
            <span>Last active: {currentChat.session?.started_at ? new Date(currentChat.session.started_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <User className="w-3.5 h-3.5 text-text-tertiary" />
            <span>Agent: {currentChat.session?.operator_id ? `Operator #${currentChat.session.operator_id}` : 'Unassigned'}</span>
          </div>
        </div>

        {/* Internal Notes */}
        <div className="bg-surface border border-border-default rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="customer-notes" className="text-2xs text-text-tertiary font-semibold uppercase tracking-wider thai-text">โน้ตภายใน</label>
            <span role="status" aria-live="polite" aria-atomic="true" className="flex items-center gap-1 text-2xs text-text-tertiary thai-text">
              {(notes.length > 0 || !saved) &&
                (saved ? (
                  <>
                    <Check className="w-3 h-3 text-online" aria-hidden="true" />
                    บันทึกแล้ว
                  </>
                ) : (
                  'กำลังบันทึก…'
                ))}
            </span>
          </div>
          <textarea
            id="customer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="พิมพ์โน้ตเกี่ยวกับลูกค้า…"
            className="w-full text-xs bg-bg border border-border-default rounded-lg px-3 py-2 text-text-primary placeholder:text-text-tertiary resize-none focus-ring"
            rows={3}
          />
        </div>

        {/* Export */}
        <div className="bg-surface border border-border-default rounded-xl p-3 space-y-2">
          <p className="text-2xs text-text-tertiary font-semibold uppercase tracking-wider">Export</p>
          <div className="flex gap-2">
            <button
              onClick={() => downloadExport(exportCsvUrl, `${currentChat.line_user_id}.csv`)}
              className="flex-1 text-center text-xs px-2 py-2 rounded-lg border border-border-default bg-surface hover:bg-muted text-text-secondary transition-colors focus-ring"
            >
              CSV
            </button>
            <button
              onClick={() => downloadExport(exportPdfUrl, `${currentChat.line_user_id}.pdf`)}
              className="flex-1 text-center text-xs px-2 py-2 rounded-lg border border-border-default bg-surface hover:bg-muted text-text-secondary transition-colors focus-ring"
            >
              PDF
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
