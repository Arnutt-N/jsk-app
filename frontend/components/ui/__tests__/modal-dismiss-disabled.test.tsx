// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ConfirmDialog } from '../ConfirmDialog';
import { Modal } from '../Modal';

const settle = () => new Promise((r) => setTimeout(r, 90));

describe('Modal dismissDisabled', () => {
  it('leaves the dialog without an exit while pending', async () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog isOpen onClose={onClose} onConfirm={() => {}} title="ยืนยันการลบ" isLoading />,
    );
    await settle();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose, 'Escape').not.toHaveBeenCalled();

    fireEvent.click(document.querySelector('.bg-black\\/50')!);
    expect(onClose, 'backdrop').not.toHaveBeenCalled();

    expect(document.querySelector('[aria-label="Close modal"]'), 'X button').toBeNull();

    const cancel = screen.getByRole('button', { name: 'ยกเลิก' }) as HTMLButtonElement;
    expect(cancel.disabled, 'cancel disabled').toBe(true);
    fireEvent.click(cancel);
    expect(onClose, 'cancel click').not.toHaveBeenCalled();
  });

  it('keeps the Tab trap alive, so focus cannot escape to the page behind', async () => {
    render(
      <Modal isOpen onClose={() => {}} dismissDisabled>
        <button id="first">first</button>
        <button id="last">last</button>
      </Modal>,
    );
    await settle();

    const last = document.querySelector('#last') as HTMLButtonElement;
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect((document.activeElement as HTMLElement).id, 'wrap to first').toBe('first');

    const first = document.querySelector('#first') as HTMLButtonElement;
    first.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect((document.activeElement as HTMLElement).id, 'wrap back to last').toBe('last');
  });

  it('dismisses normally once the request settles', async () => {
    const onClose = vi.fn();
    function Harness() {
      const [loading, setLoading] = useState(true);
      return (
        <>
          <button onClick={() => setLoading(false)}>request settled</button>
          <ConfirmDialog
            isOpen
            onClose={onClose}
            onConfirm={() => {}}
            title="ยืนยันการลบ"
            isLoading={loading}
          />
        </>
      );
    }
    render(<Harness />);
    await settle();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose, 'blocked while pending').not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'request settled' }));
    await settle();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose, 'works once pending clears').toHaveBeenCalledTimes(1);
  });
});

describe('inert attribute plumbing for the mobile drawer', () => {
  it('omits the attribute when false, so the desktop sidebar stays reachable', () => {
    const { container } = render(
      <>
        <div id="a" inert={false} />
        <div id="b" inert={true} />
      </>,
    );
    expect((container.querySelector('#a') as HTMLElement).hasAttribute('inert')).toBe(false);
    expect((container.querySelector('#b') as HTMLElement).hasAttribute('inert')).toBe(true);
  });
});
