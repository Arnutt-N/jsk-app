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

/** Shared admin date filter: preset buttons + Thai custom pickers + clear. */
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
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <DatePresetButtons preset={preset} onPresetChange={onPresetChange} presets={presets} />
      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <CalendarPickerTH
              value={customStart || null}
              ariaLabel="จากวันที่"
              onChange={(iso) => onCustomStartChange(isoToYMD(iso))}
            />
          </div>
          <span className="text-text-tertiary text-xs">-</span>
          <div className="w-44">
            <CalendarPickerTH
              value={customEnd || null}
              ariaLabel="ถึงวันที่"
              onChange={(iso) => onCustomEndChange(isoToYMD(iso))}
            />
          </div>
          {(() => {
            const problem = customRangeProblem(customStart, customEnd);
            return problem ? (
              <div
                role="alert"
                className="mt-2 flex w-full items-center gap-2 rounded-lg bg-danger/10 p-2 text-xs text-danger-text"
              >
                <span>{CUSTOM_RANGE_MESSAGES[problem]}</span>
              </div>
            ) : null;
          })()}
        </div>
      )}
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
