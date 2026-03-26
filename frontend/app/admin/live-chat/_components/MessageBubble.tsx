'use client';

import React, { memo } from 'react';
import { AlertCircle, Check, CheckCheck, FileText, RefreshCw } from 'lucide-react';

import type { Message } from '@/lib/websocket/types';

interface MessageBubbleProps {
  message: Message;
  elementId?: string;
  isPending: boolean;
  isFailed: boolean;
  senderLabel: string;
  showSender: boolean;
  showAvatar: boolean;
  incomingAvatar?: string;
  onRetry?: (tempId: string) => void;
}

function getMessageText(message: Message): React.ReactNode {
  if (message.message_type === 'flex') return 'Rich Content';
  try {
    if (message.content.startsWith('{') || message.content.startsWith('[')) {
      const parsed = JSON.parse(message.content);
      return parsed.responses || parsed.Responses || parsed.response || parsed.text || message.content;
    }
  } catch {
    return message.content;
  }
  return message.content;
}

function renderMessageContent(message: Message): React.ReactNode {
  const payload = (message.payload || {}) as Record<string, unknown>;

  if (message.message_type === 'image') {
    const previewUrl = typeof payload.preview_url === 'string' ? payload.preview_url : '';
    const imageUrl = typeof payload.url === 'string' ? payload.url : previewUrl;
    if (imageUrl) {
      return (
        <a href={imageUrl} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Incoming image" className="max-h-48 rounded-lg object-cover" />
        </a>
      );
    }
    return <span>{message.content || '[Image]'}</span>;
  }

  if (message.message_type === 'sticker') {
    const packageId = typeof payload.package_id === 'string' ? payload.package_id : '';
    const stickerId = typeof payload.sticker_id === 'string' ? payload.sticker_id : '';
    return (
      <div className="text-xs">
        Sticker {packageId && stickerId ? `${packageId}/${stickerId}` : ''}
      </div>
    );
  }

  if (message.message_type === 'file') {
    const fileName = typeof payload.file_name === 'string' ? payload.file_name : message.content || 'File';
    const size = typeof payload.size === 'number' ? payload.size : null;
    const url = typeof payload.url === 'string' ? payload.url : '';
    return (
      <div className="flex items-center gap-2 bg-bg p-3 rounded-lg">
        <FileText className="w-4 h-4 flex-shrink-0" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{fileName}</div>
          {size !== null && <div className="text-[11px] opacity-70">{Math.round(size / 1024)} KB</div>}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-brand-600 hover:underline">
              Download
            </a>
          )}
        </div>
      </div>
    );
  }

  return getMessageText(message);
}

export const MessageBubble = memo(function MessageBubble({
  message,
  elementId,
  isPending,
  isFailed,
  senderLabel,
  showSender,
  showAvatar,
  incomingAvatar,
  onRetry,
}: MessageBubbleProps) {
  const incoming = message.direction === 'INCOMING';
  const isAdmin = !incoming;
  const isBot = message.sender_role === 'BOT';

  return (
    <div
      id={elementId}
      className={`flex items-end gap-2 px-4 ${incoming ? 'justify-start msg-in' : 'justify-end msg-out flex-row-reverse'}`}
    >
      {/* Avatar (Outside Bubble) */}
      {!isAdmin && (
        showAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={incomingAvatar}
            className="w-7 h-7 rounded-full object-cover flex-shrink-0 bg-bg"
            alt={senderLabel}
          />
        ) : <div className="w-7 flex-shrink-0" />
      )}

      <div className={`flex flex-col max-w-[65%] gap-0.5 ${isAdmin ? 'items-end' : 'items-start'}`}>
        {/* Sender Name (Top) */}
        {showSender && !isAdmin && (
          <span className="px-1 text-[10px] font-medium text-text-tertiary">
            {senderLabel}
          </span>
        )}

        {/* Message Bubble */}
        <div
          className={`relative px-4 py-2.5 text-sm leading-relaxed rounded-2xl shadow-sm ${incoming
              ? 'rounded-tl-sm bg-surface border border-border-default text-text-primary'
              : isBot
                ? 'rounded-tr-sm bg-bg border border-border-subtle text-text-primary'
                : 'rounded-tr-sm gradient-active text-white shadow-md shadow-brand-900/20'
            }`}
        >
          {renderMessageContent(message)}
        </div>

        {/* Timestamp & Status (Bottom) */}
        <div className="flex items-center gap-1 px-1">
          <span className="text-[10px] text-text-tertiary">
            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {isAdmin && (
            <div className="flex items-center gap-1">
              {isPending && <RefreshCw className="w-3 h-3 text-text-tertiary animate-spin" />}
              {isFailed && (
                <button
                  onClick={() => message.temp_id && onRetry?.(message.temp_id)}
                  title="Retry"
                >
                  <AlertCircle className="w-3 h-3 text-danger" />
                </button>
              )}
              {!isPending && !isFailed && (
                <span className={message.id ? "text-brand-600" : "text-text-tertiary"}>
                  {message.id ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
