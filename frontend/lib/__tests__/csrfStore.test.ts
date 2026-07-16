import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCsrfToken, setCsrfToken, clearCsrfToken } from '../csrfStore';

/**
 * Unit tests for the in-memory CSRF token store (P1.1b / PR 2B).
 *
 * The store is module-level (per-tab/per-load). It must NEVER touch localStorage
 * — an XSS that can read module memory can already call fetch, so persisting
 * adds exfil risk with no benefit.
 */
describe('csrfStore — in-memory CSRF token', () => {
  beforeEach(() => {
    clearCsrfToken();
  });

  afterEach(() => {
    clearCsrfToken();
    vi.restoreAllMocks();
  });

  it('returns null by default', () => {
    expect(getCsrfToken()).toBeNull();
  });

  it('stores and returns a set token', () => {
    setCsrfToken('csrf-abc-123');
    expect(getCsrfToken()).toBe('csrf-abc-123');
  });

  it('clears back to null', () => {
    setCsrfToken('csrf-abc-123');
    clearCsrfToken();
    expect(getCsrfToken()).toBeNull();
  });

  it('overwrites the previous value on re-set', () => {
    setCsrfToken('first');
    setCsrfToken('second');
    expect(getCsrfToken()).toBe('second');
  });

  it('setCsrfToken(null) clears the value', () => {
    setCsrfToken('csrf-abc-123');
    setCsrfToken(null);
    expect(getCsrfToken()).toBeNull();
  });

  it('never reads or writes localStorage', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem');
    setCsrfToken('csrf-abc-123');
    getCsrfToken();
    clearCsrfToken();
    expect(spy).not.toHaveBeenCalled();
  });
});
