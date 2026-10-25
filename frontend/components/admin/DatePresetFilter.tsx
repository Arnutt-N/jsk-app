'use client';

import { Button } from '@/components/ui/Button';
import CalendarPickerTH from '@/components/ui/CalendarPickerTH';
import { isoToYMD } from '@/lib/utils';
import { STANDARD_DATE_PRESETS, type DatePresetOption } from '@/lib/date-range';
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
        <div className="flex items-center gap-2">
          <div className="w-44">
            <CalendarPickerTH
              value={customStart || null}
              onChange={(iso) => onCustomStartChange(isoToYMD(iso))}
            />
          </div>
          <span className="text-text-tertiary text-xs">-</span>
          <div className="w-44">
            <CalendarPickerTH
              value={customEnd || null}
              onChange={(iso) => onCustomEndChange(isoToYMD(iso))}
            />
          </div>
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
