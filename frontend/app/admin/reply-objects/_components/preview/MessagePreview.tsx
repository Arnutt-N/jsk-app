/**
 * MessagePreview — LINE-fidelity live preview for the Reply Objects editor.
 *
 * Picks the right renderer for the object type, draws an incoming chat bubble
 * frame, and renders the optional quick-reply chips below the message. Every
 * access is guarded so a partial / in-progress payload never throws.
 */
import type { CSSProperties, ReactNode } from 'react';
import { LineFlexRenderer } from './LineFlexRenderer';
import { LineTemplateRenderer } from './LineTemplateRenderer';
import { isSafeImageUrl } from '@/lib/line/url';
import type { FlexContainer, TemplateContent, QuickReplyItem } from '@/lib/line/message-types';

function Placeholder({ label }: { label: string }) {
  return (
    <span
      data-testid="msg-placeholder"
      style={{
        display: 'inline-block',
        padding: '2px 6px',
        fontSize: 11,
        color: '#9ca3af',
        background: '#f3f4f6',
        border: '1px dashed #d1d5db',
        borderRadius: 4,
      }}
    >
      {label}
    </span>
  );
}

function ChatBubble({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="chat-bubble"
      style={{
        maxWidth: 260,
        background: '#ffffff',
        borderRadius: '4px 16px 16px 16px',
        padding: '10px 14px',
        fontSize: 14,
        color: '#111111',
        boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickImageUrl(payload: Record<string, unknown>): string | undefined {
  for (const key of ['previewImageUrl', 'originalContentUrl', 'url']) {
    const v = payload[key];
    if (typeof v === 'string') return v;
  }
  return undefined;
}

function renderBody(objectType: string, payload: Record<string, unknown>): ReactNode {
  switch (objectType) {
    case 'flex':
      return <LineFlexRenderer container={payload as unknown as FlexContainer} />;
    case 'template':
      return (
        <LineTemplateRenderer
          template={(payload.template ?? null) as TemplateContent | null}
        />
      );
    case 'text':
    case 'text_v2': {
      const text = typeof payload.text === 'string' ? payload.text : '';
      return <ChatBubble>{text || <Placeholder label="ข้อความว่าง" />}</ChatBubble>;
    }
    case 'image': {
      const url = pickImageUrl(payload);
      if (isSafeImageUrl(url)) {
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            data-testid="msg-image"
            style={{ maxWidth: 260, borderRadius: 12, display: 'block' }}
          />
        );
      }
      return <ChatBubble><Placeholder label="image" /></ChatBubble>;
    }
    case 'sticker':
      return (
        <ChatBubble>
          <Placeholder label={`sticker ${String(payload.stickerId ?? '')}`.trim()} />
        </ChatBubble>
      );
    case 'video':
    case 'audio':
    case 'location':
    case 'imagemap':
      return <ChatBubble><Placeholder label={objectType} /></ChatBubble>;
    default:
      return <ChatBubble><Placeholder label={objectType || 'unknown'} /></ChatBubble>;
  }
}

function QuickReplyChips({ quickReply }: { quickReply: unknown }) {
  const qr = asRecord(quickReply);
  const items = Array.isArray(qr.items) ? (qr.items as QuickReplyItem[]) : [];
  if (items.length === 0) return null;
  const chip: CSSProperties = {
    flex: '0 0 auto',
    border: '1px solid #17c950',
    color: '#17c950',
    background: '#ffffff',
    borderRadius: 18,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    fontFamily: 'system-ui, sans-serif',
  };
  return (
    <div
      data-testid="quick-reply-chips"
      style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 8, paddingBottom: 2 }}
    >
      {items.map((it, i) => (
        <span key={i} style={chip}>
          {it.action?.label || 'ปุ่ม'}
        </span>
      ))}
    </div>
  );
}

export interface MessagePreviewProps {
  objectType: string;
  payload: Record<string, unknown>;
  altText?: string;
}

export function MessagePreview({ objectType, payload, altText }: MessagePreviewProps) {
  const p = asRecord(payload);
  return (
    <div data-testid="message-preview">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        {renderBody(objectType, p)}
        <div style={{ width: '100%' }}>
          <QuickReplyChips quickReply={p.quickReply} />
        </div>
      </div>
      {altText ? (
        <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280' }}>Alt: {altText}</div>
      ) : null}
    </div>
  );
}

export default MessagePreview;
