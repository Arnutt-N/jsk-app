'use client';

import React, { memo } from 'react';
import { AlertCircle, Check, CheckCheck, FileText, LayoutTemplate, MapPin, RefreshCw } from 'lucide-react';

import type { Message } from '@/lib/websocket/types';

interface MessageBubbleProps {
  message: Message;
  elementId?: string;
  isPending: boolean;
  isFailed: boolean;
  formattedTime: string;
  senderLabel: string;
  showSender: boolean;
  showAvatar: boolean;
  incomingAvatar?: string;
  onRetry?: (tempId: string) => void;
  isNew?: boolean;
}

function getMessageText(message: Message): React.ReactNode {
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
          <img src={imageUrl} alt="Incoming image" className="max-h-48 rounded-lg object-cover outline outline-1 -outline-offset-1 outline-black/5" />
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

  if (message.message_type === 'video') {
    const url = typeof payload.url === 'string' ? payload.url : '';
    if (url) {
      return (
        <video controls src={url} className="max-h-48 max-w-full rounded-lg outline outline-1 -outline-offset-1 outline-black/5" />
      );
    }
    return <span>{message.content || '[Video]'}</span>;
  }

  if (message.message_type === 'audio') {
    const url = typeof payload.url === 'string' ? payload.url : '';
    if (url) {
      return (
        <audio controls src={url} className="max-w-full" />
      );
    }
    return <span>{message.content || '[Audio]'}</span>;
  }

  if (message.message_type === 'location') {
    const lat = typeof payload.lat === 'number' ? payload.lat : null;
    const lng = typeof payload.lng === 'number' ? payload.lng : null;
    const label = message.content || '[Location]';
    if (lat !== null && lng !== null) {
      return (
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 underline underline-offset-2"
        >
          <MapPin className="w-4 h-4 shrink-0" aria-hidden />
          {label}
        </a>
      );
    }
    return <span>{label}</span>;
  }

  if (
    message.message_type === 'flex' ||
    message.message_type === 'template' ||
    message.message_type === 'imagemap'
  ) {
    return (
      <span className="flex items-center gap-1.5">
        <LayoutTemplate className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
        {message.content || 'Rich Content'}
      </span>
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
  formattedTime,
  senderLabel,
  showSender,
  showAvatar,
  incomingAvatar,
  onRetry,
  isNew,
}: MessageBubbleProps) {
  const incoming = message.direction === 'INCOMING';
  const isAdmin = !incoming;
  const isBot = message.sender_role === 'BOT';

  return (
    <div
      id={elementId}
      className={`flex items-end gap-2 px-4 ${incoming ? 'justify-start' : 'justify-end'} ${isNew ? (incoming ? 'msg-in' : 'msg-out') : ''}`}
    >
      {/* Avatar (Outside Bubble) */}
      {!isAdmin && (
        showAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={incomingAvatar}
            className="w-7 h-7 rounded-full object-cover flex-shrink-0 bg-bg outline outline-1 -outline-offset-1 outline-black/10"
            alt={senderLabel}
          />
        ) : <div className="w-7 flex-shrink-0" />
      )}

      <div className={`flex flex-col max-w-[65%] gap-0.5 ${isAdmin ? 'items-end' : 'items-start'}`}>
        {/* Sender label (top): who sent this — the customer's name, "บอท", or the
            operator's name. Shown once per consecutive same-sender group
            (showSender). Operator names use the brand accent so a human reply is
            visually distinct from the bot and the customer. */}
        {showSender && (
          <span className={`px-1 text-[10px] font-medium thai-no-break ${isAdmin && !isBot ? 'text-brand-600' : 'text-text-tertiary'}`}>
            {senderLabel}
          </span>
        )}

        {/* Message Bubble */}
        <div
          className={`relative px-4 py-2.5 text-sm leading-relaxed rounded-2xl shadow-sm break-words whitespace-pre-wrap ${incoming
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
          <span className="text-[10px] text-text-tertiary tabular-nums">
            {formattedTime}
          </span>
          {isAdmin && (
            <div className="flex items-center gap-1">
              {isPending && <RefreshCw className="w-3 h-3 text-text-tertiary animate-spin" />}
              {isFailed && (
                onRetry ? (
                  <button
                    onClick={() => message.temp_id && onRetry(message.temp_id)}
                    title="ส่งอีกครั้ง"
                  >
                    <AlertCircle className="w-3 h-3 text-danger" />
                  </button>
                ) : (
                  // Non-retryable failure: the message may already have reached
                  // the customer, so no retry affordance is offered.
                  <span title="ไม่สามารถส่งซ้ำได้ — ข้อความอาจถูกส่งถึงลูกค้าแล้ว">
                    <AlertCircle className="w-3 h-3 text-danger" />
                  </span>
                )
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
