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

  it('treats null/undefined baseline values as empty string (no false positives)', () => {
    // Legacy rows ส่งค่า null มาจาก API — form เก็บเป็น '' หลัง snapshot
    const form = { email: '', agency: '' };
    const baseline = { email: null, agency: undefined } as Record<string, string | null | undefined>;

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
