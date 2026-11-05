// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import DateRangeCalendarTH from '../DateRangeCalendarTH';

// jsdom has no ResizeObserver; Radix's positioning engine needs a stub.
if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
}

const SEPT_2026 = new Date(2026, 8, 1);

function setup(props: Partial<React.ComponentProps<typeof DateRangeCalendarTH>> = {}) {
  const onSelect = vi.fn();
  const onCancel = vi.fn();
  render(
    <DateRangeCalendarTH
      start=""
      end=""
      onSelect={onSelect}
      onCancel={onCancel}
      defaultMonth={SEPT_2026}
      {...props}
    />,
  );
  return { onSelect, onCancel };
}

/** Day button for this day-of-month in Sept 2026; `\b` keeps 3 off 13 and 23. */
function dayButton(day: number): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`\\b${day} กันยายน 2569`) });
}

describe('DateRangeCalendarTH', () => {
  it('renders two month captions carrying พ.ศ. years', () => {
    setup();
    expect(screen.getByText('กันยายน 2569')).toBeInTheDocument();
    expect(screen.getByText('ตุลาคม 2569')).toBeInTheDocument();
  });

  it('fills a range from two clicks and passes the ordered pair', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();

    await user.click(dayButton(3));
    expect(screen.getByRole('button', { name: 'ใช้ช่วงนี้' })).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();

    await user.click(dayButton(10));
    const apply = screen.getByRole('button', { name: 'ใช้ช่วงนี้' });
    expect(apply).toBeEnabled();

    await user.click(apply);
    expect(onSelect).toHaveBeenLastCalledWith('2026-09-03', '2026-09-10');
  });

  it('reports the same ordered pair when the second click is the earlier day', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();

    await user.click(dayButton(10));
    await user.click(dayButton(3));
    await user.click(screen.getByRole('button', { name: 'ใช้ช่วงนี้' }));

    expect(onSelect).toHaveBeenLastCalledWith('2026-09-03', '2026-09-10');
  });

  it('leaves the apply button disabled after a single click', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();

    await user.click(dayButton(3));

    expect(screen.getByRole('button', { name: 'ใช้ช่วงนี้' })).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('reports a cancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();

    await user.click(screen.getByRole('button', { name: 'ยกเลิก' }));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('moves focus with the arrow keys', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(dayButton(10));
    expect(dayButton(10)).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(dayButton(11)).toHaveFocus();
  });
});
