"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, MoveHorizontal } from 'lucide-react'
import CalendarPickerTH from '@/components/ui/CalendarPickerTH'
import { cn } from '@/lib/utils'
import { formatThaiDate, formatThaiWeekday, parseISODate, toISODate } from '@/lib/booking'

export interface DateSectionProps {
  /** Bookable ISO days in order; chips render one per entry. */
  dates: string[]
  /** Selected ISO day, or null before the citizen picks. */
  value: string | null
  /** Single path for both the strip and the calendar; always a bare YYYY-MM-DD. */
  onChange: (date: string) => void
  isDateDisabled: (iso: string) => boolean
  minDate: string | null
  maxDate: string | null
}

const HINT_KEY = 'liff-booking-strip-hint-seen'

function hintSeen(): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(HINT_KEY) === 'seen'
  } catch {
    return false
  }
}

export default function DateSection({
  dates,
  value,
  onChange,
  isDateDisabled,
  minDate,
  maxDate,
}: DateSectionProps) {
  const stripRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)
  const [hintVisible, setHintVisible] = useState(() => dates.length > 4 && !hintSeen())
  const [calendarOpen, setCalendarOpen] = useState(false)

  const updateEdges = useCallback(() => {
    const el = stripRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 1)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    updateEdges()
    window.addEventListener('resize', updateEdges)
    return () => window.removeEventListener('resize', updateEdges)
  }, [dates, updateEdges])

  const dismissHint = useCallback(() => {
    setHintVisible(false)
    try {
      window.sessionStorage.setItem(HINT_KEY, 'seen')
    } catch {
      // A blocked storage just shows the hint again next visit.
    }
  }, [])

  const scrollBy = (direction: 1 | -1) => {
    const el = stripRef.current
    if (!el) return
    el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.8, 120), behavior: 'smooth' })
    dismissHint()
  }

  const pickFromCalendar = (iso: string | null) => {
    if (!iso) return
    onChange(toISODate(new Date(iso)))
  }

  return (
    <div>
      <div className="relative">
        <div
          ref={stripRef}
          onScroll={() => {
            updateEdges()
            dismissHint()
          }}
          className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 py-1 scroll-px-4 [scrollbar-width:none] md:[scrollbar-width:thin] [&::-webkit-scrollbar]:hidden md:[&::-webkit-scrollbar]:block md:[&::-webkit-scrollbar]:h-1.5 md:[&::-webkit-scrollbar-thumb]:rounded-full md:[&::-webkit-scrollbar-thumb]:bg-border-default"
        >
          {dates.map((date, index) => {
            const isSelected = value === date
            const disabled = isDateDisabled(date)
            return (
              <button
                key={date}
                type="button"
                onClick={() => onChange(date)}
                disabled={disabled}
                className={cn(
                  'w-[4.5rem] shrink-0 snap-start rounded-lg border px-2 py-2 text-center transition-colors',
                  isSelected
                    ? 'border-brand-500 bg-brand-50 text-brand-text dark:bg-brand-500/15 dark:text-brand-300'
                    : 'border-border-default bg-surface text-text-secondary hover:border-border-hover',
                  disabled && 'opacity-40 hover:border-border-hover hover:bg-surface',
                )}
                aria-pressed={isSelected}
                aria-disabled={disabled}
              >
                <span className="block text-2xs text-text-tertiary">
                  {index === 0 ? 'วันนี้' : formatThaiWeekday(date)}
                </span>
                <span className="block text-lg font-semibold leading-tight">
                  {parseISODate(date).getDate()}
                </span>
                <span className="block text-2xs text-text-tertiary">
                  {formatThaiDate(date).split(' ')[1]}
                </span>
              </button>
            )
          })}
        </div>
        {canLeft && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface to-transparent"
            />
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label="เลื่อนไปวันก่อนหน้า"
              className="absolute left-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border-default bg-surface shadow-md"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        )}
        {canRight && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent"
            />
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label="เลื่อนไปวันถัดไป"
              className="absolute right-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border-default bg-surface shadow-md"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      {hintVisible && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-text-tertiary">
          <MoveHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          ปัดซ้ายเพื่อดูวันอื่น ๆ
        </p>
      )}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setCalendarOpen((open) => !open)}
          aria-expanded={calendarOpen}
          className="flex w-full items-center justify-between rounded-lg border border-border-default bg-surface px-4 py-2.5 text-sm text-text-secondary hover:border-border-hover"
        >
          เลือกจากปฏิทิน
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', calendarOpen && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
        {calendarOpen && (
          <div className="mt-2">
            <CalendarPickerTH
              ariaLabel="เลือกวันที่จอง"
              value={value}
              onChange={pickFromCalendar}
              isDateDisabled={isDateDisabled}
              minDate={minDate}
              maxDate={maxDate}
            />
          </div>
        )}
      </div>
    </div>
  )
}
