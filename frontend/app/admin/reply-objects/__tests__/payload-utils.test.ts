import { describe, it, expect } from 'vitest';
import {
  safeParsePayload,
  makeEmptyAction,
  defaultPayloadForType,
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
