"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import Script from 'next/script'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { CalendarDays, CheckCircle2, Clock, Loader2, Users } from 'lucide-react'
import { logger } from '@/lib/logger'
import {
  buildDateOptions,
  fetchAvailability,
  formatThaiDate,
  formatThaiWeekday,
  formatTime,
  groupSlotsByPeriod,
  parseISODate,
  submitBooking,
  type Availability,
  type Booking,
  type Slot,
} from '@/lib/booking'
import { API_BASE } from '@/lib/constants/api'

interface BookingOptions {
  service_types: string[]
  advance_days: number
  blackout_dates: string[]
}

type Step = 'service' | 'date' | 'slot' | 'details' | 'done'

export default function LiffBookingPage() {
  const [idToken, setIdToken] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [options, setOptions] = useState<BookingOptions | null>(null)
  const [serviceType, setServiceType] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)

  const [contactName, setContactName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState<Booking | null>(null)

  const step: Step = confirmed
    ? 'done'
    : selectedSlot
      ? 'details'
      : selectedDate
        ? 'slot'
        : serviceType
          ? 'date'
          : 'service'

  // --- LIFF bootstrap ---
  useEffect(() => {
    let cancelled = false
    const pending: number[] = []
    const wait = (ms: number) =>
      new Promise<void>((resolve) => pending.push(window.setTimeout(resolve, ms)))

    // The SDK <Script> injects window.liff after hydration. If no script tag
    // has appeared after a grace period (e.g. a stuck __next_s queue), inject
    // our own — the same pattern as LiffStateBoot on the landing page.
    const waitForSdk = async () => {
      const start = Date.now()
      const deadline = start + 15000
      let fallbackInjected = false
      while (!window.liff && Date.now() < deadline) {
        if (
          !fallbackInjected &&
          Date.now() - start >= 5000 &&
          !document.querySelector('script[src*="line-scdn"]')
        ) {
          fallbackInjected = true
          const s = document.createElement('script')
          s.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js'
          s.async = true
          document.head.appendChild(s)
        }
        await wait(150)
      }
      return typeof window.liff !== 'undefined'
    }

    const boot = async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID
        if (!liffId) {
          throw new Error('ไม่สามารถเชื่อมต่อ LINE ได้')
        }
        // Budget the *load* only — liff.init() is network-bound and must not
        // be timed out; a blanket 10s timer used to surface a false
        // "SDK load failed" error while init was still in flight.
        const sdkReady = await waitForSdk()
        if (!sdkReady) throw new Error('ไม่สามารถโหลด LINE SDK ได้')
        if (cancelled) return

        await window.liff.init({ liffId })
        if (cancelled) return
        if (!window.liff.isLoggedIn()) {
          window.liff.login()
          return
        }
        const token = window.liff.getIDToken()
        if (!token) throw new Error('ไม่สามารถยืนยันตัวตนกับ LINE ได้')
        if (cancelled) return
        setIdToken(token)

        const res = await fetch(`${API_BASE}/liff/bookings/options`, {
          headers: { 'X-Liff-Id-Token': token },
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.detail ?? 'ระบบจองคิวยังไม่เปิดให้บริการ')
        }
        const loaded: BookingOptions = await res.json()
        if (cancelled) return
        setError(null)
        setOptions(loaded)
        if (loaded.service_types.length === 1) setServiceType(loaded.service_types[0])
      } catch (err) {
        logger.error('LIFF booking bootstrap failed:', err)
        if (!cancelled) setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
      } finally {
        if (!cancelled) setBooting(false)
      }
    }

    void boot()

    return () => {
      cancelled = true
      pending.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  const dateOptions = useMemo(() => {
    if (!options) return []
    return buildDateOptions(new Date(), options.advance_days, options.blackout_dates)
  }, [options])

  const loadSlots = useCallback(
    async (service: string, date: string) => {
      if (!idToken) return
      setLoadingSlots(true)
      setError(null)
      try {
        setAvailability(await fetchAvailability(idToken, service, date))
      } catch (err) {
        logger.error('Failed to load availability:', err)
        setError(err instanceof Error ? err.message : 'โหลดช่วงเวลาไม่สำเร็จ')
        setAvailability(null)
      } finally {
        setLoadingSlots(false)
      }
    },
    [idToken],
  )

  const chooseDate = (date: string) => {
    setSelectedDate(date)
    setSelectedSlot(null)
    if (serviceType) void loadSlots(serviceType, date)
  }

  const handleSubmit = async () => {
    if (!idToken || !serviceType || !selectedDate || !selectedSlot) return
    setSubmitting(true)
    setError(null)
    try {
      const booking = await submitBooking(idToken, {
        service_type: serviceType,
        booking_date: selectedDate,
        booking_time: selectedSlot.time,
        contact_name: contactName.trim() || null,
        phone_number: phoneNumber.trim() || null,
        note: note.trim() || null,
      })
      setConfirmed(booking)
    } catch (err) {
      logger.error('Booking submit failed:', err)
      setError(err instanceof Error ? err.message : 'จองคิวไม่สำเร็จ')
      // The slot may have filled while the form was open — refresh it so the
      // citizen sees the real state instead of a stale "available" button.
      if (serviceType && selectedDate) void loadSlots(serviceType, selectedDate)
      setSelectedSlot(null)
    } finally {
      setSubmitting(false)
    }
  }

  const { morning, afternoon } = groupSlotsByPeriod(availability?.slots ?? [])

  if (booting) {
    return (
      <>
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="afterInteractive" />
        <div className="flex min-h-screen items-center justify-center">
          <LoadingSpinner />
        </div>
      </>
    )
  }

  return (
    <>
      <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="afterInteractive" />
      <main className="mx-auto min-h-screen w-full max-w-lg bg-slate-50 px-4 py-6">
        <header className="mb-5">
          <h1 className="text-2xl font-bold text-slate-900">จองคิวนัดหมาย</h1>
          <p className="mt-1 text-sm text-slate-500">เลือกบริการ วันที่ และช่วงเวลาที่สะดวก</p>
        </header>

        {error && (
          <Alert variant="danger" className="mb-4">
            {error}
          </Alert>
        )}

        {step === 'done' && confirmed && (
          <section className="rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-bold text-slate-900">จองคิวสำเร็จ</h2>
            <p className="mt-4 text-4xl font-bold tracking-tight text-emerald-600">
              {confirmed.queue_number ?? '-'}
            </p>
            <p className="text-xs text-slate-400">หมายเลขคิวของท่าน</p>
            <dl className="mt-5 space-y-2 text-left text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">บริการ</dt>
                <dd className="font-medium text-slate-900">{confirmed.service_type}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">วันที่</dt>
                <dd className="font-medium text-slate-900">{formatThaiDate(confirmed.booking_date)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">เวลา</dt>
                <dd className="font-medium text-slate-900">{formatTime(confirmed.booking_time)} น.</dd>
              </div>
            </dl>
            <p className="mt-5 text-xs text-slate-400">
              ระบบได้ส่งรายละเอียดไปยัง LINE ของท่านแล้ว กรุณามาก่อนเวลานัด 10 นาที
            </p>
            <Button
              className="mt-5 w-full"
              onClick={() => window.liff?.closeWindow?.()}
            >
              ปิดหน้าต่าง
            </Button>
          </section>
        )}

        {step !== 'done' && (
          <div className="space-y-5">
            {/* Service */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Users className="h-4 w-4 text-slate-400" aria-hidden="true" />
                เลือกบริการ
              </h2>
              <div className="grid gap-2">
                {(options?.service_types ?? []).map((service) => (
                  <button
                    key={service}
                    type="button"
                    onClick={() => {
                      setServiceType(service)
                      setSelectedDate(null)
                      setSelectedSlot(null)
                      setAvailability(null)
                    }}
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                      serviceType === service
                        ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                    aria-pressed={serviceType === service}
                  >
                    {service}
                  </button>
                ))}
                {!options?.service_types?.length && (
                  <p className="text-sm text-slate-400">ยังไม่มีบริการที่เปิดให้จอง</p>
                )}
              </div>
            </section>

            {/* Date */}
            {serviceType && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  เลือกวันที่
                </h2>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {dateOptions.map((date) => (
                    <button
                      key={date}
                      type="button"
                      onClick={() => chooseDate(date)}
                      className={`min-w-[4.5rem] shrink-0 rounded-xl border px-3 py-2 text-center transition ${
                        selectedDate === date
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                      aria-pressed={selectedDate === date}
                    >
                      <span className="block text-[11px] text-slate-400">{formatThaiWeekday(date)}</span>
                      <span className="block text-lg font-semibold">{parseISODate(date).getDate()}</span>
                      <span className="block text-[11px] text-slate-400">
                        {formatThaiDate(date).split(' ')[1]}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Slots */}
            {selectedDate && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  เลือกช่วงเวลา
                </h2>
                {loadingSlots ? (
                  <div className="py-6 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" aria-hidden="true" />
                  </div>
                ) : availability && availability.slots.length > 0 ? (
                  <div className="space-y-4">
                    {[
                      { label: 'ช่วงเช้า', slots: morning },
                      { label: 'ช่วงบ่าย', slots: afternoon },
                    ]
                      .filter((group) => group.slots.length > 0)
                      .map((group) => (
                        <div key={group.label}>
                          <p className="mb-2 text-xs font-medium text-slate-400">{group.label}</p>
                          <div className="grid grid-cols-3 gap-2">
                            {group.slots.map((slot) => (
                              <button
                                key={slot.time}
                                type="button"
                                disabled={slot.is_full}
                                onClick={() => setSelectedSlot(slot)}
                                aria-pressed={selectedSlot?.time === slot.time}
                                className={`rounded-lg border px-2 py-2 text-sm transition ${
                                  slot.is_full
                                    ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                                    : selectedSlot?.time === slot.time
                                      ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-700'
                                      : 'border-slate-200 text-slate-700 hover:border-slate-300'
                                }`}
                              >
                                <span className="block">{formatTime(slot.time)}</span>
                                <span className="block text-[10px] text-slate-400">
                                  {slot.is_full ? 'เต็ม' : `ว่าง ${slot.remaining}`}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="py-4 text-center text-sm text-slate-400">
                    วันที่เลือกไม่มีช่วงเวลาให้จอง กรุณาเลือกวันอื่น
                  </p>
                )}
              </section>
            )}

            {/* Details */}
            {selectedSlot && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">ข้อมูลผู้จอง</h2>
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">ชื่อ-นามสกุล</span>
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      maxLength={120}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                      placeholder="ชื่อสำหรับเรียกคิว"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">เบอร์โทรศัพท์</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d]/g, ''))}
                      maxLength={20}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                      placeholder="0812345678"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">รายละเอียดเพิ่มเติม (ถ้ามี)</span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={1000}
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
                  <p className="font-medium text-slate-900">{serviceType}</p>
                  <p className="text-slate-500">
                    {formatThaiDate(selectedDate ?? '')} เวลา {formatTime(selectedSlot.time)} น.
                  </p>
                </div>

                <Button className="mt-4 w-full" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'กำลังจอง...' : 'ยืนยันการจอง'}
                </Button>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  )
}
