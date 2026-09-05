"use client"

import { useEffect, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import CalendarPickerTH from '@/components/ui/CalendarPickerTH'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Plus, Save, X } from 'lucide-react'
import { isoToYMD } from '@/lib/utils'
import { logger } from '@/lib/logger'
import {
  describeReminder,
  fetchBookingSettings,
  formatThaiDate,
  saveBookingSettings,
  type BookingSettings,
  type ReminderUnit,
} from '@/lib/booking'

export default function BookingSettingsPage() {
  const [settings, setSettings] = useState<BookingSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [newService, setNewService] = useState('')
  const [newBlackout, setNewBlackout] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setSettings(await fetchBookingSettings())
      } catch (err) {
        logger.error('Failed to load booking settings:', err)
        setError(err instanceof Error ? err.message : 'โหลดการตั้งค่าไม่สำเร็จ')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  // Every updater returns a new object — the settings object is rendered from
  // in several places, so an in-place edit would not re-render consistently.
  const update = <K extends keyof BookingSettings>(key: K, value: BookingSettings[K]) => {
    setSettings((current) => (current ? { ...current, [key]: value } : current))
    setSaved(false)
  }

  const addService = () => {
    const name = newService.trim()
    if (!settings || !name || settings.service_types.includes(name)) return
    update('service_types', [...settings.service_types, name])
    setNewService('')
  }

  const addBlackout = () => {
    if (!settings || !newBlackout || settings.blackout_dates.includes(newBlackout)) return
    update('blackout_dates', [...settings.blackout_dates, newBlackout].sort())
    setNewBlackout('')
  }

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      setSettings(await saveBookingSettings(settings))
      setSaved(true)
    } catch (err) {
      logger.error('Failed to save booking settings:', err)
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

  if (!settings) {
    return <Alert variant="danger">{error ?? 'ไม่สามารถโหลดการตั้งค่าได้'}</Alert>
  }

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">ตั้งค่าการจองคิว</h1>
        <p className="mt-1 text-sm text-slate-500">
          กำหนดบริการที่เปิดจอง ช่วงเวลา และการแจ้งเตือนล่วงหน้า
        </p>
      </header>

      {error && <Alert variant="danger">{error}</Alert>}
      {saved && <Alert variant="success">บันทึกการตั้งค่าเรียบร้อยแล้ว</Alert>}

      {/* Master switch */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-medium text-slate-900 dark:text-slate-100">
              เปิดให้ประชาชนจองคิว
            </span>
            <span className="block text-sm text-slate-500">
              ปิดไว้จะไม่มีใครจองใหม่ได้ และการแจ้งเตือนล่วงหน้าจะหยุดด้วย
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
            className="h-5 w-5 accent-emerald-600"
          />
        </label>
      </section>

      {/* Services */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 font-medium text-slate-900 dark:text-slate-100">บริการที่เปิดให้จอง</h2>
        <ul className="mb-3 space-y-2">
          {settings.service_types.map((service) => (
            <li
              key={service}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800"
            >
              <span>{service}</span>
              <button
                type="button"
                aria-label={`ลบบริการ ${service}`}
                onClick={() =>
                  update('service_types', settings.service_types.filter((s) => s !== service))
                }
                className="text-slate-400 hover:text-rose-600"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
          {settings.service_types.length === 0 && (
            <li className="text-sm text-slate-400">ยังไม่มีบริการ — เพิ่มอย่างน้อย 1 รายการก่อนเปิดใช้งาน</li>
          )}
        </ul>
        <div className="flex gap-2">
          <input
            type="text"
            value={newService}
            onChange={(e) => setNewService(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addService())}
            placeholder="เช่น ปรึกษากฎหมาย"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
          <Button variant="secondary" onClick={addService} aria-label="เพิ่มบริการ">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </section>

      {/* Slots */}
      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-3 dark:border-slate-700 dark:bg-slate-900">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-500">ความยาวช่วงเวลา (นาที)</span>
          <input
            type="number"
            min={5}
            max={480}
            value={settings.slot_minutes}
            onChange={(e) => update('slot_minutes', Number(e.target.value))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-500">รับได้ต่อช่วง (คน)</span>
          <input
            type="number"
            min={0}
            max={1000}
            value={settings.slot_capacity}
            onChange={(e) => update('slot_capacity', Number(e.target.value))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-slate-500">จองล่วงหน้าได้ (วัน)</span>
          <input
            type="number"
            min={0}
            max={365}
            value={settings.advance_days}
            onChange={(e) => update('advance_days', Number(e.target.value))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <p className="text-xs text-slate-400 sm:col-span-3">
          ช่วงเวลาถูกสร้างจาก &ldquo;เวลาทำการ&rdquo; ในหน้าตั้งค่าระบบ — ตั้งค่าที่นี่เป็นการแบ่งย่อยเท่านั้น
        </p>
      </section>

      {/* Blackout dates */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-1 font-medium text-slate-900 dark:text-slate-100">วันหยุดพิเศษ</h2>
        <p className="mb-3 text-sm text-slate-500">
          เวลาทำการกำหนดได้เฉพาะวันในสัปดาห์ — ใส่วันหยุดนักขัตฤกษ์หรือวันปิดทำการที่นี่
        </p>
        <ul className="mb-3 flex flex-wrap gap-2">
          {settings.blackout_dates.map((date) => (
            <li
              key={date}
              className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800"
            >
              {formatThaiDate(date)}
              <button
                type="button"
                aria-label={`ลบวันหยุด ${formatThaiDate(date)}`}
                onClick={() =>
                  update('blackout_dates', settings.blackout_dates.filter((d) => d !== date))
                }
                className="text-slate-400 hover:text-rose-600"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
          {settings.blackout_dates.length === 0 && (
            <li className="text-sm text-slate-400">ยังไม่ได้กำหนด</li>
          )}
        </ul>
        <div className="flex gap-2">
          {/* Thai (พ.ศ.) picker — isoToYMD reads LOCAL parts of the emitted
              instant so the stored date is the calendar day the admin picked
              (a UTC slice would land on the previous day in +07). */}
          <CalendarPickerTH
            ariaLabel="เลือกวันหยุดพิเศษ"
            value={newBlackout || null}
            onChange={(iso) => setNewBlackout(isoToYMD(iso))}
          />
          <Button variant="secondary" onClick={addBlackout} aria-label="เพิ่มวันหยุดพิเศษ">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </section>

      {/* Reminders */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <label className="flex items-center justify-between gap-4">
          <span className="font-medium text-slate-900 dark:text-slate-100">
            แจ้งเตือนล่วงหน้าก่อนถึงวันนัด
          </span>
          <input
            type="checkbox"
            checked={settings.reminder_enabled}
            onChange={(e) => update('reminder_enabled', e.target.checked)}
            className="h-5 w-5 accent-emerald-600"
          />
        </label>

        {settings.reminder_enabled && (
          <div className="mt-4 flex items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-500">ล่วงหน้า</span>
              <input
                type="number"
                min={1}
                max={90}
                value={settings.reminder_lead_value}
                onChange={(e) => update('reminder_lead_value', Number(e.target.value))}
                className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-500">หน่วย</span>
              <select
                value={settings.reminder_lead_unit}
                onChange={(e) => update('reminder_lead_unit', e.target.value as ReminderUnit)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="DAY">วัน</option>
                <option value="HOUR">ชั่วโมง</option>
              </select>
            </label>
          </div>
        )}

        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {describeReminder(settings)}
        </p>
      </section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-1 h-4 w-4" aria-hidden="true" />
          {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
        </Button>
      </div>
    </div>
  )
}
