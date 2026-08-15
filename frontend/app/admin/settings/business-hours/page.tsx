"use client"

import { useEffect, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Save } from 'lucide-react'
import { logger } from '@/lib/logger'
import {
  fetchBusinessHours,
  saveBusinessHours,
  type BusinessHoursDay,
} from '@/lib/business-hours'

const THAI_DAY_NAMES = [
  'วันจันทร์',
  'วันอังคาร',
  'วันพุธ',
  'วันพฤหัสบดี',
  'วันศุกร์',
  'วันเสาร์',
  'วันอาทิตย์',
]

const FULL_DAY = { open_time: '00:00', close_time: '24:00' }
const DEFAULT_TIMES = { open_time: '08:00', close_time: '17:00' }

function isFullDay(day: BusinessHoursDay): boolean {
  return day.open_time === FULL_DAY.open_time && day.close_time === FULL_DAY.close_time
}

export default function BusinessHoursSettingsPage() {
  const [days, setDays] = useState<BusinessHoursDay[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setDays(await fetchBusinessHours())
      } catch (err) {
        logger.error('Failed to load business hours:', err)
        setError(err instanceof Error ? err.message : 'โหลดเวลาทำการไม่สำเร็จ')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const updateDay = (dayOfWeek: number, patch: Partial<BusinessHoursDay>) => {
    setDays((current) =>
      current
        ? current.map((day) => (day.day_of_week === dayOfWeek ? { ...day, ...patch } : day))
        : current,
    )
    setSaved(false)
  }

  const toggleFullDay = (day: BusinessHoursDay) => {
    updateDay(
      day.day_of_week,
      isFullDay(day) ? { ...DEFAULT_TIMES } : { is_open: true, ...FULL_DAY },
    )
  }

  const handleSave = async () => {
    if (!days) return
    const invalid = days.find((day) => day.is_open && day.open_time >= day.close_time)
    if (invalid) {
      setError(`เวลาเปิดของ${THAI_DAY_NAMES[invalid.day_of_week]}ต้องมาก่อนเวลาปิด`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      setDays(await saveBusinessHours(days))
      setSaved(true)
    } catch (err) {
      logger.error('Failed to save business hours:', err)
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="py-16 text-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!days) {
    return <Alert variant="danger">{error ?? 'ไม่สามารถโหลดเวลาทำการได้'}</Alert>
  }

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">เวลาทำการ</h1>
        <p className="mt-1 text-sm text-slate-500">
          กำหนดเวลาเปิด-ปิดรายสัปดาห์ — ใช้ทั้งกับช่วงเวลาจองคิว และการโอนแชทเข้าเจ้าหน้าที่
        </p>
      </header>

      {error && <Alert variant="danger">{error}</Alert>}
      {saved && <Alert variant="success">บันทึกเวลาทำการเรียบร้อยแล้ว</Alert>}

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <ul className="space-y-3">
          {days.map((day) => {
            const dayName = THAI_DAY_NAMES[day.day_of_week]
            const fullDay = isFullDay(day)
            return (
              <li
                key={day.day_of_week}
                className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800"
              >
                <label className="flex w-32 items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                  <input
                    type="checkbox"
                    checked={day.is_open}
                    onChange={(e) => updateDay(day.day_of_week, { is_open: e.target.checked })}
                    aria-label={`เปิด${dayName}`}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  {dayName}
                </label>

                {day.is_open ? (
                  <span className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="time"
                      value={day.open_time}
                      onChange={(e) => updateDay(day.day_of_week, { open_time: e.target.value })}
                      aria-label={`เวลาเปิด${dayName}`}
                      className="rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
                    />
                    ถึง
                    {fullDay ? (
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        24:00 (ตลอด 24 ชั่วโมง)
                      </span>
                    ) : (
                      <input
                        type="time"
                        value={day.close_time}
                        onChange={(e) =>
                          updateDay(day.day_of_week, { close_time: e.target.value })
                        }
                        aria-label={`เวลาปิด${dayName}`}
                        className="rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
                      />
                    )}
                  </span>
                ) : (
                  <span className="text-sm text-slate-400">ปิดทำการ</span>
                )}

                <button
                  type="button"
                  onClick={() => toggleFullDay(day)}
                  aria-label={`เปิด 24 ชั่วโมง${dayName}`}
                  aria-pressed={fullDay}
                  className={`ml-auto rounded-lg border px-2 py-1 text-xs transition ${
                    fullDay
                      ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-900/30'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  เปิด 24 ชม.
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <Button onClick={handleSave} disabled={saving} leftIcon={<Save className="h-4 w-4" />}>
        {saving ? 'กำลังบันทึก...' : 'บันทึกเวลาทำการ'}
      </Button>
    </div>
  )
}
