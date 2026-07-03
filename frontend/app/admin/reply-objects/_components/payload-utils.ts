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

// --- Internal reconciliation keys (react-2) ---------------------------------
//
// Editor list items (quick-reply items, template actions/columns) carry an
// internal `_key` so React can use stable keys instead of array indexes.
// Keys are generated ONLY in event handlers (add / load / toggle) — never
// during render — and are stripped from the payload before it is saved, so
// the serialized LINE payload shape never changes.

const INTERNAL_KEY = '_key';

/** Generate a unique internal key. Falls back when crypto.randomUUID is absent. */
export function newInternalKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Return a copy of `item` tagged with a fresh internal key. */
export function withNewKey<T extends object>(item: T): T {
  const keyed: T & { _key: string } = { ...item, _key: newInternalKey() };
  return keyed;
}

/** Read the internal key of a list item, falling back to a stable index key. */
export function getItemKey(item: unknown, index: number): string {
  if (item !== null && typeof item === 'object') {
    const key = (item as Record<string, unknown>)[INTERNAL_KEY];
    if (typeof key === 'string' && key !== '') return key;
  }
  return `idx-${index}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensureKeysOnList(list: unknown): unknown {
  if (!Array.isArray(list)) return list;
  return list.map((item) =>
    isRecord(item) && typeof item[INTERNAL_KEY] !== 'string'
      ? { ...item, [INTERNAL_KEY]: newInternalKey() }
      : item
  );
}

/**
 * Immutably add internal keys to the lists the structured editors render:
 * `quickReply.items[]`, `template.actions[]`, `template.columns[]`, and
 * `template.columns[].actions[]`. Call from event handlers only (load, type
 * change, raw-mode exit) — never during render.
 */
export function ensureEditorKeys(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload };
  if (isRecord(next.quickReply)) {
    next.quickReply = { ...next.quickReply, items: ensureKeysOnList(next.quickReply.items) };
  }
  if (isRecord(next.template)) {
    const template = { ...next.template };
    if (Array.isArray(template.actions)) template.actions = ensureKeysOnList(template.actions);
    if (Array.isArray(template.columns)) {
      template.columns = (ensureKeysOnList(template.columns) as unknown[]).map((col) =>
        isRecord(col) && Array.isArray(col.actions)
          ? { ...col, actions: ensureKeysOnList(col.actions) }
          : col
      );
    }
    next.template = template;
  }
  return next;
}

/**
 * Deep-remove every internal `_key` so the payload saved to the backend keeps
 * the exact LINE message shape (backward compatibility guarantee).
 */
export function stripEditorKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripEditorKeys(item)) as unknown as T;
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === INTERNAL_KEY) continue;
      out[k] = stripEditorKeys(v);
    }
    return out as T;
  }
  return value;
}

// --- URI scheme allowlist (sec-1) -------------------------------------------

/** Schemes a LINE `uri` action may use — defense-in-depth against javascript:/data:. */
export const ALLOWED_ACTION_URI_SCHEMES = ['https:', 'http:', 'tel:', 'mailto:', 'line:'] as const;

/** Thai error shown when a uri action uses a scheme outside the allowlist. */
export const URI_SCHEME_ERROR_TH =
  'ลิงก์ไม่ปลอดภัยหรือไม่รองรับ — ใช้ได้เฉพาะ https:, http:, tel:, mailto: หรือ line: เท่านั้น';

/**
 * True when `uri` parses as an absolute URL whose scheme is in the allowlist.
 * Relative URLs and scheme-less strings are rejected (LINE requires absolute
 * URIs for uri actions anyway).
 */
export function isAllowedActionUri(uri: string): boolean {
  try {
    const protocol = new URL(uri).protocol;
    return (ALLOWED_ACTION_URI_SCHEMES as readonly string[]).includes(protocol);
  } catch {
    return false;
  }
}

/**
 * Deep-walk a payload and return the first non-empty `uri` action value whose
 * scheme is not allowed, or null when everything passes. Covers structured
 * editors AND raw-JSON payloads (flex buttons, quick replies, templates).
 */
export function findInvalidActionUri(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const bad = findInvalidActionUri(item);
      if (bad !== null) return bad;
    }
    return null;
  }
  if (isRecord(value)) {
    if (
      value.type === 'uri' &&
      typeof value.uri === 'string' &&
      value.uri.trim() !== '' &&
      !isAllowedActionUri(value.uri)
    ) {
      return value.uri;
    }
    for (const nested of Object.values(value)) {
      const bad = findInvalidActionUri(nested);
      if (bad !== null) return bad;
    }
  }
  return null;
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
