import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const BE_OFFSET = 543;

export function toCE(beYear: number): number {
  return beYear - BE_OFFSET;
}

export function toBE(ceYear: number): number {
  return ceYear + BE_OFFSET;
}

export function parseThaiDate(day: number, month: number, beYear: number): Date {
  return new Date(toCE(beYear), month - 1, day);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Convert an ISO date string (or null/empty) to a local `YYYY-MM-DD` string.
 *
 * Uses LOCAL date components (getFullYear/getMonth/getDate) rather than slicing
 * the UTC ISO string. A date picked at local midnight in a +07 timezone would
 * serialize to the previous UTC day via toISOString().slice(0, 10); reading the
 * local parts keeps the calendar day the user actually selected.
 */
export function isoToYMD(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Convert an ISO date string (or null/empty) to a local `HH:mm` time string.
 * Used by the broadcast scheduler to seed/read the separate time field that
 * pairs with the Thai (พ.ศ.) date picker.
 */
export function isoToHM(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}
