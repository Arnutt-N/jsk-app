import { format, subDays } from "date-fns";
import { formatThaiDate } from "@/lib/format-date";

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

/** Why a custom range cannot be applied, or null when it can. */
export type CustomRangeProblem = 'incomplete' | 'reversed';

/** A custom range applies only when both ends are present and ordered. */
function isUsableCustomRange(start: string, end: string): boolean {
  return start !== '' && end !== '' && start <= end;
}

/** What to tell the user about the range they have entered so far. Null when
 *  the range is usable, or when they have not started picking (an empty pair
 *  is the resting state, not a mistake). */
export function customRangeProblem(
  customStart: string,
  customEnd: string,
): CustomRangeProblem | null {
  if (isUsableCustomRange(customStart, customEnd)) return null;
  if (!customStart && !customEnd) return null;
  return customStart && customEnd ? 'reversed' : 'incomplete';
}

/** Thai copy for each problem. `reversed` is the string the Requests page has
 *  always shown; `incomplete` is new, written in the same register. */
export const CUSTOM_RANGE_MESSAGES: Record<CustomRangeProblem, string> = {
  incomplete: 'กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด',
  reversed: 'วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด',
};

/** Resolve preset + custom-picker state to a range. `null` preset (or an
 *  unusable custom range) means unfiltered, so callers skip date params. */
export function resolveDateRange(
  preset: string | null,
  customStart: string,
  customEnd: string,
  presets: DatePresetOption[] = STANDARD_DATE_PRESETS,
): { start: string; end: string } | null {
  if (!preset) return null;
  if (preset === 'custom') {
    return isUsableCustomRange(customStart, customEnd)
      ? { start: customStart, end: customEnd }
      : null;
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

/** The text a date filter's trigger shows for the state the user is in. The
 *  trigger is the only place the range is named, so this covers every state
 *  rather than only the happy one. */
export function describeDateFilter(
  preset: string | null,
  customStart: string,
  customEnd: string,
  presets: DatePresetOption[] = STANDARD_DATE_PRESETS,
): string {
  if (preset === 'custom') {
    const problem = customRangeProblem(customStart, customEnd);
    if (!problem && customStart && customEnd) {
      return `${formatThaiDate(customStart, { dayFormat: 'numeric' })} – ${formatThaiDate(customEnd, { dayFormat: 'numeric' })}`;
    }
    return CUSTOM_RANGE_MESSAGES[problem ?? 'incomplete'];
  }
  return presets.find((p) => p.key === preset)?.label ?? 'ทุกช่วงเวลา';
}

export function toYMD(d: Date): string {
  return format(d, "yyyy-MM-dd");
}
