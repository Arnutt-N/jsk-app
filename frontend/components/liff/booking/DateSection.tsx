"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, MoveHorizontal } from 'lucide-react'
import CalendarPickerTH from '@/components/ui/CalendarPickerTH'
import { cn } from '@/lib/utils'
import { formatThaiDate, formatThaiWeekday, parseISODate, toISODate } from '@/lib/booking'

export type DayState = 'open' | 'full' | 'closed'

export interface DateSectionProps {
  dates: string[]
  value: string | null
  onChange: (date: string) => void
  isDateDisabled: (iso: string) => boolean
  getDayState: (iso: string) => DayState
  minDate: string | null
  maxDate: string | null
}

const PAGE_SIZE = 7
const HINT_KEY = 'liff-booking-strip-hint-seen'

function hintSeen(): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(HINT_KEY) === 'seen'
  } catch {
    return false
  }
}

function weekLabel(visible: string[]): string {
  if (visible.length === 0) return ''
  const first = formatThaiDate(visible[0])
  const last = formatThaiDate(visible[visible.length - 1])
  return first === last ? first : `${first} – ${last}`
}

function DayLegend() {
  return (
    <div
      className="mt-2 flex items-center gap-4 text-xs text-text-tertiary"
      aria-label="คำอธิบายสถานะวันจอง"
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-brand-500" />
        ว่าง
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        เต็ม
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-border-default" />
        หยุด
      </span>
    </div>
  )
}

export default function DateSection({
  dates,
  value,
  onChange,
  isDateDisabled,
  getDayState,
  minDate,
  maxDate,
}: DateSectionProps) {
  const stripRef = useRef<HTMLDivElement>(null)
  const maxPage = Math.max(0, Math.ceil(dates.length / PAGE_SIZE) - 1)
  const [page, setPage] = useState(0)
  const safePage = Math.min(page, maxPage)
  const visible = dates.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
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
  }, [visible, updateEdges])

  useEffect(() => {
    const el = stripRef.current
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ left: 0 })
    updateEdges()
  }, [safePage, updateEdges])

  const [prevValue, setPrevValue] = useState<string | null>(null)
  if (value !== prevValue) {
    setPrevValue(value)
    if (value) {
      const index = dates.indexOf(value)
      if (
        index >= 0 &&
        (index < page * PAGE_SIZE || index >= page * PAGE_SIZE + PAGE_SIZE)
      ) {
        setPage(Math.floor(index / PAGE_SIZE))
      }
    }
  }

  const dismissHint = useCallback(() => {
    setHintVisible(false)
    try {
      window.sessionStorage.setItem(HINT_KEY, 'seen')
    } catch {
    }
  }, [])

  const goWeek = (direction: 1 | -1) => {
    setPage((current) => Math.min(maxPage, Math.max(0, current + direction)))
    dismissHint()
  }

  const pickFromCalendar = (iso: string | null) => {
    if (!iso) return
    onChange(toISODate(new Date(iso)))
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goWeek(-1)}
          disabled={safePage === 0}
          aria-label="สัปดาห์ก่อนหน้า"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border-default bg-surface shadow-sm disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold text-text-primary" aria-live="polite">
          {weekLabel(visible)}
        </p>
        <button
          type="button"
          onClick={() => goWeek(1)}
          disabled={safePage === maxPage}
          aria-label="สัปดาห์ถัดไป"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border-default bg-surface shadow-sm disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="relative">
        <div
          ref={stripRef}
          onScroll={() => {
            updateEdges()
            dismissHint()
          }}
          className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 py-1 scroll-px-4 [scrollbar-width:none] md:[scrollbar-width:thin] [&::-webkit-scrollbar]:hidden md:[&::-webkit-scrollbar]:block md:[&::-webkit-scrollbar]:h-1.5 md:[&::-webkit-scrollbar-thumb]:rounded-full md:[&::-webkit-scrollbar-thumb]:bg-border-default"
        >
          {visible.map((date) => {
            const isSelected = value === date
            const disabled = isDateDisabled(date)
            const state = getDayState(date)
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
                    : state === 'full'
                      ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/50 dark:bg-amber-500/10 dark:text-amber-200'
                      : 'border-border-default bg-surface text-text-secondary hover:border-border-hover',
                  state === 'closed' && !isSelected && 'opacity-40',
                )}
                aria-pressed={isSelected}
                aria-disabled={disabled}
              >
                <span className="block text-2xs text-text-tertiary">
                  {date === dates[0] ? 'วันนี้' : formatThaiWeekday(date)}
                </span>
                <span className="block text-lg font-semibold leading-tight">
                  {parseISODate(date).getDate()}
                </span>
                <span className="block text-2xs text-text-tertiary">
                  {state === 'full'
                    ? 'เต็ม'
                    : state === 'closed'
                      ? 'หยุด'
                      : formatThaiDate(date).split(' ')[1]}
                </span>
              </button>
            )
          })}
        </div>
        {canLeft && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface to-transparent"
          />
        )}
        {canRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent"
          />
        )}
      </div>
      {hintVisible && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-text-tertiary">
          <MoveHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          ปัดซ้ายเพื่อดูวันอื่น ๆ
        </p>
      )}
      <DayLegend />
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
            <DayLegend />
          </div>
        )}
      </div>
    </div>
  )
}
