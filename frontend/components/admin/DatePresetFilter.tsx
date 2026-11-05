'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import CalendarPickerTH from '@/components/ui/CalendarPickerTH';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import DateRangeCalendarTH from '@/components/admin/DateRangeCalendarTH';
import { cn, isoToYMD } from '@/lib/utils';
import {
  CUSTOM_RANGE_MESSAGES,
  STANDARD_DATE_PRESETS,
  customRangeProblem,
  type DatePresetOption,
} from '@/lib/date-range';
import { CalendarDays, RotateCcw } from 'lucide-react';

interface DatePresetFilterProps {
  /** Active preset key, or null for unfiltered (no button highlighted). */
  preset: string | null;
  customStart: string;
  customEnd: string;
  onPresetChange: (key: string) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  /** Caller decides when the clear button shows (usually: any filter active). */
  showClear: boolean;
  onClear: () => void;
  presets?: DatePresetOption[];
}

/** Shared admin date filter: preset buttons, two typed Thai date boxes, a
 *  range-calendar popover, and a clear button, all in one row. */
export function DatePresetFilter({
  preset,
  customStart,
  customEnd,
  onPresetChange,
  onCustomStartChange,
  onCustomEndChange,
  showClear,
  onClear,
  presets = STANDARD_DATE_PRESETS,
}: DatePresetFilterProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const problem = customRangeProblem(customStart, customEnd);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((opt) => (
          <Button
            key={opt.key}
            variant={preset === opt.key ? 'primary' : 'outline'}
            size="sm"
            onClick={() => onPresetChange(opt.key)}
            className="text-xs"
          >
            {opt.label}
          </Button>
        ))}

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="w-full sm:w-auto">
            <CalendarPickerTH
              value={customStart ? new Date(`${customStart}T00:00:00`).toISOString() : null}
              ariaLabel="จากวันที่"
              onChange={(iso) => onCustomStartChange(isoToYMD(iso))}
            />
          </div>
          <span className="text-xs text-text-tertiary">-</span>
          <div className="w-full sm:w-auto">
            <CalendarPickerTH
              value={customEnd ? new Date(`${customEnd}T00:00:00`).toISOString() : null}
              ariaLabel="ถึงวันที่"
              onChange={(iso) => onCustomEndChange(isoToYMD(iso))}
            />
          </div>
        </div>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="เปิดปฏิทินช่วงวันที่"
              aria-haspopup="dialog"
              aria-expanded={calendarOpen}
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-surface transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20',
                calendarOpen
                  ? 'border-brand-500 text-brand-600'
                  : 'border-border-default text-text-tertiary hover:border-border-hover hover:text-text-primary',
              )}
            >
              <CalendarDays className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent role="dialog" aria-label="ช่วงวันที่" align="start" className="w-auto p-3">
            <DateRangeCalendarTH
              start={customStart}
              end={customEnd}
              onSelect={(start, end) => {
                onCustomStartChange(start);
                onCustomEndChange(end);
                onPresetChange('custom');
                setCalendarOpen(false);
              }}
              onCancel={() => setCalendarOpen(false)}
            />
          </PopoverContent>
        </Popover>

        {showClear && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            leftIcon={<RotateCcw className="w-4 h-4" />}
            className="text-xs"
          >
            ล้างตัวกรอง
          </Button>
        )}
      </div>

      {problem && (
        <div
          role="alert"
          className="flex w-full items-center gap-2 rounded-lg bg-danger/10 p-2 text-xs text-danger-text"
        >
          <span>{CUSTOM_RANGE_MESSAGES[problem]}</span>
        </div>
      )}
    </div>
  );
}

export default DatePresetFilter;
