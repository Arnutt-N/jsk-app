import { format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";

/** Shared Bangkok-calendar date helpers for admin list/report filters. */
export const DEFAULT_RANGE_DAYS = 30;

export function toYMD(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function defaultDateRange(): DateRange {
  const to = new Date();
  return { from: subDays(to, DEFAULT_RANGE_DAYS), to };
}

export function isDefaultRange(r: DateRange | undefined): boolean {
  if (!r?.from || !r.to) return false;
  const to = new Date();
  const diffDays = Math.round((to.getTime() - r.from.getTime()) / 86400000);
  return diffDays === DEFAULT_RANGE_DAYS && toYMD(r.to) === toYMD(to);
}
