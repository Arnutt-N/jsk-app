/**
 * LineFlexRenderer — renders a LINE Flex Message (bubble / carousel) as HTML
 * for a faithful in-app preview.
 *
 * Design constraints:
 *   - Tolerate partial / invalid payloads while the user is still typing:
 *     every node is guarded and unknown / malformed nodes degrade to a small
 *     placeholder instead of throwing.
 *   - Map Flex layout primitives to CSS (flexbox) rather than pulling in a
 *     heavy third-party renderer — the subset we support is small and stable.
 */
import type { CSSProperties } from 'react';
import type {
  FlexComponent,
  FlexContainer,
  FlexBubble,
  FlexCarousel,
  FlexBox,
  FlexText,
  FlexImage,
  FlexButton,
  FlexSeparator,
  FlexIcon,
  FlexSpacing,
  FlexSize,
} from '@/lib/line/message-types';

const MAX_DEPTH = 20;

// Keyword → pixel maps (approximate LINE rendering)
const SPACING_PX: Record<string, number> = {
  none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20,
};

const TEXT_SIZE_PX: Record<string, number> = {
  xxs: 11, xs: 13, sm: 14, md: 16, lg: 19, xl: 22, xxl: 29,
  '3xl': 35, '4xl': 47, '5xl': 70,
};

/**
 * Only allow http(s) image URLs in the preview. Payloads are admin-supplied
 * JSON, so block `javascript:` / `data:` URIs as defense-in-depth even though
 * the page is authenticated.
 */
function isSafeImageUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const protocol = new URL(url, 'https://line.invalid').protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function spacingToPx(value: FlexSpacing | undefined, fallback = 0): number {
  if (value == null) return fallback;
  if (value in SPACING_PX) return SPACING_PX[value];
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textSizePx(value: FlexSize | undefined): number {
  if (value == null) return 16;
  if (value in TEXT_SIZE_PX) return TEXT_SIZE_PX[value];
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 16;
}

function Placeholder({ label }: { label: string }) {
  return (
    <span
      data-testid="flex-placeholder"
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

function renderText(node: FlexText, key: string) {
  const style: CSSProperties = {
    fontSize: textSizePx(node.size),
    fontWeight: node.weight === 'bold' ? 700 : 400,
    color: node.color ?? '#111111',
    textAlign: node.align ?? 'start',
    whiteSpace: node.wrap ? 'normal' : 'nowrap',
    overflow: node.wrap ? 'visible' : 'hidden',
    textOverflow: node.wrap ? 'clip' : 'ellipsis',
    marginTop: spacingToPx(node.margin),
    flexGrow: node.flex ?? 0,
    lineHeight: 1.35,
  };
  return (
    <div key={key} style={style} data-testid="flex-text">
      {node.text ?? ''}
    </div>
  );
}

function renderImage(node: FlexImage, key: string) {
  const style: CSSProperties = {
    width: node.size === 'full' ? '100%' : undefined,
    maxWidth: '100%',
    objectFit: node.aspectMode === 'cover' ? 'cover' : 'contain',
    marginTop: spacingToPx(node.margin),
    display: 'block',
    alignSelf:
      node.align === 'center' ? 'center' : node.align === 'end' ? 'flex-end' : 'flex-start',
  };
  if (!isSafeImageUrl(node.url)) return <Placeholder key={key} label="image" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img key={key} src={node.url} alt="" style={style} data-testid="flex-image" />;
}

function renderButton(node: FlexButton, key: string) {
  const style = node.style ?? 'link';
  const base: CSSProperties = {
    marginTop: spacingToPx(node.margin),
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    textAlign: 'center',
    cursor: 'default',
    flexGrow: node.flex ?? 0,
  };
  const variant: CSSProperties =
    style === 'primary'
      ? { background: node.color ?? '#17c950', color: '#ffffff' }
      : style === 'secondary'
        ? { background: node.color ?? '#e5e7eb', color: '#111111' }
        : { background: 'transparent', color: node.color ?? '#17c950' };
  return (
    <div key={key} style={{ ...base, ...variant }} data-testid="flex-button">
      {node.action?.label ?? 'Button'}
    </div>
  );
}

function renderSeparator(node: FlexSeparator, key: string) {
  return (
    <div
      key={key}
      data-testid="flex-separator"
      style={{
        borderTop: `1px solid ${node.color ?? '#e5e7eb'}`,
        marginTop: spacingToPx(node.margin),
      }}
    />
  );
}

function renderIcon(node: FlexIcon, key: string) {
  if (!isSafeImageUrl(node.url)) return <Placeholder key={key} label="icon" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={key}
      src={node.url}
      alt=""
      data-testid="flex-icon"
      style={{ width: textSizePx(node.size), height: textSizePx(node.size), marginTop: spacingToPx(node.margin) }}
    />
  );
}

function renderBox(node: FlexBox, key: string, depth: number) {
  const layout = node.layout ?? 'vertical';
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: layout === 'vertical' ? 'column' : 'row',
    alignItems: layout === 'baseline' ? 'baseline' : node.alignItems ?? 'stretch',
    justifyContent: node.justifyContent ?? 'flex-start',
    gap: spacingToPx(node.spacing),
    marginTop: spacingToPx(node.margin),
    padding: spacingToPx(node.paddingAll),
    paddingTop: node.paddingTop != null ? spacingToPx(node.paddingTop) : undefined,
    paddingBottom: node.paddingBottom != null ? spacingToPx(node.paddingBottom) : undefined,
    background: node.backgroundColor,
    borderRadius: spacingToPx(node.cornerRadius),
    border: node.borderColor ? `${spacingToPx(node.borderWidth, 1)}px solid ${node.borderColor}` : undefined,
    flexGrow: node.flex ?? 0,
  };
  const children = Array.isArray(node.contents) ? node.contents : [];
  return (
    <div key={key} style={style} data-testid="flex-box">
      {children.map((child, i) => renderComponent(child, `${key}.${i}`, depth + 1))}
    </div>
  );
}

export function renderComponent(node: FlexComponent | undefined, key: string, depth: number) {
  if (depth > MAX_DEPTH) return <Placeholder key={key} label="…" />;
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') {
    return <Placeholder key={key} label="?" />;
  }
  switch (node.type) {
    case 'box':
      return renderBox(node, key, depth);
    case 'text':
      return renderText(node, key);
    case 'image':
      return renderImage(node, key);
    case 'button':
      return renderButton(node, key);
    case 'separator':
      return renderSeparator(node, key);
    case 'icon':
      return renderIcon(node, key);
    case 'filler':
      return <div key={key} style={{ flexGrow: node.flex ?? 1 }} data-testid="flex-filler" />;
    default:
      return <Placeholder key={key} label={String((node as { type?: unknown }).type ?? '?')} />;
  }
}

const BUBBLE_WIDTH: Record<string, number> = {
  nano: 120, micro: 160, kilo: 260, mega: 300, giga: 386,
};

function FlexBubbleView({ bubble }: { bubble: FlexBubble }) {
  const width = BUBBLE_WIDTH[bubble.size ?? 'mega'] ?? 300;
  const sectionStyle: CSSProperties = { padding: 12 };
  return (
    <div
      data-testid="flex-bubble"
      style={{
        width,
        flex: '0 0 auto',
        background: '#ffffff',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {bubble.header && <div style={sectionStyle}>{renderComponent(bubble.header, 'header', 0)}</div>}
      {bubble.hero && <div>{renderComponent(bubble.hero as FlexComponent, 'hero', 0)}</div>}
      {bubble.body && <div style={sectionStyle}>{renderComponent(bubble.body, 'body', 0)}</div>}
      {bubble.footer && <div style={sectionStyle}>{renderComponent(bubble.footer, 'footer', 0)}</div>}
      {!bubble.header && !bubble.hero && !bubble.body && !bubble.footer && (
        <div style={sectionStyle}><Placeholder label="empty bubble" /></div>
      )}
    </div>
  );
}

export interface LineFlexRendererProps {
  container: FlexContainer | null | undefined;
}

export function LineFlexRenderer({ container }: LineFlexRendererProps) {
  if (!container || typeof container !== 'object' || typeof container.type !== 'string') {
    return <Placeholder label="invalid flex" />;
  }
  if (container.type === 'carousel') {
    const carousel = container as FlexCarousel;
    const bubbles = Array.isArray(carousel.contents) ? carousel.contents : [];
    if (bubbles.length === 0) return <Placeholder label="empty carousel" />;
    return (
      <div
        data-testid="flex-carousel"
        style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}
      >
        {bubbles.map((b, i) => (
          <FlexBubbleView key={i} bubble={b} />
        ))}
      </div>
    );
  }
  if (container.type === 'bubble') {
    return <FlexBubbleView bubble={container as FlexBubble} />;
  }
  // Runtime payloads are untyped JSON, so a string `type` outside the union is
  // still possible even though TS has narrowed the static type to `never`.
  return <Placeholder label={`unsupported: ${(container as { type?: string }).type ?? '?'}`} />;
}

export default LineFlexRenderer;
