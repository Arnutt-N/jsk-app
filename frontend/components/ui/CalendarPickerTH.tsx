"use client";

import { useState, useRef, useEffect, useMemo, type FormEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { parseThaiDate, toBE, daysInMonth, cn } from "@/lib/utils";
import { toISODate } from "@/lib/booking";
import { Popover, PopoverTrigger, PopoverContent } from "./Popover";
import {
  parseDateParts,
  formatThaiDate,
  THAI_MONTHS_LONG,
  THAI_MONTHS_SHORT,
} from "@/lib/format-date";

export interface CalendarPickerTHProps {
  label?: string;
  ariaLabel?: string;
  value: string | null;
  onChange: (isoDate: string | null) => void;
  error?: string;
  helper?: string;
  required?: boolean;
  className?: string;
  /** Booking window: days the predicate rejects are non-bookable. */
  isDateDisabled?: (isoDate: string) => boolean;
  /** ISO YYYY-MM-DD window edges; navigation clamps into them when both set. */
  minDate?: string | null;
  maxDate?: string | null;
}

const THAI_WEEKDAYS_SHORT = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"] as const;

function firstOfMonth(ceYear: number, monthZeroBased: number): Date {
  return new Date(ceYear, monthZeroBased, 1);
}

function thaiDow(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function partsFrom(value: string | null): { day: string; month: string; beYear: string } {
  if (!value) return { day: "", month: "", beYear: "" };
  const parts = parseDateParts(value);
  if (!parts) return { day: "", month: "", beYear: "" };
  return {
    day: parts.day.toString().padStart(2, "0"),
    month: (parts.month + 1).toString().padStart(2, "0"),
    beYear: toBE(parts.year).toString(),
  };
}

function formatDisplayDate(value: string | null): string {
  if (!value) return "";
  return formatThaiDate(value, { dayFormat: 'numeric', fallback: '' });
}

export default function CalendarPickerTH({
  label,
  ariaLabel,
  value,
  onChange,
  error,
  helper,
  required,
  className,
  isDateDisabled,
  minDate,
  maxDate,
}: CalendarPickerTHProps) {
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [localError, setLocalError] = useState<string>("");
  const [viewMonthOverride, setViewMonthOverride] = useState<Date | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [calendarView, setCalendarView] = useState<"date" | "month" | "year">("date");
  const [yearGridStart, setYearGridStart] = useState<number>(0);

  const selectedParts = useMemo(() => parseDateParts(value), [value]);

  // Booking-window clamp helpers. ISO YYYY-MM-DD strings compare
  // lexicographically, so day checks are plain string bounds; month
  // navigation compares year/month keys only.
  const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const monthKeyOf = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
  const minMonthKey = minDate ? monthKeyOf(minDate) : null;
  const maxMonthKey = maxDate ? monthKeyOf(maxDate) : null;
  const clampMonth = (d: Date): Date => {
    if (minMonthKey === null || maxMonthKey === null) return d;
    const key = monthKey(d);
    if (key < minMonthKey) return firstOfMonth(Math.floor(minMonthKey / 12), minMonthKey % 12);
    if (key > maxMonthKey) return firstOfMonth(Math.floor(maxMonthKey / 12), maxMonthKey % 12);
    return d;
  };

  const viewMonth = useMemo<Date>(() => {
    if (viewMonthOverride) return clampMonth(viewMonthOverride);
    if (value) {
      const parts = parseDateParts(value);
      if (parts) return clampMonth(firstOfMonth(parts.year, parts.month));
    }
    const now = new Date();
    return clampMonth(firstOfMonth(now.getFullYear(), now.getMonth()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMonthOverride, value, minDate, maxDate]);

  const prevValueRef = useRef(value);
  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      if (!value) {
        setIsEditing(false);
      }
    }
    if (!isEditing) {
      const parts = partsFrom(value);
      if (dayRef.current && dayRef.current.value !== parts.day) {
        dayRef.current.value = parts.day;
      }
      if (monthRef.current && monthRef.current.value !== parts.month) {
        monthRef.current.value = parts.month;
      }
      if (yearRef.current && yearRef.current.value !== parts.beYear) {
        yearRef.current.value = parts.beYear;
      }
    }
  }, [value, isEditing]);

  // Radix Popover (Portal) handles Esc + outside-dismiss natively,
  // so no manual keydown/mousedown listeners are needed here.

  const validateAndUpdate = () => {
    const day = dayRef.current?.value ?? "";
    const month = monthRef.current?.value ?? "";
    const beYear = yearRef.current?.value ?? "";
    setLocalError("");

    if (!day && !month && !beYear) {
      onChange(null);
      setViewMonthOverride(null);
      setIsEditing(false);
      return;
    }
    if (!day || !month || !beYear) return;

    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const beYearNum = parseInt(beYear, 10);

    if (dayNum < 1 || dayNum > 31) {
      setLocalError("วันที่ไม่ถูกต้อง (1-31)");
      return;
    }
    if (monthNum < 1 || monthNum > 12) {
      setLocalError("เดือนไม่ถูกต้อง (1-12)");
      return;
    }
    if (beYearNum < 2400 || beYearNum > 2700) {
      setLocalError("ปี พ.ศ. ไม่ถูกต้อง (2400-2700)");
      return;
    }

    try {
      const date = parseThaiDate(dayNum, monthNum, beYearNum);
      if (isNaN(date.getTime())) {
        setLocalError("วันที่ไม่ถูกต้อง");
        return;
      }
      if (date.getDate() !== dayNum || date.getMonth() + 1 !== monthNum) {
        setLocalError("วันที่ไม่มีในเดือนนี้");
        return;
      }
      const isoDay = toISODate(date);
      if ((minDate && isoDay < minDate) || (maxDate && isoDay > maxDate)) {
        setLocalError("วันที่อยู่นอกช่วงที่เปิดให้จอง");
        return;
      }
      if (isDateDisabled?.(isoDay)) {
        setLocalError("วันที่เลือกไม่สามารถจองได้");
        return;
      }
      onChange(date.toISOString());
      setViewMonthOverride(null);
      setIsEditing(false);
    } catch {
      setLocalError("วันที่ไม่ถูกต้อง");
    }
  };

  const handleInput = (e: FormEvent<HTMLInputElement>, type: 'day' | 'month' | 'year') => {
    setIsEditing(true);
    if (isOpen) setIsOpen(false);
    const el = e.currentTarget;
    const clean = el.value.replace(/\D/g, "");
    const maxLen = type === 'year' ? 4 : 2;
    el.value = clean.slice(0, maxLen);

    if (type === 'day' && clean.length === 2 && monthRef.current) {
      monthRef.current.focus();
      monthRef.current.select();
    } else if (type === 'month' && clean.length === 2 && yearRef.current) {
      yearRef.current.focus();
      yearRef.current.select();
    }

    // Commit immediately only when user just completed the year field — committing
    // mid-month-keystroke would let the post-commit useEffect rewrite the input back
    // to its zero-padded form and block entry of two-digit months like "10".
    if (type === 'year' && clean.length === 4) {
      const dayLen = dayRef.current?.value.length ?? 0;
      const monthLen = monthRef.current?.value.length ?? 0;
      if (dayLen >= 1 && monthLen >= 1) {
        queueMicrotask(() => validateAndUpdate());
      }
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        validateAndUpdate();
      }
    }, 100);
  };

  const goPrevMonth = () => {
    const next = new Date(viewMonth);
    next.setMonth(next.getMonth() - 1);
    if (minMonthKey !== null && monthKey(next) < minMonthKey) return;
    setViewMonthOverride(next);
  };
  const goNextMonth = () => {
    const next = new Date(viewMonth);
    next.setMonth(next.getMonth() + 1);
    if (maxMonthKey !== null && monthKey(next) > maxMonthKey) return;
    setViewMonthOverride(next);
  };
  const openMonthView = () => setCalendarView("month");
  const openYearView = () => {
    const beNow = toBE(viewMonth.getFullYear());
    setYearGridStart(beNow - (beNow % 12));
    setCalendarView("year");
  };
  const goPrevYear = () => {
    const next = new Date(viewMonth);
    next.setFullYear(next.getFullYear() - 1);
    if (minMonthKey !== null && monthKey(next) < minMonthKey) return;
    setViewMonthOverride(next);
  };
  const goNextYear = () => {
    const next = new Date(viewMonth);
    next.setFullYear(next.getFullYear() + 1);
    if (maxMonthKey !== null && monthKey(next) > maxMonthKey) return;
    setViewMonthOverride(next);
  };
  const goPrevDecade = () =>
    setYearGridStart((s) => {
      if (minDate) {
        const minBE = Number(minDate.slice(0, 4)) + 543;
        if (s - 1 < minBE) return s;
      }
      return s - 12;
    });
  const goNextDecade = () =>
    setYearGridStart((s) => {
      if (maxDate) {
        const maxBE = Number(maxDate.slice(0, 4)) + 543;
        if (s + 12 > maxBE) return s;
      }
      return s + 12;
    });
  // Drill-down: year grid → month grid → day grid. Picking a month returns to
  // the day view; picking a year steps down into the month view so the user
  // keeps narrowing instead of jumping straight back to days.
  const pickMonth = (monthZeroBased: number) => {
    const next = new Date(viewMonth);
    next.setMonth(monthZeroBased);
    setViewMonthOverride(next);
    setCalendarView("date");
  };
  const pickYear = (beYear: number) => {
    const next = new Date(viewMonth);
    next.setFullYear(beYear - 543);
    setViewMonthOverride(next);
    setCalendarView("month");
  };

  const dayCells: ReactNode[] = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDow = thaiDow(firstOfMonth(year, month));
    const dayCount = daysInMonth(year, month + 1);
    const isSelectedDay = (d: number): boolean =>
      !!selectedParts &&
      selectedParts.year === year &&
      selectedParts.month === month &&
      selectedParts.day === d;
    const today = new Date();
    const isToday = (d: number): boolean =>
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === d;

    const cells: ReactNode[] = [];
    for (let i = 0; i < firstDow; i++) {
      cells.push(<div key={`pad-${i}`} className="h-10" />);
    }
    for (let d = 1; d <= dayCount; d++) {
      const sel = isSelectedDay(d);
      const tod = isToday(d);
      const cellISO = toISODate(new Date(year, month, d));
      const disabled = isDateDisabled?.(cellISO) ?? false;
      cells.push(
        <motion.button
          key={d}
          type="button"
          whileHover={disabled ? undefined : { scale: 1.1 }}
          whileTap={disabled ? undefined : { scale: 0.95 }}
          onClick={() => {
            if (disabled) return;
            const picked = new Date(year, month, d);
            onChange(picked.toISOString());
            setViewMonthOverride(null);
            setLocalError("");
            setIsOpen(false);
            setCalendarView("date");
            setIsEditing(false);
          }}
          aria-label={`${d} ${THAI_MONTHS_LONG[month]} ${toBE(year)}`}
          aria-current={tod ? "date" : undefined}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : undefined}
          className={cn(
            "h-10 w-10 rounded-xl text-sm font-medium transition-all duration-150",
            disabled
              ? "opacity-40 cursor-not-allowed text-text-primary"
              : sel
                ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md"
                : tod
                  ? "bg-blue-50 text-blue-600 font-semibold ring-2 ring-blue-200"
                  : "text-text-primary hover:bg-bg dark:text-slate-200 dark:hover:bg-slate-800",
          )}
        >
          {d}
        </motion.button>,
      );
    }
    return cells;
  }, [viewMonth, selectedParts, onChange, isDateDisabled]);

  const parts = partsFrom(value);
  const hasValue = !!value;

  return (
    <Popover
      open={isOpen}
      onOpenChange={(next) => {
        setIsOpen(next);
        setCalendarView("date");
      }}
    >
    <div className={cn("w-full relative", className)} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-text-secondary mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className={cn(
        "group relative flex items-center pl-1 pr-3 py-1 rounded-xl border-2 bg-surface transition-all duration-200",
        error || localError
          ? "border-red-300 focus-within:border-red-500"
          : "border-border-default hover:border-text-tertiary focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"
      )}>
        {/* Day Input */}
        <input
          ref={dayRef}
          type="text"
          inputMode="numeric"
          placeholder="วว"
          defaultValue={parts.day}
          onInput={(e) => handleInput(e, 'day')}
          onBlur={handleBlur}
          onFocus={() => setIsEditing(true)}
          aria-label={ariaLabel || "วันที่"}
          className="w-9 px-1 py-1.5 text-center text-sm font-medium bg-transparent text-text-primary focus:outline-none placeholder:text-gray-300"
        />

        <span className="text-gray-300 font-light">/</span>

        {/* Month Input */}
        <input
          ref={monthRef}
          type="text"
          inputMode="numeric"
          placeholder="ดด"
          defaultValue={parts.month}
          onInput={(e) => handleInput(e, 'month')}
          onBlur={handleBlur}
          onFocus={() => setIsEditing(true)}
          aria-label="เดือน"
          className="w-9 px-1 py-1.5 text-center text-sm font-medium bg-transparent text-text-primary focus:outline-none placeholder:text-gray-300"
        />

        <span className="text-gray-300 font-light">/</span>

        {/* Year Input */}
        <input
          ref={yearRef}
          type="text"
          inputMode="numeric"
          placeholder="ปปปป"
          defaultValue={parts.beYear}
          onInput={(e) => handleInput(e, 'year')}
          onBlur={handleBlur}
          onFocus={() => setIsEditing(true)}
          aria-label="ปี พ.ศ."
          className="w-14 px-1 py-1.5 text-center text-sm font-medium bg-transparent text-text-primary focus:outline-none placeholder:text-gray-300"
        />

        <div className="relative ml-auto flex shrink-0 items-center">
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={isOpen}
              aria-label="เปิดปฏิทินเลือกวันที่"
              title="เปิดปฏิทิน (หรือพิมพ์วันที่ในช่องด้านซ้าย)"
              className={cn(
                "p-1.5 rounded-lg transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                isOpen
                  ? "bg-blue-500 text-white"
                  : "text-text-tertiary hover:bg-bg hover:text-text-primary"
              )}
            >
              <Calendar size={18} />
            </button>
          </PopoverTrigger>

          {hasValue && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setIsEditing(false);
                setLocalError("");
                if (dayRef.current) dayRef.current.value = "";
                if (monthRef.current) monthRef.current.value = "";
                if (yearRef.current) yearRef.current.value = "";
              }}
              aria-label="ล้างวันที่"
              className="absolute inset-0 flex items-center justify-center rounded-lg bg-surface text-text-tertiary opacity-0 pointer-events-none transition-opacity hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto [@media(hover:none)]:static [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <PopoverContent
        role="dialog"
        aria-label="ปฏิทิน พ.ศ."
        align="start"
        side="bottom"
        collisionPadding={8}
        className="w-[calc(100vw-32px)] max-w-[340px]"
      >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={
                  calendarView === "date"
                    ? goPrevMonth
                    : calendarView === "month"
                      ? goPrevYear
                      : goPrevDecade
                }
                aria-label={
                  calendarView === "date"
                    ? "เดือนก่อนหน้า"
                    : calendarView === "month"
                      ? "ปีก่อนหน้า"
                      : "ช่วงปีก่อนหน้า"
                }
                className="p-2 rounded-lg hover:bg-bg transition-colors"
              >
                <ChevronLeft size={18} className="text-text-secondary" />
              </button>

              {calendarView === "date" && (
                <button
                  type="button"
                  onClick={openMonthView}
                  aria-label="เลือกเดือน"
                  className="flex-1 mx-1 px-3 py-2 rounded-lg hover:bg-bg transition-colors text-center"
                >
                  <span className="font-semibold text-text-primary">
                    {THAI_MONTHS_LONG[viewMonth.getMonth()]}
                  </span>
                  <span className="ml-2 text-blue-600 font-bold">
                    {toBE(viewMonth.getFullYear())}
                  </span>
                </button>
              )}
              {calendarView === "month" && (
                <button
                  type="button"
                  onClick={openYearView}
                  aria-label="เลือกปี"
                  className="flex-1 mx-1 px-3 py-2 rounded-lg hover:bg-bg transition-colors text-center"
                >
                  <span className="text-blue-600 font-bold">
                    {toBE(viewMonth.getFullYear())}
                  </span>
                </button>
              )}
              {calendarView === "year" && (
                <button
                  type="button"
                  onClick={() => setCalendarView("month")}
                  aria-label="กลับมุมมองเดือน"
                  className="flex-1 mx-1 px-3 py-2 rounded-lg hover:bg-bg transition-colors text-center font-semibold text-text-primary"
                >
                  {yearGridStart} – {yearGridStart + 11}
                </button>
              )}

              <button
                type="button"
                onClick={
                  calendarView === "date"
                    ? goNextMonth
                    : calendarView === "month"
                      ? goNextYear
                      : goNextDecade
                }
                aria-label={
                  calendarView === "date"
                    ? "เดือนถัดไป"
                    : calendarView === "month"
                      ? "ปีถัดไป"
                      : "ช่วงปีถัดไป"
                }
                className="p-2 rounded-lg hover:bg-bg transition-colors"
              >
                <ChevronRight size={18} className="text-text-secondary" />
              </button>
            </div>

            {calendarView === "date" && (
              <>
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {THAI_WEEKDAYS_SHORT.map((d, i) => (
                    <div
                      key={d}
                      className={cn(
                        "text-center text-xs font-medium py-2",
                        i >= 5 ? "text-red-400" : "text-text-tertiary"
                      )}
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day Grid */}
                <div className="grid grid-cols-7 gap-1">{dayCells}</div>
              </>
            )}

            {calendarView === "month" && (
              /* Month Grid — all 12 months of the viewed year */
              <div className="grid grid-cols-3 gap-2 py-2">
                {THAI_MONTHS_SHORT.map((monthLabel, i) => {
                  const isCurrent = viewMonth.getMonth() === i;
                  const isSelected =
                    !!selectedParts &&
                    selectedParts.year === viewMonth.getFullYear() &&
                    selectedParts.month === i;
                  return (
                    <motion.button
                      key={monthLabel}
                      type="button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => pickMonth(i)}
                      aria-label={THAI_MONTHS_LONG[i]}
                      className={cn(
                        "h-12 rounded-xl text-sm font-medium transition-all duration-150",
                        isSelected
                          ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md"
                          : isCurrent
                            ? "bg-blue-50 text-blue-600 font-semibold ring-2 ring-blue-200"
                            : "text-text-primary hover:bg-bg"
                      )}
                    >
                      {monthLabel}
                    </motion.button>
                  );
                })}
              </div>
            )}

            {calendarView === "year" && (
              /* Year Grid */
              <div className="grid grid-cols-4 gap-2 py-2">
                {Array.from({ length: 12 }, (_, i) => {
                  const beYear = yearGridStart + i;
                  const isCurrent = toBE(viewMonth.getFullYear()) === beYear;
                  const selectedBE = selectedParts ? toBE(selectedParts.year) : null;
                  const isSelected = selectedBE === beYear;
                  return (
                    <motion.button
                      key={beYear}
                      type="button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => pickYear(beYear)}
                      aria-label={`พ.ศ. ${beYear}`}
                      className={cn(
                        "h-12 rounded-xl text-sm font-medium transition-all duration-150",
                        isSelected
                          ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md"
                          : isCurrent
                            ? "bg-blue-50 text-blue-600 font-semibold ring-2 ring-blue-200"
                            : "text-text-primary hover:bg-bg"
                      )}
                    >
                      {beYear}
                    </motion.button>
                  );
                })}
              </div>
            )}

            {/* Today Button */}
            <div className="mt-4 pt-3 border-t border-border-default flex justify-center">
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  const todayISO = toISODate(today);
                  const outside =
                    (minDate && todayISO < minDate) || (maxDate && todayISO > maxDate);
                  const target =
                    outside && minDate
                      ? new Date(
                          Number(minDate.slice(0, 4)),
                          Number(minDate.slice(5, 7)) - 1,
                          Number(minDate.slice(8, 10)),
                        )
                      : today;
                  onChange(target.toISOString());
                  setViewMonthOverride(null);
                  setLocalError("");
                  setIsOpen(false);
                  setCalendarView("date");
                }}
                className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                วันนี้ ({formatDisplayDate(new Date().toISOString())})
              </button>
            </div>
      </PopoverContent>

      {/* Error/Helper Messages */}
      {(error || localError) && (
        <p className="mt-1.5 text-sm text-red-500 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-red-500" />
          {error || localError}
        </p>
      )}
      {helper && !(error || localError) && (
        <p className="mt-1.5 text-sm text-text-tertiary">{helper}</p>
      )}
    </div>
    </Popover>
  );
}
