import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { toISODate } from '@/lib/booking';
import CalendarPickerTH from '../CalendarPickerTH';

/**
 * Behaviour contract for the Thai (พ.ศ.) date picker:
 *  1. พิมพ์ได้  — typing วว/ดด/ปปปป commits an ISO date.
 *  2. เลือกได้  — opening the calendar and drilling year → month → day works.
 *  3. กลุ่มเดือน — a 12-month grid is reachable from the day view.
 *  4. กลุ่มปี พ.ศ. — a year grid of Buddhist-Era years is reachable.
 */
describe('CalendarPickerTH', () => {
  it('renders three numeric inputs (วว/ดด/ปปปป)', () => {
    render(<CalendarPickerTH value={null} onChange={() => {}} />);
    expect(screen.getByLabelText('วันที่')).toBeInTheDocument();
    expect(screen.getByLabelText('เดือน')).toBeInTheDocument();
    expect(screen.getByLabelText('ปี พ.ศ.')).toBeInTheDocument();
  });

  it('พิมพ์ได้: typing พ.ศ. parts commits the matching ค.ศ. ISO date', async () => {
    const onChange = vi.fn();
    render(<CalendarPickerTH value={null} onChange={onChange} />);

    fireEvent.input(screen.getByLabelText('วันที่'), { target: { value: '15' } });
    fireEvent.input(screen.getByLabelText('เดือน'), { target: { value: '01' } });
    fireEvent.input(screen.getByLabelText('ปี พ.ศ.'), { target: { value: '2567' } });

    await waitFor(() => expect(onChange).toHaveBeenCalled());

    const iso = onChange.mock.calls.at(-1)?.[0] as string;
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2024); // 2567 พ.ศ. → 2024 ค.ศ.
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(15);
  });

  it('rejects an out-of-range พ.ศ. year with a Thai error', async () => {
    const onChange = vi.fn();
    render(<CalendarPickerTH value={null} onChange={onChange} />);

    fireEvent.input(screen.getByLabelText('วันที่'), { target: { value: '15' } });
    fireEvent.input(screen.getByLabelText('เดือน'), { target: { value: '01' } });
    fireEvent.input(screen.getByLabelText('ปี พ.ศ.'), { target: { value: '1000' } });
    fireEvent.blur(screen.getByLabelText('ปี พ.ศ.'));

    await waitFor(() => expect(screen.getByText(/ปี พ\.ศ\. ไม่ถูกต้อง/)).toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('เลือกได้: drills day → month grid → picks a month back to day view', async () => {
    render(<CalendarPickerTH value={'2024-01-15T00:00:00.000Z'} onChange={() => {}} />);

    fireEvent.click(screen.getByLabelText('เปิดปฏิทินเลือกวันที่'));
    const dialog = await screen.findByRole('dialog');

    // Day view header doubles as the "เลือกเดือน" entry point.
    fireEvent.click(within(dialog).getByLabelText('เลือกเดือน'));

    // Month grid: all 12 Thai months selectable.
    expect(within(dialog).getByLabelText('มกราคม')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('ธันวาคม')).toBeInTheDocument();

    // Pick a month → returns to day view showing that month.
    fireEvent.click(within(dialog).getByLabelText('ธันวาคม'));
    await waitFor(() =>
      expect(within(dialog).getByLabelText('เลือกเดือน')).toHaveTextContent('ธันวาคม')
    );
  });

  it('กลุ่มปี พ.ศ.: month view opens a Buddhist-Era year grid', async () => {
    render(<CalendarPickerTH value={'2024-01-15T00:00:00.000Z'} onChange={() => {}} />);

    fireEvent.click(screen.getByLabelText('เปิดปฏิทินเลือกวันที่'));
    const dialog = await screen.findByRole('dialog');

    fireEvent.click(within(dialog).getByLabelText('เลือกเดือน')); // → month view
    fireEvent.click(within(dialog).getByLabelText('เลือกปี')); // → year view

    // Year grid shows พ.ศ. labels (e.g. "พ.ศ. 2567" for the selected year).
    expect(within(dialog).getByLabelText('พ.ศ. 2567')).toBeInTheDocument();
  });
});

/**
 * Booking-window contract: an optional predicate disables non-bookable days
 * and an optional [minDate, maxDate] window clamps navigation. Absent props
 * change nothing (covered by the suite above).
 */
describe('CalendarPickerTH booking window', () => {
  const BLOCKED = '2026-10-20';
  const blockedProps = { isDateDisabled: (iso: string) => iso === BLOCKED };

  it('P1: marks the blocked day non-interactive for mouse and keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CalendarPickerTH
        value="2026-10-01T00:00:00.000Z"
        onChange={onChange}
        {...blockedProps}
      />
    );

    fireEvent.click(screen.getByLabelText('เปิดปฏิทินเลือกวันที่'));
    const dialog = await screen.findByRole('dialog');
    const blocked = within(dialog).getByLabelText('20 ตุลาคม 2569');
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    expect(blocked).toHaveAttribute('tabindex', '-1');
    expect(blocked.className).toContain('opacity-40');

    await user.click(blocked);
    blocked.focus();
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    // The guard runs before the close, so the dialog is still open.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('P2: rejects a typed blocked date with a Thai error', async () => {
    const onChange = vi.fn();
    render(<CalendarPickerTH value={null} onChange={onChange} {...blockedProps} />);

    fireEvent.input(screen.getByLabelText('วันที่'), { target: { value: '20' } });
    fireEvent.input(screen.getByLabelText('เดือน'), { target: { value: '10' } });
    fireEvent.input(screen.getByLabelText('ปี พ.ศ.'), { target: { value: '2569' } });
    fireEvent.blur(screen.getByLabelText('ปี พ.ศ.'));

    await waitFor(() =>
      expect(screen.getByText('วันที่เลือกไม่สามารถจองได้')).toBeInTheDocument()
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects a typed date outside the booking window', async () => {
    const onChange = vi.fn();
    render(
      <CalendarPickerTH
        value={null}
        onChange={onChange}
        minDate="2026-10-01"
        maxDate="2026-10-31"
      />
    );

    fireEvent.input(screen.getByLabelText('วันที่'), { target: { value: '15' } });
    fireEvent.input(screen.getByLabelText('เดือน'), { target: { value: '11' } });
    fireEvent.input(screen.getByLabelText('ปี พ.ศ.'), { target: { value: '2569' } });
    fireEvent.blur(screen.getByLabelText('ปี พ.ศ.'));

    await waitFor(() =>
      expect(screen.getByText('วันที่อยู่นอกช่วงที่เปิดให้จอง')).toBeInTheDocument()
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('P3: typing an in-window date still commits the matching local day', async () => {
    const onChange = vi.fn();
    render(
      <CalendarPickerTH
        value={null}
        onChange={onChange}
        minDate="2024-01-01"
        maxDate="2024-12-31"
      />
    );

    fireEvent.input(screen.getByLabelText('วันที่'), { target: { value: '15' } });
    fireEvent.input(screen.getByLabelText('เดือน'), { target: { value: '01' } });
    fireEvent.input(screen.getByLabelText('ปี พ.ศ.'), { target: { value: '2567' } });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const iso = onChange.mock.calls.at(-1)?.[0] as string;
    expect(toISODate(new Date(iso))).toBe('2024-01-15');
  });

  it('P5: clamps month navigation into the window; วันนี้ falls back to minDate', async () => {
    // Next month never contains today, so the window is always ahead of us.
    const now = new Date();
    const min = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    const max = toISODate(new Date(now.getFullYear(), now.getMonth() + 2, 0));
    const onChange = vi.fn();
    render(
      <CalendarPickerTH
        value={`${min}T00:00:00.000Z`}
        onChange={onChange}
        minDate={min}
        maxDate={max}
      />
    );

    fireEvent.click(screen.getByLabelText('เปิดปฏิทินเลือกวันที่'));
    const dialog = await screen.findByRole('dialog');
    const headerText = () => within(dialog).getByLabelText('เลือกเดือน').textContent;
    const shown = headerText();

    fireEvent.click(within(dialog).getByLabelText('เดือนก่อนหน้า'));
    expect(headerText()).toBe(shown);
    fireEvent.click(within(dialog).getByLabelText('เดือนถัดไป'));
    expect(headerText()).toBe(shown);

    fireEvent.click(within(dialog).getByLabelText('เลือกเดือน')); // → month view
    fireEvent.click(within(dialog).getByLabelText('เลือกปี')); // → year view
    const gridText = dialog.textContent;
    fireEvent.click(within(dialog).getByLabelText('ช่วงปีก่อนหน้า'));
    expect(dialog.textContent).toBe(gridText);
    fireEvent.click(within(dialog).getByLabelText('ช่วงปีถัดไป'));
    expect(dialog.textContent).toBe(gridText);

    // Today is outside the window, so วันนี้ selects minDate instead.
    fireEvent.click(within(dialog).getByText(/^วันนี้/));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(toISODate(new Date(onChange.mock.calls[0][0] as string))).toBe(min);
  });

  it('P6: drills through unfiltered month/year grids, then enforces per-day', async () => {
    const onChange = vi.fn();
    render(
      <CalendarPickerTH
        value="2026-10-01T00:00:00.000Z"
        onChange={onChange}
        {...blockedProps}
      />
    );

    fireEvent.click(screen.getByLabelText('เปิดปฏิทินเลือกวันที่'));
    const dialog = await screen.findByRole('dialog');

    fireEvent.click(within(dialog).getByLabelText('เลือกเดือน')); // → month view
    expect(dialog.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
    fireEvent.click(within(dialog).getByLabelText('เลือกปี')); // → year view
    expect(dialog.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
    fireEvent.click(within(dialog).getByLabelText('พ.ศ. 2569')); // → month view
    fireEvent.click(within(dialog).getByLabelText('ตุลาคม')); // → day view

    fireEvent.click(within(dialog).getByLabelText('20 ตุลาคม 2569'));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByLabelText('15 ตุลาคม 2569'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
