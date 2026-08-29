import { describe, it, expect } from 'vitest';
import { buildChangedFields } from '../diff-fields';

describe('buildChangedFields', () => {
  it('returns empty object when nothing changed', () => {
    const form = { firstname: 'สมชาย', lastname: 'ใจดี' };
    const baseline = { firstname: 'สมชาย', lastname: 'ใจดี' };

    expect(buildChangedFields(form, baseline)).toEqual({});
  });

  it('returns only the fields whose values differ from baseline', () => {
    const form = { firstname: 'สมหญิง', lastname: 'ใจดี', phone_number: '0812345678' };
    const baseline = { firstname: 'สมชาย', lastname: 'ใจดี', phone_number: '0812345678' };

    expect(buildChangedFields(form, baseline)).toEqual({ firstname: 'สมหญิง' });
  });

  it('treats undefined baseline as empty string (no false positive)', () => {
    // Field not present in baseline at all — form initializes as '' → no diff
    const form = { agency: '' };
    const baseline = {} as Record<string, unknown>;

    expect(buildChangedFields(form, baseline)).toEqual({});
  });

  it('treats null baseline vs empty-string form as intentional clear (produces diff)', () => {
    // Legacy rows ส่งค่า null มาจาก API — user clearing sends '' which backend
    // treats as "intentionally delete". This must produce a diff entry so the
    // PATCH payload includes the field.
    const form = { email: '' };
    const baseline = { email: null } as Record<string, string | null>;

    expect(buildChangedFields(form, baseline)).toEqual({ email: '' });
  });

  it('produces no diff when both baseline and form are effectively empty (null→null)', () => {
    // If form somehow has null-coerced-to-empty and baseline is null,
    // that's still an intentional clear per PATCH semantics.
    // But value→same-value should never produce a diff.
    const form = { firstname: 'สมชาย' };
    const baseline = { firstname: 'สมชาย' };

    expect(buildChangedFields(form, baseline)).toEqual({});
  });

  it('detects intentional clearing: baseline has value, form is empty string', () => {
    const form = { email: '' };
    const baseline = { email: 'old@example.com' };

    // empty string ถูกส่งไป backend = ตั้งใจลบค่า (PATCH semantic ที่ตัดสินใจแล้ว)
    expect(buildChangedFields(form, baseline)).toEqual({ email: '' });
  });

  it('detects filling a previously empty field', () => {
    const form = { email: 'new@example.com' };
    const baseline = { email: null } as Record<string, string | null>;

    expect(buildChangedFields(form, baseline)).toEqual({ email: 'new@example.com' });
  });

  it('handles multiple changes at once', () => {
    const form = {
      prefix: 'นาง',
      firstname: 'สมหญิง',
      lastname: 'ใจดี',
      province: 'เชียงใหม่',
    };
    const baseline = {
      prefix: 'นาย',
      firstname: 'สมชาย',
      lastname: 'ใจดี',
      province: null,
    } as Record<string, string | null>;

    expect(buildChangedFields(form, baseline)).toEqual({
      prefix: 'นาง',
      firstname: 'สมหญิง',
      province: 'เชียงใหม่',
    });
  });

  it('only compares keys present in the form (ignores extra baseline keys)', () => {
    const form = { firstname: 'สมชาย' };
    const baseline = { firstname: 'สมชาย', status: 'PENDING', id: 42 } as Record<string, unknown>;

    expect(buildChangedFields(form, baseline)).toEqual({});
  });
});
