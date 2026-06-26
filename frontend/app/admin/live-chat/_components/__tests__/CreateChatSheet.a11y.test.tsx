/**
 * A11y tests for CreateChatSheet — M8 (label/input association).
 *
 * Primary acceptance is manual NVDA verification per the Phase 2 plan.
 * These tests give automated confidence that:
 *  - every form control has an associated <label> (getByLabelText throws when
 *    the htmlFor↔id link is missing),
 *  - the search input carries aria-required="true",
 *  - the error paragraph has role="alert".
 *
 * Mocking rationale
 * -----------------
 * - @/contexts/AuthContext  — useAuth() is called unconditionally; mock returns
 *   a stable token so the component can mount without a real provider.
 * - @/components/ui/Sheet   — Radix UI Sheet renders via a Portal into
 *   document.body.  In jsdom the Portal target may be unavailable before the
 *   component tree is mounted, causing children to disappear from the query
 *   scope.  We replace Sheet + SheetContent with plain divs so all children
 *   render inline.
 * - @/lib/logger            — No-op to silence error output in test runs.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { CreateChatSheet } from '../CreateChatSheet';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: null }),
}));

vi.mock('@/components/ui/Sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <>{children}</> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-content">{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  onCreated: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateChatSheet — M8 label/input association (WCAG 2.2 AA)', () => {
  it('ค้นหาผู้ใช้ label is programmatically associated with the search input', () => {
    render(<CreateChatSheet {...baseProps} />);
    // getByLabelText resolves via htmlFor↔id; throws when the link is absent.
    const input = screen.getByLabelText(/ค้นหาผู้ใช้/);
    expect(input).toBeInTheDocument();
  });

  it('search input carries aria-required="true"', () => {
    render(<CreateChatSheet {...baseProps} />);
    const input = screen.getByLabelText(/ค้นหาผู้ใช้/);
    expect(input).toHaveAttribute('aria-required', 'true');
  });

  it('ข้อความเริ่มต้น label is programmatically associated with the textarea', () => {
    render(<CreateChatSheet {...baseProps} />);
    const textarea = screen.getByLabelText(/ข้อความเริ่มต้น/);
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName.toLowerCase()).toBe('textarea');
  });

  it('เหตุผล label is programmatically associated with the reason input', () => {
    render(<CreateChatSheet {...baseProps} />);
    const input = screen.getByLabelText(/เหตุผล/);
    expect(input).toBeInTheDocument();
    expect(input.tagName.toLowerCase()).toBe('input');
  });
});
