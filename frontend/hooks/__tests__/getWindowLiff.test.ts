// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { getWindowLiff } from '../useLiffInit';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getWindowLiff', () => {
  it('returns the injected SDK when the edge script has loaded', () => {
    const sdk = {
      init: vi.fn(),
      isLoggedIn: vi.fn(),
      isInClient: vi.fn(),
      login: vi.fn(),
      getProfile: vi.fn(),
      getIDToken: vi.fn(),
    };
    vi.stubGlobal('liff', sdk);
    expect(getWindowLiff()).toBe(sdk);
  });

  it('returns undefined when the edge script is blocked or slow', () => {
    vi.stubGlobal('liff', undefined);
    expect(getWindowLiff()).toBeUndefined();
  });
});
