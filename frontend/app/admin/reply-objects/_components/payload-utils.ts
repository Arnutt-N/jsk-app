/**
 * Shared helpers for the Reply Objects authoring UI.
 *
 * The canonical payload is the JSON *string* held in the page form state. These
 * helpers convert to/from the structured object the type-specific editors and
 * the live preview work with, and provide sensible per-type skeletons.
 */
import type { LineAction } from '@/lib/line/message-types';

/** Shared input styling so editors match the page aesthetic. */
export const FIELD_CLS =
  'w-full px-3 py-2 bg-bg border border-border-default rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:bg-surface transition-all';

export const LABEL_CLS =
  'text-[10px] font-black uppercase tracking-widest text-text-tertiary';

/**
 * Parse the form payload string into an object. Returns `{}` for invalid /
 * partial JSON (or non-object JSON) so the editors and preview never throw
 * while the user is still typing.
 */
export function safeParsePayload(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** A blank LINE action for new buttons / columns / quick-reply items. */
export function makeEmptyAction(type: LineAction['type'] = 'message'): LineAction {
  return { type, label: '' };
}

/**
 * Default payload skeleton when the user picks a type. Only the new structured
 * types get a skeleton; everything else starts empty and uses the JSON editor.
 */
export function defaultPayloadForType(objectType: string): Record<string, unknown> {
  switch (objectType) {
    case 'template':
      return { template: { type: 'buttons', title: '', text: '', actions: [makeEmptyAction()] } };
    case 'text_v2':
      return { text: '' };
    default:
      return {};
  }
}
