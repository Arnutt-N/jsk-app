import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { DateTimePickerTH } from '../DateTimePickerTH';

function StaticHarness({ value, onChange }: { value: string | null; onChange: (iso: string | null) => void }) {
  return (
    <DateTimePickerTH
      value={value}
      onChange={onChange}
      dateLabel="วันที่ทดสอบ"
      timeLabel="เวลาที่ทดสอบ"
    />
  );
}

/** Mirrors real page usage: the emitted value round-trips back as the prop. */
function StatefulHarness({ onChange }: { onChange?: (iso: string | null) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <DateTimePickerTH
      value={value}
      onChange={(iso) => { setValue(iso); onChange?.(iso); }}
      dateLabel="วันที่ทดสอบ"
      timeLabel="เวลาที่ทดสอบ"
    />
  );
}

// 15 ก.ย. 2569 พ.ศ. = 15 Sep 2026 ค.ศ.
function typeThaiDate() {
  fireEvent.input(screen.getByLabelText('วันที่ทดสอบ'), { target: { value: '15' } });
  fireEvent.input(screen.getByLabelText('เดือน'), { target: { value: '09' } });
  fireEvent.input(screen.getByLabelText('ปี พ.ศ.'), { target: { value: '2569' } });
}

describe('DateTimePickerTH', () => {
  it('renders a Thai date field and a time field with the given labels', () => {
    render(<StaticHarness value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText('วันที่ทดสอบ')).toBeInTheDocument();
    expect(screen.getByLabelText('เวลาที่ทดสอบ')).toBeInTheDocument();
  });

  it('disables the time field until a date is chosen, then enables it', async () => {
    render(<StatefulHarness />);
    const time = screen.getByLabelText('เวลาที่ทดสอบ') as HTMLInputElement;
    expect(time).toBeDisabled();

    typeThaiDate();
    await waitFor(() => expect(time).toBeEnabled());
    // The partial selection (date picked, time pending) survives its own null echo.
    expect((screen.getByLabelText('วันที่ทดสอบ') as HTMLInputElement).value).toBe('15');
  });

  it('emits a timezone-correct ISO only when both parts are chosen', async () => {
    const onChange = vi.fn();
    render(<StatefulHarness onChange={onChange} />);

    typeThaiDate();
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenLastCalledWith(null);

    fireEvent.input(screen.getByLabelText('เวลาที่ทดสอบ'), { target: { value: '14:30' } });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.any(String)));

    const iso = onChange.mock.lastCall?.[0] as string;
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });

  it('derives local date/time parts from an external ISO value (edit-page load)', () => {
    const local = new Date(2026, 8, 15, 14, 30);
    render(<StaticHarness value={local.toISOString()} onChange={vi.fn()} />);
    expect((screen.getByLabelText('เวลาที่ทดสอบ') as HTMLInputElement).value).toBe('14:30');
    expect((screen.getByLabelText('วันที่ทดสอบ') as HTMLInputElement).value).toBe('15');
  });

  it('emits null when the date is cleared after a full selection', async () => {
    const onChange = vi.fn();
    render(<StatefulHarness onChange={onChange} />);

    typeThaiDate();
    // Flush the picker's deferred year commit (see booking page test) before
    // the next input, so events don't race within the same tick.
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenLastCalledWith(null);

    fireEvent.input(screen.getByLabelText('เวลาที่ทดสอบ'), { target: { value: '14:30' } });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.any(String)));

    fireEvent.click(screen.getByLabelText('ล้างวันที่'));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(null));
    expect((screen.getByLabelText('เวลาที่ทดสอบ') as HTMLInputElement).disabled).toBe(true);
  });
});
