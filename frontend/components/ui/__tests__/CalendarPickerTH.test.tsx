import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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
