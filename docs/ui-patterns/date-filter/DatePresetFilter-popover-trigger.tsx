'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import CalendarPickerTH from '@/components/ui/CalendarPickerTH';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import { cn, isoToYMD } from '@/lib/utils';
import {
  CUSTOM_RANGE_MESSAGES,
  STANDARD_DATE_PRESETS,
  customRangeProblem,
  describeDateFilter,
  type DatePresetOption,
} from '@/lib/date-range';
import { CalendarDays, Check, ChevronDown, RotateCcw, AlertCircle } from 'lucide-react';

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

/** Preset-button row only (for filter panels that keep their own date inputs). */
export function DatePresetButtons({
  preset,
  onPresetChange,
  presets = STANDARD_DATE_PRESETS,
}: Pick<DatePresetFilterProps, 'preset' | 'onPresetChange' | 'presets'>) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
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
    </div>
  );
}

/** Shared admin date filter: one trigger naming the active range, a panel with
 *  the presets and Thai custom pickers, and a clear button. */
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
  const [open, setOpen] = useState(false);

  // A page can change `preset` from outside (its own reset, or a preset picked
  // through DatePresetButtons). The panel's custom pickers only make sense
  // while that preset is still selected. Adjusting during render, rather than
  // in an effect, is React's documented way to react to a changed prop.
  const [seenPreset, setSeenPreset] = useState(preset);
  if (seenPreset !== preset) {
    setSeenPreset(preset);
    if (preset !== 'custom') setOpen(false);
  }

  const problem = customRangeProblem(customStart, customEnd);

  const changeStart = (next: string) => {
    onCustomStartChange(next);
    if (next && customEnd && !customRangeProblem(next, customEnd)) setOpen(false);
  };

  const changeEnd = (next: string) => {
    onCustomEndChange(next);
    if (customStart && next && !customRangeProblem(customStart, next)) setOpen(false);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="ตัวกรองช่วงวันที่"
            className={cn(
              'flex h-9 items-center gap-2 rounded-xl border bg-surface px-3 text-xs font-medium text-text-primary',
              'transition-all duration-200 ease-out hover:border-border-hover',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20',
              open ? 'border-brand-500' : 'border-border-default',
            )}
          >
            <CalendarDays className="h-4 w-4 text-text-tertiary" />
            <span>{describeDateFilter(preset, customStart, customEnd, presets)}</span>
            {problem && (
              <AlertCircle
                className="h-3.5 w-3.5 text-danger-text"
                aria-label={CUSTOM_RANGE_MESSAGES[problem]}
              />
            )}
            <ChevronDown
              className={cn(
                'h-4 w-4 text-text-tertiary transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          role="dialog"
          aria-label="ช่วงวันที่"
          align="start"
          className="w-80"
        >
          <div className="flex flex-col gap-1">
            {presets.map((opt) => {
              const active = preset === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    onPresetChange(opt.key);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                    active
                      ? 'bg-brand-500 font-semibold text-white'
                      : 'text-text-primary hover:bg-bg',
                  )}
                >
                  <span>{opt.label}</span>
                  {active && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>

          {preset === 'custom' && (
            <div className="mt-3 flex flex-col gap-2 border-t border-border-default pt-3">
              <CalendarPickerTH
                value={customStart || null}
                ariaLabel="จากวันที่"
                onChange={(iso) => changeStart(isoToYMD(iso))}
              />
              <span className="text-xs text-text-tertiary">-</span>
              <CalendarPickerTH
                value={customEnd || null}
                ariaLabel="ถึงวันที่"
                onChange={(iso) => changeEnd(isoToYMD(iso))}
              />
              {problem && (
                <div
                  role="alert"
                  className="flex w-full items-center gap-2 rounded-lg bg-danger/10 p-2 text-xs text-danger-text"
                >
                  <span>{CUSTOM_RANGE_MESSAGES[problem]}</span>
                </div>
              )}
            </div>
          )}
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
  );
}

export default DatePresetFilter;
