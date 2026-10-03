// @vitest-environment jsdom
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LiffRequestV2 from '../page';

vi.mock('@line/liff', () => ({ __esModule: true, default: {} }));
vi.mock('@/hooks/useLiffInit', () => ({
  useLiffInit: () => ({ idToken: 'tok', initDone: true, profile: null, isInLineApp: true }),
}));
vi.mock('@/hooks/useAutoCloseCountdown', () => ({
  useAutoCloseCountdown: () => ({}),
}));
vi.mock('@/lib/liff/upload-media', () => ({
  uploadLiffMedia: vi.fn(),
  attachmentCapMessage: () => null,
  readErrorDetail: async () => null,
}));
vi.mock('@/lib/liff/location-cascade', () => ({
  fetchDistricts: async () => [],
  fetchSubDistricts: async () => [],
}));
vi.mock('next/head', () => ({
  default: function MockHead({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  },
}));
vi.mock('next/script', () => ({
  default: function MockScript() {
    return null;
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

describe('LIFF request-v2 phone input (R3-M29)', () => {
  it('strips non-digits and shows the digits placeholder', () => {
    const { container } = render(<LiffRequestV2 />);
    const phone = container.querySelector('input[name="phone"]') as HTMLInputElement;
    expect(phone.placeholder).toBe('08xxxxxxxx');
    expect(phone.maxLength).toBe(12);
    fireEvent.change(phone, { target: { value: '081-234-5678' } });
    expect(phone.value).toBe('0812345678');
  });
});
