'use client';

import { useState } from 'react';
import { DayPicker } from 'react-day-picker/buddhist';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/Button';
import { toISODate } from '@/lib/booking';
import { parseDateParts, THAI_MONTHS_LONG } from '@/lib/format-date';
import { toBE } from '@/lib/utils';

interface DateRangeCalendarTHProps {
  /** YMD 'YYYY-MM-DD', or '' when unset. */
  start: string;
  end: string;
  /** Both ends of the picked range, as YMD strings. */
  onSelect: (start: string, end: string) => void;
  onCancel: () => void;
  /** Test hook and deep-link anchor; defaults to the start month or today. */
  defaultMonth?: Date;
  className?: string;
}

const THAI_WEEKDAYS_SHORT = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'] as const;

const CLASS_NAMES = {
  months: 'flex flex-col gap-4 sm:flex-row sm:gap-6',
  month: 'relative space-y-3',
  month_caption: 'flex h-9 items-center justify-center',
  caption_label: 'text-sm font-semibold text-text-primary',
  nav: 'flex items-center gap-1',
  button_previous:
    'absolute left-0 top-0 z-10 h-7 w-7 rounded-lg border border-border-default bg-surface p-0 text-text-secondary transition-colors hover:bg-bg hover:text-text-primary',
  button_next:
    'absolute right-0 top-0 z-10 h-7 w-7 rounded-lg border border-border-default bg-surface p-0 text-text-secondary transition-colors hover:bg-bg hover:text-text-primary',
  weekdays: 'flex',
  weekday: 'w-9 rounded-md text-[0.8rem] font-medium text-text-secondary',
  week: 'mt-1 flex w-full',
  month_grid: 'w-full border-collapse',
  chevron: 'h-4 w-4',
  day: 'relative h-9 w-9 p-0 text-center text-sm',
  day_button:
    'h-9 w-9 rounded-lg p-0 font-normal text-text-primary transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
  // Range states own the fill. `selected` is just the stable hook class, so a
  // middle day does not also get the solid endpoint background (the library
  // emits both keys and concatenates the classes without merging them).
  selected: 'rdp-selected',
  range_start:
    'rounded-l-lg bg-brand-500 text-white [&>button]:text-white [&>button]:hover:bg-transparent',
  range_middle:
    'bg-brand-50 text-brand-900 [&>button]:text-brand-900 [&>button]:hover:bg-transparent',
  range_end:
    'rounded-r-lg bg-brand-500 text-white [&>button]:text-white [&>button]:hover:bg-transparent',
  today: 'font-semibold [&>button]:font-semibold [&>button]:text-brand-600',
  outside: 'text-text-tertiary opacity-60',
  disabled: 'text-text-tertiary opacity-50',
  hidden: 'invisible',
} as const;

function ymdToDate(ymd: string): Date | null {
  const parts = parseDateParts(ymd);
  return parts ? new Date(parts.year, parts.month, parts.day) : null;
}

function toRange(start: string, end: string): DateRange | undefined {
  const from = start ? ymdToDate(start) : null;
  const to = end ? ymdToDate(end) : null;
  return from && to ? { from, to } : undefined;
}

/** Controlled range calendar. It renders the range it is given and reports a
 *  completed pick upward; the only state it keeps is the half-picked start,
 *  which the parent has nowhere to put until the end arrives. */
export default function DateRangeCalendarTH({
  start,
  end,
  onSelect,
  onCancel,
  defaultMonth,
  className,
}: DateRangeCalendarTHProps) {
  const [pending, setPending] = useState<DateRange | undefined>(() => toRange(start, end));

  // Adjust during render: a range handed back by the parent replaces whatever
  // half-pick is in flight, so the two never disagree.
  const rangeKey = `${start}|${end}`;
  const [seenRangeKey, setSeenRangeKey] = useState(rangeKey);
  if (seenRangeKey !== rangeKey) {
    setSeenRangeKey(rangeKey);
    setPending(toRange(start, end));
  }

  const from = pending?.from ? toISODate(pending.from) : '';
  const to = pending?.to ? toISODate(pending.to) : '';
  const complete = Boolean(from && to);

  return (
    <div className={className}>
      <DayPicker
        mode="range"
        // Without a minimum, the first click yields `{from: d, to: d}`, which
        // reads as a complete one-day range and enables apply immediately.
        min={1}
        numberOfMonths={2}
        numerals="latn"
        showOutsideDays
        weekStartsOn={1}
        navLayout="around"
        autoFocus
        defaultMonth={defaultMonth ?? (from ? ymdToDate(from) ?? undefined : undefined)}
        selected={pending}
        onSelect={(range) => {
          setPending(range);
          if (range?.from && range.to) {
            onSelect(toISODate(range.from), toISODate(range.to));
          }
        }}
        formatters={{
          formatCaption: (date) => `${THAI_MONTHS_LONG[date.getMonth()]} ${toBE(date.getFullYear())}`,
          formatWeekdayName: (date) => THAI_WEEKDAYS_SHORT[(date.getDay() + 6) % 7],
        }}
        classNames={CLASS_NAMES}
      />

      <div className="mt-3 flex items-center justify-end gap-2 border-t border-border-default pt-3">
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs">
          ยกเลิก
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!complete}
          onClick={() => onSelect(from, to)}
          className="text-xs"
        >
          ใช้ช่วงนี้
        </Button>
      </div>
    </div>
  );
}
