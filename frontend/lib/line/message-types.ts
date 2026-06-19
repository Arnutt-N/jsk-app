/**
 * Shared TypeScript types for LINE message payloads used by the Reply Objects
 * authoring UI and the LINE-fidelity preview renderer.
 *
 * Subset of the LINE Messaging API covering what the editors/preview need:
 *   - Flex Message  (bubble / carousel + box/text/image/button/separator/icon)
 *   - Template Message (buttons / confirm / carousel / image_carousel)
 *   - Quick reply (modifier attached to any message)
 *
 * These mirror the official spec loosely on purpose: the preview renderer must
 * tolerate partial / in-progress payloads, so most fields are optional and the
 * renderer guards every access.
 */

// --- Shared scalar keyword unions -----------------------------------------

export type FlexSize =
  | 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
  | '3xl' | '4xl' | '5xl' | 'full' | string;

export type FlexSpacing = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | string;
export type FlexAlign = 'start' | 'center' | 'end';
export type FlexGravity = 'top' | 'center' | 'bottom';
export type FlexWeight = 'regular' | 'bold';
export type BoxLayout = 'vertical' | 'horizontal' | 'baseline';
export type ButtonStyle = 'primary' | 'secondary' | 'link';

// --- LINE actions ----------------------------------------------------------

export interface LineAction {
  type: 'message' | 'uri' | 'postback' | 'datetimepicker' | 'camera' | 'cameraRoll' | 'location' | 'richmenuswitch';
  label?: string;
  text?: string;
  uri?: string;
  data?: string;
  displayText?: string;
}

// --- Flex components -------------------------------------------------------

export interface FlexText {
  type: 'text';
  text?: string;
  size?: FlexSize;
  weight?: FlexWeight;
  color?: string;
  align?: FlexAlign;
  gravity?: FlexGravity;
  wrap?: boolean;
  flex?: number;
  margin?: FlexSpacing;
  action?: LineAction;
}

export interface FlexImage {
  type: 'image';
  url?: string;
  size?: FlexSize;
  aspectRatio?: string; // e.g. "20:13"
  aspectMode?: 'cover' | 'fit';
  align?: FlexAlign;
  gravity?: FlexGravity;
  flex?: number;
  margin?: FlexSpacing;
  action?: LineAction;
}

export interface FlexButton {
  type: 'button';
  action?: LineAction;
  style?: ButtonStyle;
  color?: string;
  height?: 'sm' | 'md';
  flex?: number;
  margin?: FlexSpacing;
}

export interface FlexSeparator {
  type: 'separator';
  margin?: FlexSpacing;
  color?: string;
}

export interface FlexIcon {
  type: 'icon';
  url?: string;
  size?: FlexSize;
  margin?: FlexSpacing;
}

export interface FlexFiller {
  type: 'filler';
  flex?: number;
}

export interface FlexBox {
  type: 'box';
  layout?: BoxLayout;
  contents?: FlexComponent[];
  spacing?: FlexSpacing;
  margin?: FlexSpacing;
  paddingAll?: FlexSpacing;
  paddingTop?: FlexSpacing;
  paddingBottom?: FlexSpacing;
  paddingStart?: FlexSpacing;
  paddingEnd?: FlexSpacing;
  backgroundColor?: string;
  cornerRadius?: FlexSpacing;
  borderColor?: string;
  borderWidth?: FlexSpacing;
  flex?: number;
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  alignItems?: 'flex-start' | 'center' | 'flex-end';
  action?: LineAction;
}

export type FlexComponent =
  | FlexBox
  | FlexText
  | FlexImage
  | FlexButton
  | FlexSeparator
  | FlexIcon
  | FlexFiller;

// --- Flex containers -------------------------------------------------------

export interface FlexBubble {
  type: 'bubble';
  size?: 'nano' | 'micro' | 'kilo' | 'mega' | 'giga';
  direction?: 'ltr' | 'rtl';
  header?: FlexBox;
  hero?: FlexImage | FlexBox;
  body?: FlexBox;
  footer?: FlexBox;
  styles?: Record<string, unknown>;
}

export interface FlexCarousel {
  type: 'carousel';
  contents?: FlexBubble[];
}

export type FlexContainer = FlexBubble | FlexCarousel;

// --- Template messages -----------------------------------------------------

export type TemplateSubtype = 'buttons' | 'confirm' | 'carousel' | 'image_carousel';

export interface ButtonsTemplate {
  type: 'buttons';
  thumbnailImageUrl?: string;
  title?: string;
  text?: string;
  actions?: LineAction[];
}

export interface ConfirmTemplate {
  type: 'confirm';
  text?: string;
  actions?: LineAction[];
}

export interface CarouselColumn {
  thumbnailImageUrl?: string;
  title?: string;
  text?: string;
  actions?: LineAction[];
}

export interface CarouselTemplate {
  type: 'carousel';
  columns?: CarouselColumn[];
}

export interface ImageCarouselColumn {
  imageUrl?: string;
  action?: LineAction;
}

export interface ImageCarouselTemplate {
  type: 'image_carousel';
  columns?: ImageCarouselColumn[];
}

export type TemplateContent =
  | ButtonsTemplate
  | ConfirmTemplate
  | CarouselTemplate
  | ImageCarouselTemplate;

/** Payload shape for object_type === 'template'. */
export interface TemplatePayload {
  altText?: string;
  template?: TemplateContent;
  quickReply?: QuickReply;
}

// --- Quick reply (modifier) ------------------------------------------------

export interface QuickReplyItem {
  type: 'action';
  imageUrl?: string;
  action?: LineAction;
}

export interface QuickReply {
  items?: QuickReplyItem[];
}

/** Any reply-object payload may carry a quickReply modifier. */
export interface WithQuickReply {
  quickReply?: QuickReply;
}
