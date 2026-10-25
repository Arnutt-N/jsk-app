// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog pending dismiss', () => {
  it('blocks onClose on Escape and backdrop click while loading', () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        onClose={onClose}
        onConfirm={() => {}}
        title="ยืนยันการลบ"
        isLoading
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = document.querySelector('.bg-black\\/50');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('tells the user that closing does not cancel the request', () => {
    render(
      <ConfirmDialog
        isOpen
        onClose={() => {}}
        onConfirm={() => {}}
        title="ยืนยันการลบ"
        isLoading
      />
    );

    expect(
      screen.getByText('กำลังทำรายการ ปิดหน้าต่างนี้ไม่ได้ยกเลิกคำสั่ง')
    ).toBeTruthy();
  });

  it('closes normally when not loading', () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        onClose={onClose}
        onConfirm={() => {}}
        title="ยืนยันการลบ"
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
