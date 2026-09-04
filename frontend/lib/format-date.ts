/**
 * Central Thai Buddhist Era (พ.ศ.) date and time formatting utility.
 * Uses Bangkok timezone ('Asia/Bangkok') for deterministic time rendering
 * across all client and server environments.
 */

import { daysInMonth } from '@/lib/utils';

export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
] as const;

export const THAI_MONTHS_LONG = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
] as const;

export interface FormatThaiDateOptions {
  includeTime?: boolean;
  dayFormat?: 'numeric' | '2-digit'; // '3' vs '03' (default '2-digit')
  yearFormat?: 'numeric' | '2-digit'; // '2569' vs '69' (default 'numeric')
  monthFormat?: 'short' | 'long';     // 'ก.ย.' vs 'กันยายน' (default 'short')
  fallback?: string;                 // default '—'
}

// Module-scoped formatter to eliminate repeated ICU instantiation overhead
const BANGKOK_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
});

/**
 * Extract calendar parts in Bangkok timezone without local timezone shift.
 */
export function parseDateParts(input: string | Date | null | undefined): {
  year: number;
  month: number; // 0-indexed (0 = Jan, 11 = Dec)
  day: number;
  hours: number;
  minutes: number;
} | null {
  if (!input) return null;

  let d: Date;
  if (input instanceof Date) {
    d = input;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Date-only string (YYYY-MM-DD): parse calendar parts directly to avoid UTC shift
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, day] = trimmed.split('-').map(Number);
      if (m < 1 || m > 12 || day < 1) return null;
      const maxDays = daysInMonth(y, m);
      if (day > maxDays) return null;
      return { year: y, month: m - 1, day, hours: 0, minutes: 0 };
    }
    d = new Date(trimmed);
  } else {
    return null;
  }

  if (isNaN(d.getTime())) return null;

  const parts = BANGKOK_FORMATTER.formatToParts(d);
  const partMap: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      partMap[p.type] = parseInt(p.value, 10);
    }
  }

  return {
    year: partMap.year,
    month: (partMap.month || 1) - 1,
    day: partMap.day,
    hours: partMap.hour === 24 ? 0 : (partMap.hour ?? 0),
    minutes: partMap.minute ?? 0,
  };
}

/**
 * Formats a date string or Date object into Thai Buddhist Era format.
 * Defaults to 2-digit day and 4-digit BE year (e.g. '03 ก.ย. 2569').
 * If includeTime is true: appends time with ' น.' (e.g. '03 ก.ย. 2569 07:44 น.').
 */
export function formatThaiDate(
  isoDate: string | Date | null | undefined,
  options?: FormatThaiDateOptions,
): string {
  const fallback = options?.fallback ?? '—';
  if (!isoDate) return fallback;

  const parts = parseDateParts(isoDate);
  if (!parts) return fallback;

  const day = parts.day
    .toString()
    .padStart(options?.dayFormat === 'numeric' ? 1 : 2, '0');

  const month =
    options?.monthFormat === 'long'
      ? THAI_MONTHS_LONG[parts.month]
      : THAI_MONTHS_SHORT[parts.month];

  const beYear = parts.year + 543;
  const year =
    options?.yearFormat === '2-digit'
      ? (beYear % 100).toString().padStart(2, '0')
      : beYear.toString();

  let formatted = `${day} ${month} ${year}`;

  if (options?.includeTime) {
    const hours = parts.hours.toString().padStart(2, '0');
    const minutes = parts.minutes.toString().padStart(2, '0');
    formatted += ` ${hours}:${minutes} น.`;
  }

  return formatted;
}

/**
 * Convenience helper for date-only formatting.
 */
export function formatThaiDateOnly(
  isoDate: string | Date | null | undefined,
  options?: FormatThaiDateOptions,
): string {
  return formatThaiDate(isoDate, { ...options, includeTime: false });
}

/**
 * Convenience helper for date + time formatting.
 */
export function formatThaiDateTime(
  isoDate: string | Date | null | undefined,
  options?: FormatThaiDateOptions,
): string {
  return formatThaiDate(isoDate, { ...options, includeTime: true });
}
