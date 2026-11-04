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

// The custom-range cases must not depend on the Radix calendar internals; a
// native date input covers the same onChange contract.
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
  it('rests as one trigger naming the unfiltered range, with no preset rows', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'ตัวกรองช่วงวันที่' })).toHaveTextContent(
      'ทุกช่วงเวลา',
    );
    expect(screen.queryByRole('button', { name: '30 วัน' })).not.toBeInTheDocument();
  });

  it('reveals the five preset buttons when the trigger is clicked', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'ตัวกรองช่วงวันที่' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    for (const label of ['7 วัน', '30 วัน', '90 วัน', 'ปีนี้', 'กำหนดเอง']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('reports the picked preset and closes the panel', async () => {
    const user = userEvent.setup();
    const onPresetChange = vi.fn();
    render(<Harness onPresetChange={onPresetChange} />);
    await user.click(screen.getByRole('button', { name: 'ตัวกรองช่วงวันที่' }));
    await user.click(screen.getByRole('button', { name: '30 วัน' }));

    expect(onPresetChange).toHaveBeenCalledWith('30d');
    expect(screen.queryByRole('button', { name: '90 วัน' })).not.toBeInTheDocument();
  });

  it('follows the preset prop in the trigger text', () => {
    render(<Harness initialPreset="30d" />);
    expect(screen.getByRole('button', { name: 'ตัวกรองช่วงวันที่' })).toHaveTextContent(
      '30 วัน',
    );
  });

  it('names both Thai dates for a usable custom range', () => {
    render(<Harness initialPreset="custom" initialStart="2026-09-01" initialEnd="2026-09-30" />);
    const trigger = screen.getByRole('button', { name: 'ตัวกรองช่วงวันที่' });
    expect(trigger).toHaveTextContent('ก.ย. 2569');
    expect(trigger.textContent).toContain('–');
  });

  it('marks an unusable custom range on the trigger without growing its text', async () => {
    const user = userEvent.setup();
    render(<Harness initialPreset="custom" initialStart="2026-09-05" initialEnd="2026-09-01" />);
    const trigger = screen.getByRole('button', { name: 'ตัวกรองช่วงวันที่' });
    expect(trigger).toHaveTextContent('กำหนดเอง');
    expect(trigger).not.toHaveTextContent(CUSTOM_RANGE_MESSAGES.reversed);
    expect(screen.getByLabelText(CUSTOM_RANGE_MESSAGES.reversed)).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole('alert')).toHaveTextContent(CUSTOM_RANGE_MESSAGES.reversed);
  });

  it('asks for the missing end date inside the panel when only one is picked', async () => {
    const user = userEvent.setup();
    render(<Harness initialPreset="custom" initialStart="2026-09-01" />);
    await user.click(screen.getByRole('button', { name: 'ตัวกรองช่วงวันที่' }));
    expect(screen.getByRole('alert')).toHaveTextContent(CUSTOM_RANGE_MESSAGES.incomplete);
  });

  it('closes once the second custom date completes a usable range', async () => {
    const user = userEvent.setup();
    render(<Harness initialPreset="custom" initialStart="2026-09-01" />);
    await user.click(screen.getByRole('button', { name: 'ตัวกรองช่วงวันที่' }));

    await user.type(screen.getByLabelText('ถึงวันที่'), '2026-09-30');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ถึงวันที่')).not.toBeInTheDocument();
  });

  it('stays open when the second custom date keeps the range unusable', async () => {
    const user = userEvent.setup();
    render(<Harness initialPreset="custom" initialStart="2026-09-30" />);
    await user.click(screen.getByRole('button', { name: 'ตัวกรองช่วงวันที่' }));

    await user.type(screen.getByLabelText('ถึงวันที่'), '2026-09-01');

    expect(screen.getByRole('alert')).toHaveTextContent(CUSTOM_RANGE_MESSAGES.reversed);
  });

  it('closes when the page changes the preset from outside while open', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DatePresetFilter
        preset="custom"
        customStart="2026-09-01"
        customEnd=""
        onPresetChange={() => {}}
        onCustomStartChange={() => {}}
        onCustomEndChange={() => {}}
        showClear={false}
        onClear={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'ตัวกรองช่วงวันที่' }));
    expect(screen.getByLabelText('จากวันที่')).toBeInTheDocument();

    rerender(
      <DatePresetFilter
        preset="30d"
        customStart="2026-09-01"
        customEnd=""
        onPresetChange={() => {}}
        onCustomStartChange={() => {}}
        onCustomEndChange={() => {}}
        showClear={false}
        onClear={() => {}}
      />,
    );

    expect(screen.queryByLabelText('จากวันที่')).not.toBeInTheDocument();
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
