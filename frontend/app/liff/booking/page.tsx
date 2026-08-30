"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Skeleton } from '@/components/ui/Skeleton'
import { CalendarDays, CheckCircle2, Clock, Loader2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { useLiffInit } from '@/hooks/useLiffInit'
import {
  buildDateOptions,
  cancelBooking,
  fetchAvailability,
  fetchAvailabilityRange,
  formatThaiDate,
  formatThaiWeekday,
  formatTime,
  groupSlotsByPeriod,
  parseISODate,
  submitBooking,
  updateBookingContact,
  type Availability,
  type Booking,
  type DayAvailability,
  type Slot,
} from '@/lib/booking'
import { API_BASE } from '@/lib/constants/api'

interface BookingOptions {
  service_types: string[]
  advance_days: number
  blackout_dates: string[]
}

type Step = 'service' | 'date' | 'slot' | 'details' | 'done'

const STEPS: { key: Step; label: string }[] = [
  { key: 'service', label: 'บริการ' },
  { key: 'date', label: 'วันที่' },
  { key: 'slot', label: 'เวลา' },
  { key: 'details', label: 'ยืนยัน' },
]

function contactPayload(contactName: string, phoneNumber: string, note: string) {
  return {
    contact_name: contactName.trim() || null,
    phone_number: phoneNumber.trim() || null,
    note: note.trim() || null,
  }
}

/** Progress rail so the citizen always knows how many taps remain. */
function StepRail({ current }: { current: Step }) {
  const activeIndex = current === 'done' ? STEPS.length : STEPS.findIndex((s) => s.key === current)
  return (
    <ol className="mb-5 flex items-center gap-1.5" aria-label="ขั้นตอนการจอง">
      {STEPS.map((s, index) => {
        const state = index < activeIndex ? 'done' : index === activeIndex ? 'current' : 'todo'
        return (
          <li key={s.key} className="flex flex-1 flex-col gap-1.5">
            <span
              className={cn(
                'h-1 rounded-full transition-colors',
                state === 'todo' ? 'bg-border-default' : 'bg-brand-500',
              )}
            />
            <span
              className={cn(
                'text-2xs',
                state === 'current' ? 'font-medium text-brand-text' : 'text-text-tertiary',
              )}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {s.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

interface SectionProps {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  className?: string
}

/** One card per step — the single card shape used across the whole flow. */
function Section({ icon, title, children, className }: SectionProps) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border-default bg-surface p-4 shadow-sm',
        className,
      )}
    >
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
        <span className="text-text-tertiary" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

interface ContactFieldsFormProps {
  contactName: string
  phoneNumber: string
  note: string
  onContactName: (value: string) => void
  onPhoneNumber: (value: string) => void
  onNote: (value: string) => void
}

/** The name/phone/note trio, shared by the booking step and the edit form. */
function ContactFieldsForm({
  contactName,
  phoneNumber,
  note,
  onContactName,
  onPhoneNumber,
  onNote,
}: ContactFieldsFormProps) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-text-secondary">ชื่อ-นามสกุล</span>
        <Input
          type="text"
          value={contactName}
          onChange={(e) => onContactName(e.target.value)}
          maxLength={120}
          placeholder="ชื่อสำหรับเรียกคิว"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-text-secondary">เบอร์โทรศัพท์</span>
        <Input
          type="tel"
          inputMode="numeric"
          value={phoneNumber}
          onChange={(e) => onPhoneNumber(e.target.value.replace(/[^\d]/g, ''))}
          maxLength={20}
          placeholder="0812345678"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-text-secondary">
          รายละเอียดเพิ่มเติม (ถ้ามี)
        </span>
        <Textarea
          value={note}
          onChange={(e) => onNote(e.target.value)}
          maxLength={1000}
          rows={3}
        />
      </label>
    </div>
  )
}

function BookingSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="กำลังโหลดระบบจองคิว">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-1 w-full" />
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border border-border-default bg-surface p-4 shadow-sm">
          <Skeleton className="mb-3 h-4 w-24" />
          <div className="space-y-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function LiffBookingPage() {
  const [error, setError] = useState<string | null>(null)
  const { idToken, initDone } = useLiffInit({
    getLiff: () => (typeof window !== 'undefined' ? window.liff : undefined),
    requireLiffId: true,
    redirectLogin: true,
    warnWhenSdkMissing: true,
    onError: () => setError('ไม่สามารถเชื่อมต่อ LINE ได้ กรุณาเปิดหน้านี้จากแอป LINE'),
  })

  const [options, setOptions] = useState<BookingOptions | null>(null)
  const [serviceType, setServiceType] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)

  // Per-day open/full status for the strip, keyed by ISO date. null until the
  // range request lands (or fails — see rangeReady below).
  const [rangeInfo, setRangeInfo] = useState<Map<string, DayAvailability> | null>(null)
  const [rangeReady, setRangeReady] = useState(false)

  const [contactName, setContactName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState<Booking | null>(null)
  const [editing, setEditing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Availability is immutable enough within one session to reuse when the
  // citizen taps back and forth between days; a stale slot is re-validated
  // server-side on submit, and a failed submit refetches the day.
  const slotCache = useRef(new Map<string, Availability>())

  const step: Step = confirmed
    ? 'done'
    : selectedSlot
      ? 'details'
      : selectedDate
        ? 'slot'
        : serviceType
          ? 'date'
          : 'service'

  useEffect(() => {
    if (!idToken) return
    let cancelled = false
    const loadOptions = async () => {
      try {
        const res = await fetch(`${API_BASE}/liff/bookings/options`, {
          headers: { 'X-Liff-Id-Token': idToken },
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
        logger.error('Failed to load booking options:', err)
        if (!cancelled) setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
      }
    }
    void loadOptions()
    return () => {
      cancelled = true
    }
  }, [idToken])

  const dateOptions = useMemo(() => {
    if (!options) return []
    return buildDateOptions(new Date(), options.advance_days, options.blackout_dates)
  }, [options])

  // One range request per service: which days are closed or full, so the strip
  // can disable them up front. Fail-open — on error the chips stay enabled and
  // the strip behaves exactly as before this feature.
  useEffect(() => {
    if (!idToken || !serviceType || confirmed || dateOptions.length === 0) return
    let cancelled = false
    // The backend caps the window at 62 days; advance_days is admin-editable
    // and can exceed that, so clip the request. Chips beyond the clip have no
    // day info and stay enabled (the per-chip fail-open rule below).
    const last = dateOptions[Math.min(dateOptions.length, 63) - 1]
    fetchAvailabilityRange(idToken, serviceType, dateOptions[0], last)
      .then((range) => {
        if (cancelled) return
        setRangeInfo(new Map(range.days.map((day) => [day.date, day])))
        setRangeReady(true)
      })
      .catch((err) => {
        logger.error('Failed to load availability range:', err)
        if (cancelled) return
        setRangeInfo(null)
        setRangeReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [confirmed, dateOptions, idToken, serviceType])

  const loadSlots = useCallback(
    async (service: string, date: string, { force = false } = {}) => {
      if (!idToken) return
      const key = `${service}|${date}`
      if (!force) {
        const cached = slotCache.current.get(key)
        if (cached) {
          setAvailability(cached)
          setLoadingSlots(false)
          return
        }
      }
      setLoadingSlots(true)
      setError(null)
      try {
        const loaded = await fetchAvailability(idToken, service, date)
        slotCache.current.set(key, loaded)
        setAvailability(loaded)
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

  const chooseDate = useCallback(
    (date: string) => {
      setSelectedDate(date)
      setSelectedSlot(null)
      if (serviceType) void loadSlots(serviceType, date)
    },
    [loadSlots, serviceType],
  )

  // Preselect the nearest bookable day so the slot grid is already on screen
  // (and its request already in flight) by the time the citizen looks for it.
  // Waits for the range so "bookable" skips closed/full days, falling back to
  // the first day when the range never arrived.
  useEffect(() => {
    if (!serviceType || selectedDate || confirmed || dateOptions.length === 0) return
    if (!rangeReady) return
    const firstBookable = dateOptions.find((iso) => {
      const info = rangeInfo?.get(iso)
      return Boolean(info?.is_open && info.remaining > 0)
    })
    chooseDate(firstBookable ?? dateOptions[0])
  }, [chooseDate, confirmed, dateOptions, rangeInfo, rangeReady, selectedDate, serviceType])

  const chooseService = (service: string) => {
    if (service === serviceType) return
    setServiceType(service)
    setSelectedDate(null)
    setSelectedSlot(null)
    setAvailability(null)
    setRangeInfo(null)
    setRangeReady(false)
  }

  const handleSubmit = async () => {
    if (!idToken || !serviceType || !selectedDate || !selectedSlot) return
    setSubmitting(true)
    setError(null)
    setNotice(null)
    try {
      const booking = await submitBooking(idToken, {
        service_type: serviceType,
        booking_date: selectedDate,
        booking_time: selectedSlot.time,
        ...contactPayload(contactName, phoneNumber, note),
      })
      setConfirmed(booking)
    } catch (err) {
      logger.error('Booking submit failed:', err)
      setError(err instanceof Error ? err.message : 'จองคิวไม่สำเร็จ')
      // The slot may have filled while the form was open — refresh it so the
      // citizen sees the real state instead of a stale "available" button.
      if (serviceType && selectedDate) void loadSlots(serviceType, selectedDate, { force: true })
      setSelectedSlot(null)
    } finally {
      setSubmitting(false)
    }
  }

  const resetFlow = () => {
    setConfirmed(null)
    setEditing(false)
    setNotice(null)
    setServiceType(options?.service_types.length === 1 ? options.service_types[0] : null)
    setSelectedDate(null)
    setSelectedSlot(null)
    setAvailability(null)
    setContactName('')
    setPhoneNumber('')
    setNote('')
    slotCache.current.clear()
  }

  const handleCancel = async () => {
    if (!idToken || !confirmed) return
    setCancelling(true)
    setError(null)
    try {
      await cancelBooking(idToken, confirmed.id)
      setCancelOpen(false)
      resetFlow()
      setNotice('ยกเลิกการจองแล้ว')
    } catch (err) {
      logger.error('Cancel booking failed:', err)
      setError(err instanceof Error ? err.message : 'ยกเลิกไม่สำเร็จ')
    } finally {
      setCancelling(false)
    }
  }

  const handleUpdate = async () => {
    if (!idToken || !confirmed) return
    setSubmitting(true)
    setError(null)
    try {
      const updated = await updateBookingContact(
        idToken,
        confirmed.id,
        contactPayload(contactName, phoneNumber, note),
      )
      setConfirmed(updated)
      setEditing(false)
      setNotice('แก้ไขข้อมูลเรียบร้อย')
    } catch (err) {
      logger.error('Update booking failed:', err)
      setError(err instanceof Error ? err.message : 'แก้ไขข้อมูลไม่สำเร็จ')
    } finally {
      setSubmitting(false)
    }
  }

  const { morning, afternoon } = groupSlotsByPeriod(availability?.slots ?? [])
  const booting = !initDone || (!options && !error)

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg bg-bg px-4 py-6">
      {booting ? (
        <BookingSkeleton />
      ) : (
        <>
          <header className="mb-5">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">จองคิวนัดหมาย</h1>
            <p className="mt-1 text-sm text-text-secondary">เลือกบริการ วันที่ และช่วงเวลาที่สะดวก</p>
          </header>

          {step !== 'done' && <StepRail current={step} />}

          {error && (
            <Alert variant="danger" className="mb-4">
              {error}
            </Alert>
          )}
          {notice && (
            <Alert variant="success" className="mb-4">
              {notice}
            </Alert>
          )}

          {step === 'done' && confirmed && (
            <section className="rounded-xl border border-border-default bg-surface p-6 shadow-sm">
              {editing ? (
                <>
                  <h2 className="mb-3 text-lg font-bold text-text-primary">แก้ไขข้อมูลผู้จอง</h2>
                  <ContactFieldsForm
                    contactName={contactName}
                    phoneNumber={phoneNumber}
                    note={note}
                    onContactName={setContactName}
                    onPhoneNumber={setPhoneNumber}
                    onNote={setNote}
                  />
                  <div className="mt-4 space-y-2">
                    <Button className="w-full" onClick={handleUpdate} disabled={submitting}>
                      {submitting ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => setEditing(false)}
                    >
                      กลับ
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
                      <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
                    </span>
                    <h2 className="mt-3 text-lg font-bold text-text-primary">จองคิวสำเร็จ</h2>
                    <p className="mt-4 text-4xl font-bold tracking-tight text-success-text">
                      {confirmed.queue_number ?? '-'}
                    </p>
                    <p className="text-xs text-text-tertiary">หมายเลขคิวของท่าน</p>
                  </div>
                  <dl className="mt-5 space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-text-secondary">บริการ</dt>
                      <dd className="text-right font-medium text-text-primary">
                        {confirmed.service_type}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-text-secondary">วันที่</dt>
                      <dd className="text-right font-medium text-text-primary">
                        {formatThaiDate(confirmed.booking_date)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-text-secondary">เวลา</dt>
                      <dd className="text-right font-medium text-text-primary">
                        {formatTime(confirmed.booking_time)} น.
                      </dd>
                    </div>
                    {confirmed.contact_name && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-text-secondary">ผู้จอง</dt>
                        <dd className="text-right font-medium text-text-primary">
                          {confirmed.contact_name}
                        </dd>
                      </div>
                    )}
                    {confirmed.phone_number && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-text-secondary">โทรศัพท์</dt>
                        <dd className="text-right font-medium text-text-primary">
                          {confirmed.phone_number}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <p className="mt-5 text-center text-xs text-text-tertiary">
                    ระบบได้ส่งรายละเอียดไปยัง LINE ของท่านแล้ว กรุณามาก่อนเวลานัด 10 นาที
                  </p>
                  <div className="mt-5 space-y-2">
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => {
                        setContactName(confirmed.contact_name ?? '')
                        setPhoneNumber(confirmed.phone_number ?? '')
                        setNote(confirmed.note ?? '')
                        setEditing(true)
                      }}
                    >
                      แก้ไขข้อมูล
                    </Button>
                    <Button
                      variant="danger"
                      className="w-full"
                      onClick={() => setCancelOpen(true)}
                      disabled={cancelling}
                    >
                      ยกเลิกการจอง
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={() => window.liff?.closeWindow?.()}
                    >
                      ปิดหน้าต่าง
                    </Button>
                  </div>
                </>
              )}
            </section>
          )}

          {step !== 'done' && (
            <div className="space-y-4">
              <Section icon={<Users className="h-4 w-4" />} title="เลือกบริการ">
                <div className="grid gap-2">
                  {(options?.service_types ?? []).map((service) => (
                    <button
                      key={service}
                      type="button"
                      onClick={() => chooseService(service)}
                      className={cn(
                        'rounded-lg border px-4 py-3 text-left text-sm transition-colors',
                        serviceType === service
                          ? 'border-brand-500 bg-brand-50 font-semibold text-brand-text dark:bg-brand-500/15 dark:text-brand-300'
                          : 'border-border-default bg-surface text-text-secondary hover:border-border-hover hover:bg-bg',
                      )}
                      aria-pressed={serviceType === service}
                    >
                      {service}
                    </button>
                  ))}
                  {!options?.service_types?.length && (
                    <p className="text-sm text-text-tertiary">ยังไม่มีบริการที่เปิดให้จอง</p>
                  )}
                </div>
              </Section>

              {serviceType && (
                <Section icon={<CalendarDays className="h-4 w-4" />} title="เลือกวันที่">
                  {/* The strip bleeds to the card edge, but keeps scroll padding so
                      the first and last chip's border is never clipped by the
                      overflow container. */}
                  <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 py-1 scroll-px-4 [&::-webkit-scrollbar]:hidden">
                    {dateOptions.map((date, index) => {
                      const isSelected = selectedDate === date
                      const info = rangeInfo?.get(date)
                      // Disabled only on day-level data we actually have — an
                      // absent entry (request still in flight, or it failed)
                      // keeps the chip enabled.
                      const chipDisabled = info ? !info.is_open || info.remaining === 0 : false
                      return (
                        <button
                          key={date}
                          type="button"
                          onClick={() => chooseDate(date)}
                          disabled={chipDisabled}
                          className={cn(
                            'w-[4.5rem] shrink-0 snap-start rounded-lg border px-2 py-2 text-center transition-colors',
                            isSelected
                              ? 'border-brand-500 bg-brand-50 text-brand-text dark:bg-brand-500/15 dark:text-brand-300'
                              : 'border-border-default bg-surface text-text-secondary hover:border-border-hover',
                            chipDisabled && 'opacity-40 hover:border-border-hover hover:bg-surface',
                          )}
                          aria-pressed={isSelected}
                          aria-disabled={chipDisabled}
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
                </Section>
              )}

              {selectedDate && (
                <Section icon={<Clock className="h-4 w-4" />} title="เลือกช่วงเวลา">
                  {loadingSlots ? (
                    <div className="py-6 text-center">
                      <Loader2
                        className="mx-auto h-5 w-5 animate-spin text-text-tertiary"
                        aria-hidden="true"
                      />
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
                            <p className="mb-2 text-xs font-medium text-text-tertiary">
                              {group.label}
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                              {group.slots.map((slot) => {
                                const isSelected = selectedSlot?.time === slot.time
                                return (
                                  <button
                                    key={slot.time}
                                    type="button"
                                    disabled={slot.is_full}
                                    onClick={() => setSelectedSlot(slot)}
                                    aria-pressed={isSelected}
                                    className={cn(
                                      'rounded-lg border px-2 py-2 text-sm transition-colors',
                                      slot.is_full
                                        ? 'cursor-not-allowed border-border-subtle bg-bg text-text-tertiary'
                                        : isSelected
                                          ? 'border-brand-500 bg-brand-50 font-semibold text-brand-text dark:bg-brand-500/15 dark:text-brand-300'
                                          : 'border-border-default bg-surface text-text-secondary hover:border-border-hover',
                                    )}
                                  >
                                    <span className="block">{formatTime(slot.time)}</span>
                                    <span className="block text-2xs text-text-tertiary">
                                      {slot.is_full ? 'เต็ม' : `ว่าง ${slot.remaining}`}
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="py-4 text-center text-sm text-text-tertiary">
                      วันที่เลือกไม่มีช่วงเวลาให้จอง กรุณาเลือกวันอื่น
                    </p>
                  )}
                </Section>
              )}

              {selectedSlot && (
                <Section icon={<Users className="h-4 w-4" />} title="ข้อมูลผู้จอง">
                  <ContactFieldsForm
                    contactName={contactName}
                    phoneNumber={phoneNumber}
                    note={note}
                    onContactName={setContactName}
                    onPhoneNumber={setPhoneNumber}
                    onNote={setNote}
                  />

                  <div className="mt-4 rounded-lg border border-border-subtle bg-bg p-3 text-sm">
                    <p className="font-medium text-text-primary">{serviceType}</p>
                    <p className="text-text-secondary">
                      {formatThaiDate(selectedDate ?? '')} เวลา {formatTime(selectedSlot.time)} น.
                    </p>
                  </div>

                  <Button className="mt-4 w-full" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'กำลังจอง...' : 'ยืนยันการจอง'}
                  </Button>
                </Section>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        title="ยกเลิกการจอง"
        description={
          confirmed
            ? `ต้องการยกเลิกคิว ${confirmed.queue_number ?? ''} วันที่ ${formatThaiDate(confirmed.booking_date)} เวลา ${formatTime(confirmed.booking_time)} น. หรือไม่?`
            : 'ต้องการยกเลิกการจองนี้หรือไม่?'
        }
        confirmText="ยืนยันยกเลิก"
        cancelText="เก็บการจองไว้"
        variant="danger"
        isLoading={cancelling}
      />
    </main>
  )
}
