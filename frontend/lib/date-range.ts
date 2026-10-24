import { format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";

/** Shared Bangkok-calendar date helpers for admin list/report filters. */
export const DEFAULT_RANGE_DAYS = 30;

/** One preset button in {@link DatePresetFilter}. `days` is a fixed lookback;
 *  `yearToDate` means Jan 1 to today; neither set (e.g. `custom`) means the
 *  caller supplies the range via the Thai date pickers. */
export interface DatePresetOption {
  key: string;
  label: string;
  days?: number;
  yearToDate?: boolean;
}

/** Standard presets shared by admin date filters (matches reports/audit). */
export const STANDARD_DATE_PRESETS: DatePresetOption[] = [
  { key: '7d', label: '7 วัน', days: 7 },
  { key: '30d', label: '30 วัน', days: 30 },
  { key: '90d', label: '90 วัน', days: 90 },
  { key: 'year', label: 'ปีนี้', yearToDate: true },
  { key: 'custom', label: 'กำหนดเอง' },
];

/** Presets for LINE Insight-backed stats (API serves short lookbacks). */
export const INSIGHT_DATE_PRESETS: DatePresetOption[] = [
  { key: '7d', label: '7 วัน', days: 7 },
  { key: '14d', label: '14 วัน', days: 14 },
  { key: '30d', label: '30 วัน', days: 30 },
  { key: '60d', label: '60 วัน', days: 60 },
  { key: '90d', label: '90 วัน', days: 90 },
  { key: 'custom', label: 'กำหนดเอง' },
];

/** Resolve one preset option to an explicit YYYY-MM-DD range ending today. */
export function presetOptionToDates(opt: DatePresetOption): { start: string; end: string } {
  const to = new Date();
  const end = toYMD(to);
  if (opt.yearToDate) {
    return { start: toYMD(new Date(to.getFullYear(), 0, 1)), end };
  }
  return { start: toYMD(subDays(to, opt.days ?? DEFAULT_RANGE_DAYS)), end };
}

/** Resolve preset + custom-picker state to a range. `null` preset (or an
 *  half-picked custom range) means unfiltered, so callers skip date params. */
export function resolveDateRange(
  preset: string | null,
  customStart: string,
  customEnd: string,
  presets: DatePresetOption[] = STANDARD_DATE_PRESETS,
): { start: string; end: string } | null {
  if (!preset) return null;
  if (preset === 'custom') {
    if (customStart && customEnd) return { start: customStart, end: customEnd };
    return null;
  }
  const opt = presets.find((p) => p.key === preset);
  if (!opt) return null;
  return presetOptionToDates(opt);
}

/** Reports/audit behavior: always a range, falling back to `fallbackKey`
 *  (30d) when nothing usable is selected. */
export function resolveDateRangeWithFallback(
  preset: string | null,
  customStart: string,
  customEnd: string,
  presets: DatePresetOption[] = STANDARD_DATE_PRESETS,
  fallbackKey = '30d',
): { start: string; end: string } {
  return (
    resolveDateRange(preset, customStart, customEnd, presets) ??
    presetOptionToDates(presets.find((p) => p.key === fallbackKey) ?? { key: fallbackKey, label: '', days: DEFAULT_RANGE_DAYS })
  );
}

export function toYMD(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function defaultDateRange(): { from: Date; to: Date } {
  const to = new Date();
  return { from: subDays(to, DEFAULT_RANGE_DAYS), to };
}

export function isDefaultRange(r: DateRange | undefined): boolean {
  if (!r?.from || !r.to) return false;
  const to = new Date();
  const diffDays = Math.round((to.getTime() - r.from.getTime()) / 86400000);
  return diffDays === DEFAULT_RANGE_DAYS && toYMD(r.to) === toYMD(to);
}
