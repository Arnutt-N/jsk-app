import { useMemo, useState } from 'react';
import {
  STANDARD_DATE_PRESETS,
  customRangeProblem,
  presetOptionToDates,
  type DatePresetOption,
} from '@/lib/date-range';

/** Shared preset + custom-range filter state for admin list pages.
 *
 * Five pages (requests, friends, chat-histories, broadcast, bookings,
 * friends/history) each kept their own `datePreset/customStart/customEnd`
 * triple plus an identical `onPresetChange` handler and an identical
 * reversed-pair fetch guard. One hook owns the triple, the handlers, and
 * the derived values callers need:
 *
 * - `range`: explicit {start, end} from the pickers (single source of
 *   truth — presets resolve into the same two strings the pickers edit,
 *   so there is no separate "preset mode" to keep in sync).
 * - `isBlocked`: reversed pair — caller skips the fetch, DatePresetFilter
 *   already shows the Thai reason.
 * - `params`: URLSearchParams-ready {start_date, end_date} (empty when
 *   unfiltered or blocked), so callers append without branching.
 */
export function useDatePresetFilter(presets: DatePresetOption[] = STANDARD_DATE_PRESETS) {
  const [datePreset, setDatePreset] = useState<string | null>(null);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const isBlocked = customStart !== '' && customEnd !== '' && customStart > customEnd;
  const problem = customRangeProblem(customStart, customEnd);
  const hasFilter = datePreset !== null || customStart !== '' || customEnd !== '';

  // Memoized so callers can safely put `params` in a fetch useCallback
  // dep array: a fresh object every render would refetch in a loop and let
  // a stale response overwrite newer state (e.g. a PATCH-updated row).
  const params: { start_date?: string; end_date?: string } = useMemo(
    () =>
      !isBlocked && customStart !== '' && customEnd !== ''
        ? { start_date: customStart, end_date: customEnd }
        : {},
    [customStart, customEnd, isBlocked],
  );

  const range: { start: string; end: string } | null =
    params.start_date && params.end_date
      ? { start: params.start_date, end: params.end_date }
      : null;

  const handlePresetChange = (key: string) => {
    setDatePreset(key);
    if (key === 'custom') {
      setCustomStart('');
      setCustomEnd('');
    } else {
      const opt = presets.find((p) => p.key === key);
      if (opt) {
        const { start, end } = presetOptionToDates(opt);
        setCustomStart(start);
        setCustomEnd(end);
      }
    }
  };

  const handleCustomStartChange = (value: string) => {
    setDatePreset(null);
    setCustomStart(value);
  };

  const handleCustomEndChange = (value: string) => {
    setDatePreset(null);
    setCustomEnd(value);
  };

  /** Pin both ends to one day (calendar-view day pick). */
  const pinSingleDay = (day: string) => {
    setDatePreset(null);
    setCustomStart(day);
    setCustomEnd(day);
  };

  const clear = () => {
    setDatePreset(null);
    setCustomStart('');
    setCustomEnd('');
  };

  return {
    datePreset,
    customStart,
    customEnd,
    range,
    params,
    problem,
    hasFilter,
    isBlocked,
    presets,
    handlePresetChange,
    handleCustomStartChange,
    handleCustomEndChange,
    pinSingleDay,
    clear,
  };
}

export type DatePresetFilterState = ReturnType<typeof useDatePresetFilter>;
