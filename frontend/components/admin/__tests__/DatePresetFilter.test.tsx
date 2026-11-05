// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DatePresetFilter } from '../DatePresetFilter';
import { CUSTOM_RANGE_MESSAGES } from '@/lib/date-range';
import { isoToYMD } from '@/lib/utils';

// jsdom has no ResizeObserver, which the Radix positioning engine behind the
// Portal popup needs — stub it so Portal tests run like a real browser.
if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
}

// The box cases must not depend on the Radix calendar internals; a native date
// input covers the same onChange contract.
vi.mock('@/components/ui/CalendarPickerTH', () => ({
  default: function MockCalendarPicker({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string | null;
    onChange: (val: string | null) => void;
    ariaLabel?: string;
  }) {
    return (
      <input
        type="date"
        aria-label={ariaLabel || 'วันที่'}
        value={value ? isoToYMD(value) : ''}
        onChange={(e) => {
          const val = e.target.value;
          if (!val) {
            onChange(null);
          } else {
            const d = new Date(`${val}T00:00:00`);
            onChange(!isNaN(d.getTime()) ? d.toISOString() : null);
          }
        }}
      />
    );
  },
}));

/** Holds the filter state the way a page does, so re-renders match production. */
function Harness({
  initialPreset = null,
  initialStart = '',
  initialEnd = '',
  showClear = false,
  onPresetChange = vi.fn(),
  onClear = vi.fn(),
}: {
  initialPreset?: string | null;
  initialStart?: string;
  initialEnd?: string;
  showClear?: boolean;
  onPresetChange?: (key: string) => void;
  onClear?: () => void;
}) {
  const [preset, setPreset] = useState<string | null>(initialPreset);
  const [customStart, setCustomStart] = useState(initialStart);
  const [customEnd, setCustomEnd] = useState(initialEnd);
  return (
    <DatePresetFilter
      preset={preset}
      customStart={customStart}
      customEnd={customEnd}
      onPresetChange={(key) => {
        onPresetChange(key);
        setPreset(key);
      }}
      onCustomStartChange={setCustomStart}
      onCustomEndChange={setCustomEnd}
      showClear={showClear}
      onClear={onClear}
    />
  );
}

describe('DatePresetFilter', () => {
  it('shows the four real presets and no button for the custom marker', () => {
    render(<Harness />);
    for (const label of ['7 วัน', '30 วัน', '90 วัน', 'ปีนี้']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'กำหนดเอง' })).not.toBeInTheDocument();
  });

  it('labels the custom date range and reads as a Thai range', () => {
    render(<Harness />);
    expect(screen.getByText('กำหนดเอง').tagName).toBe('SPAN');
    expect(screen.getByText('ถึง')).toBeInTheDocument();
    expect(screen.queryByText('-')).not.toBeInTheDocument();
  });

  it('matches the preset and clear buttons to the date box radius', () => {
    render(<Harness showClear />);
    for (const name of ['7 วัน', '30 วัน', '90 วัน', 'ปีนี้', 'ล้างตัวกรอง']) {
      expect(screen.getByRole('button', { name })).toHaveClass('rounded-xl');
    }
    expect(screen.getByRole('button', { name: '7 วัน' })).not.toHaveClass('rounded-lg');
  });

  it('reports the picked preset inline', async () => {
    const user = userEvent.setup();
    const onPresetChange = vi.fn();
    render(<Harness onPresetChange={onPresetChange} />);

    await user.click(screen.getByRole('button', { name: '30 วัน' }));

    expect(onPresetChange).toHaveBeenCalledWith('30d');
  });

  it('renders both typed box values', () => {
    render(<Harness initialPreset="custom" initialStart="2026-09-01" initialEnd="2026-09-30" />);
    expect(screen.getByLabelText('จากวันที่')).toHaveValue('2026-09-01');
    expect(screen.getByLabelText('ถึงวันที่')).toHaveValue('2026-09-30');
  });

  it('reports a reversed custom range below the row', () => {
    render(<Harness initialPreset="custom" initialStart="2026-09-05" initialEnd="2026-09-01" />);
    expect(screen.getByRole('alert')).toHaveTextContent(CUSTOM_RANGE_MESSAGES.reversed);
  });

  it('reports a half-typed custom range', () => {
    render(<Harness initialPreset="custom" initialStart="2026-09-01" />);
    expect(screen.getByRole('alert')).toHaveTextContent(CUSTOM_RANGE_MESSAGES.incomplete);
  });

  it('stays silent on an empty pair', () => {
    render(<Harness />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the clear button only on request and reports a clear', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const { rerender } = render(<Harness />);
    expect(screen.queryByRole('button', { name: 'ล้างตัวกรอง' })).not.toBeInTheDocument();

    rerender(<Harness showClear onClear={onClear} />);
    await user.click(screen.getByRole('button', { name: 'ล้างตัวกรอง' }));
    expect(onClear).toHaveBeenCalled();
  });
});
