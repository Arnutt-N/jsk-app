// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Modal } from '../Modal';

/**
 * Regression: the focus-restore effect must NOT re-run when the parent passes
 * a new inline `onClose` on re-render. A parent that re-renders on every
 * keystroke (controlled input) recreates its inline callbacks; if the focus
 * effect depended on that callback's identity, its cleanup would fire
 * `previouslyFocused.focus()` mid-typing and yank focus out of the field —
 * the "can only type one character, must click the input again" bug on the
 * create-category modal.
 */
describe('Modal focus stability across re-renders', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps focus on an inner input when re-rendered with a new onClose', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(
      <Modal isOpen onClose={() => {}} title="เพิ่ม Category ใหม่">
        <input data-testid="field" />
      </Modal>
    );

    // Let the open-time auto-focus settle, then simulate the user clicking
    // into the text field and typing.
    vi.advanceTimersByTime(60);
    const field = screen.getByTestId('field') as HTMLInputElement;
    field.focus();
    expect(document.activeElement).toBe(field);

    // Parent re-renders with a brand-new inline onClose (what happens on each
    // controlled-input keystroke). Focus must stay in the field.
    rerender(
      <Modal isOpen onClose={() => {}} title="เพิ่ม Category ใหม่">
        <input data-testid="field" />
      </Modal>
    );

    expect(document.activeElement).toBe(field);

    trigger.remove();
  });

  it('still restores focus to the trigger when it actually closes (WCAG 2.4.3)', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(
      <Modal isOpen onClose={() => {}} title="เพิ่ม Category ใหม่">
        <input data-testid="field" />
      </Modal>
    );
    vi.advanceTimersByTime(60);
    expect(document.activeElement).not.toBe(trigger);

    rerender(
      <Modal isOpen={false} onClose={() => {}} title="เพิ่ม Category ใหม่">
        <input data-testid="field" />
      </Modal>
    );
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });
});

/**
 * Regression (CI-red since ce5a414): the open-time auto-focus must NOT steal
 * focus away from an element that was focused inside the modal before the 50ms
 * timer fired. The auto-replies create-category flow focuses the name input
 * synchronously on a 400 response (page.tsx: nameInputRef.focus()); on slower
 * CI machines the modal's deferred focus timer fires AFTER that imperative
 * focus and yanks focus back to the first focusable element (the Close button),
 * failing `expect(getByLabelText('ชื่อ Category')).toHaveFocus()`. Locally the
 * timer fires first so imperative focus wins — hence "passes local, red in CI".
 */
describe('Modal open-focus does not steal focus already inside the modal (CI race)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps focus on an inner input focused before the deferred open-focus timer fires', () => {
    render(
      <Modal isOpen onClose={() => {}} title="เพิ่ม Category ใหม่">
        <input data-testid="name" aria-label="ชื่อ Category" />
      </Modal>
    );

    // Simulate the error handler focusing the name input synchronously, BEFORE
    // the modal's 50ms open-focus timer has fired.
    const name = screen.getByTestId('name') as HTMLInputElement;
    name.focus();
    expect(document.activeElement).toBe(name);

    // On slow CI the deferred timer fires only now — it must not pull focus
    // back to the first focusable element (the Close button).
    vi.advanceTimersByTime(60);

    expect(document.activeElement).toBe(name);
  });
});
