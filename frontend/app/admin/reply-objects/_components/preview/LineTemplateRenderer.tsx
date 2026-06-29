/**
 * LineTemplateRenderer — renders a LINE Template message (buttons / confirm /
 * carousel / image_carousel) as HTML for a faithful in-app preview.
 *
 * Like LineFlexRenderer it tolerates partial / invalid payloads: every node is
 * guarded and missing pieces degrade to a small placeholder instead of throwing.
 */
import type { CSSProperties } from 'react';
import type {
  TemplateContent,
  ButtonsTemplate,
  ConfirmTemplate,
  CarouselTemplate,
  ImageCarouselTemplate,
  LineAction,
} from '@/lib/line/message-types';
import { isSafeImageUrl } from '@/lib/line/url';

const cardStyle: CSSProperties = {
  width: 260,
  background: '#ffffff',
  borderRadius: 10,
  overflow: 'hidden',
  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
  fontFamily: 'system-ui, sans-serif',
};

function Placeholder({ label }: { label: string }) {
  return (
    <span
      data-testid="template-placeholder"
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

function PreviewButton({ action }: { action?: LineAction }) {
  return (
    <div
      data-testid="template-button"
      style={{
        padding: '9px 12px',
        textAlign: 'center',
        color: '#17c950',
        fontSize: 14,
        fontWeight: 600,
        borderTop: '1px solid #f0f0f0',
      }}
    >
      {action?.label || 'ปุ่ม'}
    </div>
  );
}

function CardImage({ url, height = 130 }: { url?: string; height?: number }) {
  if (!isSafeImageUrl(url)) {
    return (
      <div
        style={{
          height,
          background: '#eef0f3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Placeholder label="image" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      data-testid="template-image"
      style={{ width: '100%', height, objectFit: 'cover', display: 'block' }}
    />
  );
}

function ButtonsView({ t }: { t: ButtonsTemplate }) {
  const actions = Array.isArray(t.actions) ? t.actions : [];
  return (
    <div data-testid="template-buttons" style={cardStyle}>
      {isSafeImageUrl(t.thumbnailImageUrl) && <CardImage url={t.thumbnailImageUrl} />}
      <div style={{ padding: 12 }}>
        {t.title ? (
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{t.title}</div>
        ) : null}
        <div style={{ fontSize: 14, color: '#333', whiteSpace: 'pre-wrap' }}>
          {t.text || <Placeholder label="text" />}
        </div>
      </div>
      <div>
        {actions.length ? actions.map((a, i) => <PreviewButton key={i} action={a} />) : <PreviewButton />}
      </div>
    </div>
  );
}

function ConfirmView({ t }: { t: ConfirmTemplate }) {
  const actions = Array.isArray(t.actions) ? t.actions : [];
  return (
    <div data-testid="template-confirm" style={{ ...cardStyle, width: 240 }}>
      <div
        style={{
          padding: 16,
          fontSize: 14,
          color: '#333',
          textAlign: 'center',
          whiteSpace: 'pre-wrap',
        }}
      >
        {t.text || <Placeholder label="text" />}
      </div>
      <div style={{ display: 'flex' }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ flex: 1 }}>
            <PreviewButton action={actions[i]} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CarouselView({ t }: { t: CarouselTemplate }) {
  const columns = Array.isArray(t.columns) ? t.columns : [];
  if (columns.length === 0) return <Placeholder label="empty carousel" />;
  return (
    <div
      data-testid="template-carousel"
      style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}
    >
      {columns.map((col, i) => {
        const actions = Array.isArray(col.actions) ? col.actions : [];
        return (
          <div key={i} style={{ ...cardStyle, flex: '0 0 auto' }}>
            {isSafeImageUrl(col.thumbnailImageUrl) && <CardImage url={col.thumbnailImageUrl} />}
            <div style={{ padding: 12 }}>
              {col.title ? (
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{col.title}</div>
              ) : null}
              <div style={{ fontSize: 13, color: '#333', whiteSpace: 'pre-wrap' }}>
                {col.text || ''}
              </div>
            </div>
            <div>{actions.map((a, j) => <PreviewButton key={j} action={a} />)}</div>
          </div>
        );
      })}
    </div>
  );
}

function ImageCarouselView({ t }: { t: ImageCarouselTemplate }) {
  const columns = Array.isArray(t.columns) ? t.columns : [];
  if (columns.length === 0) return <Placeholder label="empty carousel" />;
  return (
    <div
      data-testid="template-image-carousel"
      style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}
    >
      {columns.map((col, i) => (
        <div key={i} style={{ ...cardStyle, width: 160, flex: '0 0 auto' }}>
          <CardImage url={col.imageUrl} height={160} />
          {col.action?.label ? (
            <div
              style={{
                padding: '6px 8px',
                fontSize: 12,
                color: '#17c950',
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              {col.action.label}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export interface LineTemplateRendererProps {
  template: TemplateContent | null | undefined;
}

export function LineTemplateRenderer({ template }: LineTemplateRendererProps) {
  if (
    !template ||
    typeof template !== 'object' ||
    typeof (template as { type?: unknown }).type !== 'string'
  ) {
    return <Placeholder label="invalid template" />;
  }
  switch (template.type) {
    case 'buttons':
      return <ButtonsView t={template as ButtonsTemplate} />;
    case 'confirm':
      return <ConfirmView t={template as ConfirmTemplate} />;
    case 'carousel':
      return <CarouselView t={template as CarouselTemplate} />;
    case 'image_carousel':
      return <ImageCarouselView t={template as ImageCarouselTemplate} />;
    default:
      return <Placeholder label={`unsupported: ${String((template as { type?: unknown }).type)}`} />;
  }
}

export default LineTemplateRenderer;
