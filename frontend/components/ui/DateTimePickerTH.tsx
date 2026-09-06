"use client";

import { useRef, useState } from "react";
import CalendarPickerTH from "@/components/ui/CalendarPickerTH";
import { cn, isoToYMD, isoToHM } from "@/lib/utils";

export interface DateTimePickerTHProps {
  /** Full ISO datetime (with timezone) or null. Controlled. */
  value: string | null;
  /** Called with a complete ISO datetime once BOTH parts are chosen; null while either is pending. */
  onChange: (iso: string | null) => void;
  /** aria-label for the date field (forwarded to CalendarPickerTH's day input). */
  dateLabel: string;
  /** aria-label for the time field. */
  timeLabel: string;
  /** Also reports the local YYYY-MM-DD date part on every date change — for
   *  callers that need to know "a date was picked" while the time is still
   *  pending (e.g. switching Send-now/Schedule buttons). */
  onDateChange?: (dateYMD: string | null) => void;
  /** Additionally disable the time field (it is always disabled until a date is chosen). */
  timeDisabled?: boolean;
  className?: string;
  dateClassName?: string;
  timeInputClassName?: string;
}

const DEFAULT_TIME_CLASSES =
  "h-10 w-32 rounded-xl border border-border-default bg-surface px-3 text-sm text-text-primary " +
  "focus:outline-none focus:ring-2 focus:ring-brand-500/20";

/**
 * Thai (พ.ศ.) date + time, composed once for every scheduler form.
 *
 * Timezone law (PR #226): internal parts are LOCAL wall-clock via isoToYMD /
 * isoToHM — never UTC slicing; the emitted value is `new Date(local).toISOString()`.
 *
 * Partial selections are preserved: `value` echoes of the component's own
 * emissions are ignored (lastEmittedRef), so "date picked, time pending" is
 * not clobbered by the null it just emitted. A parent that needs a hard
 * reset must remount the field (key change) — a plain reset to null is
 * indistinguishable from the component's own null echo.
 */
export function DateTimePickerTH({
  value,
  onChange,
  dateLabel,
  timeLabel,
  onDateChange,
  timeDisabled = false,
  className,
  dateClassName,
  timeInputClassName,
}: DateTimePickerTHProps) {
  const [datePart, setDatePart] = useState(() => isoToYMD(value ?? null));
  const [timePart, setTimePart] = useState(() => isoToHM(value ?? null));
  const lastEmittedRef = useRef<string | null>(value ?? null);

  // Sync from an EXTERNAL value change (e.g. edit-page load) during render —
  // the React-recommended "adjust state when a prop changes" pattern. The
  // component's own emissions echo back as `value`; re-deriving from those
  // would clobber a pending partial selection (date picked, time still empty).
  const incoming = value ?? null;
  const [prevIncoming, setPrevIncoming] = useState<string | null>(incoming);
  if (incoming !== prevIncoming) {
    setPrevIncoming(incoming);
    if (incoming !== lastEmittedRef.current) {
      setDatePart(isoToYMD(incoming));
      setTimePart(isoToHM(incoming));
    }
  }

  const emit = (date: string, time: string) => {
    if (!date || !time) {
      lastEmittedRef.current = null;
      onChange(null);
      return;
    }
    const combined = new Date(`${date}T${time}`);
    if (isNaN(combined.getTime())) return;
    const iso = combined.toISOString();
    lastEmittedRef.current = iso;
    onChange(iso);
  };

  return (
    <div className={cn("flex flex-wrap items-start gap-3", className)}>
      <div className={cn("w-52", dateClassName)}>
        <CalendarPickerTH
          ariaLabel={dateLabel}
          value={datePart || null}
          onChange={(iso) => {
            const nextDate = iso ? isoToYMD(iso) : "";
            setDatePart(nextDate);
            onDateChange?.(nextDate || null);
            emit(nextDate, timePart);
          }}
        />
      </div>
      <input
        type="time"
        aria-label={timeLabel}
        value={timePart}
        onChange={(e) => {
          const nextTime = e.target.value ? e.target.value.slice(0, 5) : "";
          setTimePart(nextTime);
          emit(datePart, nextTime);
        }}
        disabled={!datePart || timeDisabled}
        className={cn(DEFAULT_TIME_CLASSES, timeInputClassName)}
      />
    </div>
  );
}
