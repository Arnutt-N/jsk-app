'use client';

import { Button } from '@/components/ui/Button';
import CalendarPickerTH from '@/components/ui/CalendarPickerTH';
import { isoToYMD } from '@/lib/utils';
import {
  CUSTOM_RANGE_MESSAGES,
  STANDARD_DATE_PRESETS,
  customRangeProblem,
  type DatePresetOption,
} from '@/lib/date-range';
import { RotateCcw } from 'lucide-react';

const FILTER_BUTTON_CLASSES = 'rounded-xl text-xs';

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

/** Shared admin date filter: one button per real preset, then two Thai date
 *  boxes that both accept typing and open their own calendar, then clear.
 *  `custom` is a marker in `presets`, not a choice: it is what `preset` becomes
 *  once either date box is edited, so it gets no button of its own. */
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
  const problem = customRangeProblem(customStart, customEnd);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {presets
          .filter((opt) => opt.key !== 'custom')
          .map((opt) => (
            <Button
              key={opt.key}
              variant={preset === opt.key ? 'primary' : 'outline'}
              size="sm"
              onClick={() => onPresetChange(opt.key)}
              className={FILTER_BUTTON_CLASSES}
            >
              {opt.label}
            </Button>
          ))}

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <span
            aria-hidden="true"
            className="hidden h-6 w-px shrink-0 bg-border-default sm:block"
          />
          <span className="shrink-0 text-xs text-text-tertiary">กำหนดเอง</span>
          <div className="min-w-0 grow basis-48 sm:w-auto sm:grow-0 sm:basis-auto">
            <CalendarPickerTH
              value={customStart ? new Date(`${customStart}T00:00:00`).toISOString() : null}
              ariaLabel="จากวันที่"
              onChange={(iso) => onCustomStartChange(isoToYMD(iso))}
            />
          </div>
          <span aria-hidden="true" className="shrink-0 text-xs text-text-tertiary">ถึง</span>
          <div className="min-w-0 grow basis-48 sm:w-auto sm:grow-0 sm:basis-auto">
            <CalendarPickerTH
              value={customEnd ? new Date(`${customEnd}T00:00:00`).toISOString() : null}
              ariaLabel="ถึงวันที่"
              onChange={(iso) => onCustomEndChange(isoToYMD(iso))}
            />
          </div>
        </div>

        {showClear && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            leftIcon={<RotateCcw className="w-4 h-4" />}
            className={FILTER_BUTTON_CLASSES}
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
