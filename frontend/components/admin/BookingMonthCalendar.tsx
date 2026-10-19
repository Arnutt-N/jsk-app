"use client"

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, toBE } from '@/lib/utils'
import { THAI_MONTHS_LONG } from '@/lib/format-date'
import { parseISODate, toISODate, type DayAvailability } from '@/lib/booking'

const THAI_WEEKDAYS_SHORT = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'] as const

export function buildMonthCells(year: number, monthZeroBased: number): (string | null)[] {
  const firstDow = (new Date(year, monthZeroBased, 1).getDay() + 6) % 7
  const dayCount = new Date(year, monthZeroBased + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < firstDow; i += 1) cells.push(null)
  for (let day = 1; day <= dayCount; day += 1) {
    cells.push(toISODate(new Date(year, monthZeroBased, day)))
  }
  return cells
}

export interface BookingMonthCalendarProps {
  selectedDate: string
  rangeByDate: Map<string, DayAvailability>
  loadingRange: boolean
  rangeServiceLabel: string | null
  initialMonth?: string
  onSelectDay: (iso: string) => void
  onVisibleMonthChange: (year: number, monthZeroBased: number) => void
}

type DayTone = 'plain' | 'open' | 'full' | 'closed'

function toneOf(day: DayAvailability | undefined): DayTone {
  if (!day) return 'plain'
  if (!day.is_open) return 'closed'
  return day.remaining > 0 ? 'open' : 'full'
}

const TONE_CLASS: Record<DayTone, string> = {
  plain: 'text-text-primary hover:bg-bg dark:text-slate-200 dark:hover:bg-slate-800',
  open: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900',
  full: 'bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900',
  closed: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
}

const TONE_SUFFIX: Record<DayTone, string> = {
  plain: '',
  open: ' (ว่าง)',
  full: ' (เต็ม)',
  closed: ' (ปิด)',
}

export default function BookingMonthCalendar({
  selectedDate,
  rangeByDate,
  loadingRange,
  rangeServiceLabel,
  initialMonth,
  onSelectDay,
  onVisibleMonthChange,
}: BookingMonthCalendarProps) {
  const initial = initialMonth || selectedDate || toISODate(new Date())
  const parsed = parseISODate(initial)
  const [viewYear, setViewYear] = useState(parsed.getFullYear())
  const [viewMonth, setViewMonth] = useState(parsed.getMonth())

  useEffect(() => {
    onVisibleMonthChange(viewYear, viewMonth)
  }, [viewYear, viewMonth, onVisibleMonthChange])

  const cells = useMemo(() => buildMonthCells(viewYear, viewMonth), [viewYear, viewMonth])
  const todayISO = useMemo(() => toISODate(new Date()), [])

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth())
  }

  return (
    <section aria-label="ปฏิทินความเต็มรายเดือน" className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="เดือนก่อนหน้า"
          className="rounded-lg p-2 hover:bg-bg dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-5 w-5 text-text-secondary" aria-hidden="true" />
        </button>
        <p className="font-semibold text-text-primary dark:text-slate-100" aria-live="polite">
          {THAI_MONTHS_LONG[viewMonth]} <span className="text-blue-600">{toBE(viewYear)}</span>
        </p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="เดือนถัดไป"
          className="rounded-lg p-2 hover:bg-bg dark:hover:bg-slate-800"
        >
          <ChevronRight className="h-5 w-5 text-text-secondary" aria-hidden="true" />
        </button>
      </div>

      {rangeServiceLabel ? (
        <p className="mb-3 text-xs text-slate-500">
          {loadingRange ? 'กำลังโหลดความเต็ม...' : `ความเต็มของบริการ: ${rangeServiceLabel}`}
        </p>
      ) : (
        <p className="mb-3 text-xs text-slate-500">เลือกบริการเพื่อดูความเต็มของแต่ละวัน</p>
      )}

      <div className="grid grid-cols-7 gap-1" role="group" aria-label="วันในเดือน">
        {THAI_WEEKDAYS_SHORT.map((day, index) => (
          <div
            key={day}
            className={cn(
              'py-1 text-center text-xs font-medium',
              index >= 5 ? 'text-red-400' : 'text-text-tertiary',
            )}
          >
            {day}
          </div>
        ))}
        {cells.map((iso, index) => {
          if (!iso) return <div key={`pad-${index}`} />
          const availability = rangeByDate.get(iso)
          const tone = toneOf(availability)
          const dayNumber = Number(iso.slice(8, 10))
          const selected = selectedDate === iso
          return (
            <button
              key={iso}
              type="button"
              aria-pressed={selected || undefined}
              aria-label={`${dayNumber} ${THAI_MONTHS_LONG[viewMonth]} ${toBE(viewYear)}${TONE_SUFFIX[tone]}`}
              onClick={() => onSelectDay(iso)}
              className={cn(
                'flex min-h-11 flex-col items-center justify-center rounded-lg px-1 py-1 text-sm font-medium transition-colors',
                TONE_CLASS[tone],
                selected && 'ring-2 ring-blue-500',
                iso === todayISO && 'font-bold underline underline-offset-2',
              )}
            >
              <span>{dayNumber}</span>
              {tone === 'open' && availability && (
                <span className="text-[10px] font-normal tabular-nums">ว่าง {availability.remaining}</span>
              )}
              {tone === 'full' && <span className="text-[10px] font-normal">เต็ม</span>}
            </button>
          )
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500" aria-label="คำอธิบายสี">
        <li className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-emerald-200 dark:bg-emerald-800" aria-hidden="true" />
          ว่าง
        </li>
        <li className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-amber-200 dark:bg-amber-800" aria-hidden="true" />
          เต็ม
        </li>
        <li className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
          ปิด
        </li>
      </ul>
    </section>
  )
}
