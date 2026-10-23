'use client';

import React, { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { format, subDays, startOfYear } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Calendar } from './Calendar';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import type { DateRange } from 'react-day-picker';

interface Preset {
  label: string;
  /** Fixed lookback in days; ignored when `getRange` is set. */
  days?: number;
  /** Custom range (e.g. year-to-date); wins over `days`. */
  getRange?: () => DateRange;
}

interface DateRangePickerProps {
  value?: DateRange;
  onChange: (range: DateRange | undefined) => void;
  presets?: Preset[];
  placeholder?: string;
  className?: string;
}

export const standardDatePresets: Preset[] = [
  { label: '7 วัน', days: 7 },
  { label: '30 วัน', days: 30 },
  { label: '90 วัน', days: 90 },
  {
    label: 'ปีนี้',
    getRange: () => {
      const to = new Date();
      return { from: startOfYear(to), to };
    },
  },
];

const defaultPresets: Preset[] = standardDatePresets;

export function DateRangePicker({
  value,
  onChange,
  presets = defaultPresets,
  placeholder = 'เลือกช่วงวันที่',
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const handlePreset = (preset: Preset) => {
    if (preset.getRange) {
      onChange(preset.getRange());
    } else {
      const to = new Date();
      onChange({ from: subDays(to, preset.days ?? 30), to });
    }
    setOpen(false);
  };

  const displayValue = value?.from
    ? value.to
      ? `${format(value.from, 'd MMM yy', { locale: th })} – ${format(value.to, 'd MMM yy', { locale: th })}`
      : format(value.from, 'd MMM yy', { locale: th })
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border border-border-default',
            'text-sm transition-colors hover:border-brand-400',
            'bg-surface dark:bg-surface-dark',
            !value?.from && 'text-text-tertiary',
            value?.from && 'text-text-primary',
            className
          )}
        >
          <CalendarDays className="w-4 h-4 text-text-tertiary" />
          <span>{displayValue}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {/* Preset buttons */}
          <div className="flex flex-col gap-1 p-3 border-r border-border-default">
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset)}
                className="px-3 py-1.5 text-xs font-medium text-text-secondary rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left whitespace-nowrap"
              >
                {preset.label}
              </button>
            ))}
          </div>
          {/* Calendar */}
          <div className="p-3">
            <Calendar
              mode="range"
              selected={value}
              onSelect={onChange}
              numberOfMonths={2}
              defaultMonth={value?.from}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export type { DateRangePickerProps, Preset };
export default DateRangePicker;
