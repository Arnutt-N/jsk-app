// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ConfirmDialog } from '../ConfirmDialog';

const settle = () => new Promise((r) => setTimeout(r, 90));

describe('ConfirmDialog while a request is pending', () => {
  it('keeps the dialog open through every dismiss affordance', async () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog isOpen onClose={onClose} onConfirm={() => {}} title="ยืนยันการลบ" isLoading />,
    );
    await settle();

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'ยืนยันการลบ' })).toBeTruthy();

    const cancel = screen.getByRole('button', { name: 'ยกเลิก' }) as HTMLButtonElement;
    fireEvent.click(cancel);
    expect(cancel.disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps focus inside the dialog even though every control is disabled', async () => {
    render(
      <ConfirmDialog isOpen onClose={() => {}} onConfirm={() => {}} title="ยืนยันการลบ" isLoading />,
    );
    await settle();

    const dialog = screen.getByRole('dialog', { name: 'ยืนยันการลบ' });
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(window, { key: 'Tab' });
      expect(dialog.contains(document.activeElement), `Tab ${i + 1}`).toBe(true);
    }
  });

  it('announces the pending state to assistive tech', async () => {
    render(<ConfirmDialog isOpen onClose={() => {}} onConfirm={() => {}} title="x" isLoading />);
    await settle();
    expect(screen.getByRole('status').textContent).toContain('กำลังดำเนินการ');
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
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'request settled' }));
    await settle();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Modal dismissDisabled focus trap', () => {
  it('cycles Tab between the dialog controls', async () => {
    const { Modal } = await import('../Modal');
    render(
      <Modal isOpen onClose={() => {}} dismissDisabled title="ระหว่างรอ">
        <button id="only">only</button>
      </Modal>,
    );
    await settle();

    (document.querySelector('#only') as HTMLButtonElement).focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });
});
