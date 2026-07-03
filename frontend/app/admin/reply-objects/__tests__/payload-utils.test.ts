import { describe, it, expect } from 'vitest';
import {
  safeParsePayload,
  makeEmptyAction,
  defaultPayloadForType,
  newInternalKey,
  withNewKey,
  getItemKey,
  ensureEditorKeys,
  stripEditorKeys,
  isAllowedActionUri,
  findInvalidActionUri,
} from '../_components/payload-utils';

describe('safeParsePayload', () => {
  it('parses a valid JSON object', () => {
    expect(safeParsePayload('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns {} for invalid JSON instead of throwing', () => {
    expect(safeParsePayload('{ not json')).toEqual({});
  });

  it('returns {} for non-object JSON (array / scalar / null)', () => {
    expect(safeParsePayload('[1,2,3]')).toEqual({});
    expect(safeParsePayload('42')).toEqual({});
    expect(safeParsePayload('null')).toEqual({});
  });
});

describe('makeEmptyAction', () => {
  it('defaults to a message action with an empty label', () => {
    expect(makeEmptyAction()).toEqual({ type: 'message', label: '' });
  });

  it('honours the requested type', () => {
    expect(makeEmptyAction('uri').type).toBe('uri');
  });
});

describe('defaultPayloadForType', () => {
  it('builds a buttons template skeleton', () => {
    const p = defaultPayloadForType('template') as {
      template: { type: string; actions: unknown[] };
    };
    expect(p.template.type).toBe('buttons');
    expect(p.template.actions).toHaveLength(1);
  });

  it('builds a text_v2 skeleton', () => {
    expect(defaultPayloadForType('text_v2')).toEqual({ text: '' });
  });

  it('returns an empty object for free-form types', () => {
    expect(defaultPayloadForType('flex')).toEqual({});
    expect(defaultPayloadForType('image')).toEqual({});
  });
});

describe('internal editor keys (react-2)', () => {
  it('newInternalKey returns unique non-empty strings', () => {
    const a = newInternalKey();
    const b = newInternalKey();
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('withNewKey returns a tagged copy without mutating the original', () => {
    const original = { type: 'message' as const, label: 'A' };
    const keyed = withNewKey(original);

    expect(typeof (keyed as { _key?: unknown })._key).toBe('string');
    expect(original).toEqual({ type: 'message', label: 'A' });
  });

  it('getItemKey prefers the internal key and falls back to a stable index key', () => {
    expect(getItemKey({ _key: 'abc' }, 3)).toBe('abc');
    expect(getItemKey({ label: 'no key' }, 3)).toBe('idx-3');
    expect(getItemKey(undefined, 0)).toBe('idx-0');
  });

  it('ensureEditorKeys tags quickReply items, template actions, columns, and column actions', () => {
    const payload = {
      text: 'hi',
      quickReply: { items: [{ type: 'action', action: { type: 'message', label: 'Q' } }] },
      template: {
        type: 'carousel',
        columns: [{ title: 't', text: 'x', actions: [{ type: 'message', label: 'A' }] }],
      },
    };

    const keyed = ensureEditorKeys(payload) as typeof payload & {
      quickReply: { items: { _key?: string }[] };
      template: { columns: ({ _key?: string; actions: { _key?: string }[] })[] };
    };

    expect(typeof keyed.quickReply.items[0]._key).toBe('string');
    expect(typeof keyed.template.columns[0]._key).toBe('string');
    expect(typeof keyed.template.columns[0].actions[0]._key).toBe('string');
    // Original payload is never mutated.
    expect('_key' in payload.quickReply.items[0]).toBe(false);
  });

  it('ensureEditorKeys keeps existing keys and untouched sections as-is', () => {
    const payload = {
      quickReply: { items: [{ type: 'action', _key: 'keep-me' }] },
    };
    const keyed = ensureEditorKeys(payload) as {
      quickReply: { items: { _key?: string }[] };
    };
    expect(keyed.quickReply.items[0]._key).toBe('keep-me');
    expect(ensureEditorKeys({ type: 'bubble' })).toEqual({ type: 'bubble' });
  });

  it('stripEditorKeys deep-removes every _key so the LINE payload shape is preserved', () => {
    const payload = {
      quickReply: { items: [{ type: 'action', action: { type: 'message', label: 'Q' } }] },
      template: {
        type: 'buttons',
        text: 'hi',
        actions: [{ type: 'message', label: 'A' }],
      },
    };

    const roundTripped = stripEditorKeys(ensureEditorKeys(payload));

    expect(roundTripped).toEqual(payload);
    expect(JSON.stringify(roundTripped)).not.toContain('_key');
  });
});

describe('isAllowedActionUri (sec-1)', () => {
  it('accepts every allowlisted scheme', () => {
    expect(isAllowedActionUri('https://example.com/page')).toBe(true);
    expect(isAllowedActionUri('http://example.com')).toBe(true);
    expect(isAllowedActionUri('tel:0812345678')).toBe(true);
    expect(isAllowedActionUri('mailto:contact@example.go.th')).toBe(true);
    expect(isAllowedActionUri('line://ti/p/@justice')).toBe(true);
  });

  it('is case-insensitive on the scheme', () => {
    expect(isAllowedActionUri('HTTPS://EXAMPLE.COM')).toBe(true);
    expect(isAllowedActionUri('JavaScript:alert(1)')).toBe(false);
  });

  it('rejects dangerous or unknown schemes', () => {
    expect(isAllowedActionUri('javascript:alert(1)')).toBe(false);
    expect(isAllowedActionUri('data:text/html,<script>x</script>')).toBe(false);
    expect(isAllowedActionUri('vbscript:msgbox(1)')).toBe(false);
    expect(isAllowedActionUri('file:///etc/passwd')).toBe(false);
  });

  it('rejects relative and scheme-less values', () => {
    expect(isAllowedActionUri('example.com')).toBe(false);
    expect(isAllowedActionUri('/relative/path')).toBe(false);
    expect(isAllowedActionUri('')).toBe(false);
  });
});

describe('findInvalidActionUri (sec-1)', () => {
  it('returns null when every uri action uses an allowed scheme', () => {
    const payload = {
      template: {
        type: 'buttons',
        text: 'hi',
        actions: [
          { type: 'uri', label: 'เว็บ', uri: 'https://example.com' },
          { type: 'message', label: 'ข้อความ', text: 'x' },
        ],
      },
    };
    expect(findInvalidActionUri(payload)).toBeNull();
  });

  it('finds a bad uri nested deep inside a flex payload', () => {
    const payload = {
      type: 'bubble',
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'button', action: { type: 'uri', label: 'x', uri: 'javascript:alert(1)' } }],
      },
    };
    expect(findInvalidActionUri(payload)).toBe('javascript:alert(1)');
  });

  it('finds a bad uri inside quickReply items', () => {
    const payload = {
      text: 'เลือก',
      quickReply: {
        items: [{ type: 'action', action: { type: 'uri', label: 'x', uri: 'data:text/html,x' } }],
      },
    };
    expect(findInvalidActionUri(payload)).toBe('data:text/html,x');
  });

  it('ignores empty uri values and non-uri actions', () => {
    const payload = {
      template: {
        type: 'buttons',
        text: 'hi',
        actions: [
          { type: 'uri', label: 'ยังไม่กรอก', uri: '' },
          { type: 'message', label: 'm', text: 'javascript:not-a-uri-field' },
        ],
      },
    };
    expect(findInvalidActionUri(payload)).toBeNull();
  });
});
