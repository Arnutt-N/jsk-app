"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Skeleton } from '@/components/ui/Skeleton'
import { CalendarDays, CheckCircle2, Clock, Loader2, RotateCcw, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { useLiffInit } from '@/hooks/useLiffInit'
import DateSection, { type DayState } from '@/components/liff/booking/DateSection'
import { createDraftStore, type BookingDraft, type DraftAction } from '@/lib/booking/draft'
import { buildServiceGroups, loadTaxonomy, type TaxonomyTable } from '@/lib/booking/service-mapping'
import { useToast } from '@/components/ui/Toast'
import {
  buildDateOptions,
  cancelBooking,
  clipRangeWindow,
  fetchAvailability,
  fetchAvailabilityRange,
  formatThaiDate,
  formatTime,
  groupSlotsByPeriod,
  submitBooking,
  updateBookingContact,
  type Availability,
  type Booking,
  type DayAvailability,
} from '@/lib/booking'
import { API_BASE } from '@/lib/constants/api'
import { TOPIC_OPTIONS } from '@/lib/constants/categories'

interface BookingOptions {
  service_types: string[]
  advance_days: number
  blackout_dates: string[]
  /** Range cap the backend advertises; the local 62 is only the fallback. */
  max_range_days?: number
}

type Step = 'service' | 'date' | 'slot' | 'details' | 'done'

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: 'service', label: 'บริการ', icon: <Users className="h-3 w-3" aria-hidden="true" /> },
  { key: 'date', label: 'วันที่', icon: <CalendarDays className="h-3 w-3" aria-hidden="true" /> },
  { key: 'slot', label: 'เวลา', icon: <Clock className="h-3 w-3" aria-hidden="true" /> },
  { key: 'details', label: 'ยืนยัน', icon: <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> },
]

function contactPayload(contactName: string, phoneNumber: string, note: string) {
  return {
    contact_name: contactName.trim() || null,
    phone_number: phoneNumber.trim() || null,
    note: note.trim() || null,
  }
}

/** Numbered stepper so the citizen always knows how many taps remain. */
function StepRail({ current }: { current: Step }) {
  const activeIndex = current === 'done' ? STEPS.length : STEPS.findIndex((s) => s.key === current)
  return (
    <ol className="mb-8 flex items-center justify-between px-2" aria-label="ขั้นตอนการจอง">
      {STEPS.map((s, index) => {
        const done = index < activeIndex
        const state = done ? 'done' : index === activeIndex ? 'current' : 'todo'
        return (
          <li key={s.key} className="relative flex flex-1 flex-col items-center gap-2">
            <span
              className={cn(
                'z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors',
                state === 'todo'
                  ? 'bg-border-default text-text-tertiary'
                  : 'bg-brand-500 text-white shadow-md',
              )}
            >
              {done ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : index + 1}
            </span>
            <span
              className={cn(
                'flex items-center gap-1 text-[10px] font-semibold',
                state === 'todo' ? 'text-text-tertiary' : 'text-brand-text',
              )}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {s.icon}
              {s.label}
            </span>
            {index < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-[60%] top-4 h-[2px] w-full',
                  done ? 'bg-brand-500' : 'bg-border-default',
                )}
              />
            )}
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
  action?: React.ReactNode
}

/** One card per step — the shared Card rhythm used across the LIFF forms. */
function Section({ icon, title, children, className, action }: SectionProps) {
  return (
    <Card glass className={cn('overflow-hidden', className)}>
      <CardHeader className="bg-bg/50 border-b border-border-subtle">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-text-tertiary" aria-hidden="true">
              {icon}
            </span>
            {title}
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="pt-6">{children}</CardContent>
    </Card>
  )
}

function SectionClearButton({ onClear }: { onClear: () => void }) {
  const { toast } = useToast()
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        onClear()
        toast({ variant: 'success', title: 'ล้างข้อมูลแท็บนี้แล้ว' })
      }}
      leftIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
      className="h-7 shrink-0 px-2 text-xs text-text-tertiary"
    >
      ล้างค่า
    </Button>
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
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-text-secondary">ชื่อ-นามสกุล</span>
        <Input
          type="text"
          value={contactName}
          onChange={(e) => onContactName(e.target.value)}
          maxLength={120}
          placeholder="ชื่อสำหรับเรียกคิว"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-text-secondary">เบอร์โทรศัพท์</span>
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
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-text-secondary">
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
  const [store] = useState(() => createDraftStore())
  const [draft, setDraft] = useState<BookingDraft>(() => store.getDraft())
  const dispatchDraft = useCallback(
    (action: DraftAction) => {
      setDraft(store.dispatch(action))
    },
    [store],
  )
  const serviceType = draft.service
  const selectedDate = draft.date
  const contactName = draft.contactName
  const phoneNumber = draft.phoneNumber
  const note = draft.note
  const onContactName = (value: string) =>
    dispatchDraft({ type: 'contact/set', contact: { contactName: value } })
  const onPhoneNumber = (value: string) =>
    dispatchDraft({ type: 'contact/set', contact: { phoneNumber: value.replace(/[^\d]/g, '') } })
  const onNote = (value: string) =>
    dispatchDraft({ type: 'contact/set', contact: { note: value } })
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const selectedSlot = useMemo(
    () => availability?.slots.find((slot) => slot.time === draft.slotId) ?? null,
    [availability, draft.slotId],
  )

  // Per-day open/full status for the strip, keyed by ISO date. null until the
  // range request lands (or fails — see rangeReady below).
  const [rangeInfo, setRangeInfo] = useState<Map<string, DayAvailability> | null>(null)
  const [rangeReady, setRangeReady] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState<Booking | null>(null)
  const [editing, setEditing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // H4 race guard: the newest loadSlots request key (service|date)
  const latestSlotKeyRef = useRef<string>("")
  const resumedKeyRef = useRef<string | null>(null)

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
        const restored = store.getDraft().service
        if (restored && !loaded.service_types.includes(restored)) {
          dispatchDraft({ type: 'section/clear', section: 'service' })
        } else if (!restored && loaded.service_types.length === 1) {
          dispatchDraft({ type: 'service/set', service: loaded.service_types[0] })
        }
      } catch (err) {
        logger.error('Failed to load booking options:', err)
        if (!cancelled) setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
      }
    }
    void loadOptions()
    return () => {
      cancelled = true
    }
  }, [dispatchDraft, idToken, store])

  const dateOptions = useMemo(() => {
    if (!options) return []
    return buildDateOptions(new Date(), options.advance_days, options.blackout_dates)
  }, [options])

  const [taxonomy, setTaxonomy] = useState<TaxonomyTable | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadTaxonomy().then((table) => {
      if (!cancelled) setTaxonomy(table)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const serviceGroups = useMemo(
    () => buildServiceGroups(options?.service_types ?? [], taxonomy ?? TOPIC_OPTIONS),
    [options, taxonomy],
  )

  // The picker's view of bookability, mirroring the strip's chip rule: days
  // outside the window are closed, and days with range data showing closed
  // or full are closed; days without range data stay open (fail-open).
  const inWindow = useMemo(() => new Set(dateOptions), [dateOptions])
  const isDateDisabled = useCallback(
    (iso: string) => {
      if (!inWindow.has(iso)) return true
      const info = rangeInfo?.get(iso)
      return info ? !info.is_open || info.remaining === 0 : false
    },
    [inWindow, rangeInfo],
  )

  const getDayState = useCallback(
    (iso: string): DayState => {
      if (!inWindow.has(iso)) return 'closed'
      const info = rangeInfo?.get(iso)
      if (!info) return 'open'
      if (!info.is_open) return 'closed'
      if (info.remaining === 0) return 'full'
      return 'open'
    },
    [inWindow, rangeInfo],
  )

  // One range request per service: which days are closed or full, so the strip
  // can disable them up front. Fail-open — on error the chips stay enabled and
  // the strip behaves exactly as before this feature.
  useEffect(() => {
    if (!idToken || !serviceType || confirmed || dateOptions.length === 0) return
    let cancelled = false
    // The backend caps the window (max_range_days from /options; 62 is only
    // the fallback) and advance_days is admin-editable, so it can exceed the
    // cap — clip the request. clipRangeWindow measures the calendar span
    // from the first day — blackouts thin dateOptions, so a count-based clip
    // can still send a span past the cap and 422 the whole request. Chips
    // beyond the clip have no day info and stay enabled (the per-chip
    // fail-open rule below).
    const clipped = clipRangeWindow(dateOptions, options?.max_range_days)
    const last = clipped[clipped.length - 1] ?? dateOptions[0]
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
  }, [confirmed, dateOptions, idToken, options, serviceType])

  const loadSlots = useCallback(
    async (service: string, date: string, { force = false } = {}) => {
      if (!idToken) return
      const key = `${service}|${date}`
      // Mark THIS key as the newest request before any early return — the
      // cache-hit path must also invalidate an older in-flight fetch, or that
      // fetch's late response would pass the guard below and overwrite the
      // (cached) slots just rendered.
      latestSlotKeyRef.current = key
      if (!force) {
        const cached = store.getSlots(key)
        if (cached) {
          setAvailability(cached)
          setLoadingSlots(false)
          return
        }
      }
      // Stale-response guard (review finding H4): a slow availability fetch
      // for a superseded date/service must not overwrite the current slots —
      // a slot time from date A could otherwise be booked under date B.
      setLoadingSlots(true)
      setError(null)
      try {
        const loaded = await fetchAvailability(idToken, service, date)
        store.setSlots(key, loaded)
        if (latestSlotKeyRef.current !== key) return
        setAvailability(loaded)
      } catch (err) {
        logger.error('Failed to load availability:', err)
        if (latestSlotKeyRef.current !== key) return
        setError(err instanceof Error ? err.message : 'โหลดช่วงเวลาไม่สำเร็จ')
        setAvailability(null)
      } finally {
        if (latestSlotKeyRef.current === key) setLoadingSlots(false)
      }
    },
    [idToken, store],
  )

  const chooseDate = useCallback(
    (date: string) => {
      dispatchDraft({ type: 'date/set', date })
      if (serviceType) void loadSlots(serviceType, date)
    },
    [dispatchDraft, loadSlots, serviceType],
  )

  const preselectedServiceRef = useRef<string | null>(null)

  // Preselect the nearest bookable day so the slot grid is already on screen
  // (and its request already in flight) by the time the citizen looks for it.
  // Waits for the range so "bookable" skips closed/full days, falling back to
  // the first day when the range never arrived.
  useEffect(() => {
    if (!serviceType || selectedDate || confirmed || dateOptions.length === 0) return
    if (!rangeReady) return
    if (preselectedServiceRef.current === serviceType) return
    preselectedServiceRef.current = serviceType
    const firstBookable = dateOptions.find((iso) => {
      const info = rangeInfo?.get(iso)
      return Boolean(info?.is_open && info.remaining > 0)
    })
    chooseDate(firstBookable ?? dateOptions[0])
  }, [chooseDate, confirmed, dateOptions, rangeInfo, rangeReady, selectedDate, serviceType])

  useEffect(() => {
    if (!idToken || !options || confirmed) return
    if (serviceType && selectedDate && !availability && !loadingSlots) {
      const key = `${serviceType}|${selectedDate}`
      if (resumedKeyRef.current !== key) {
        resumedKeyRef.current = key
        void loadSlots(serviceType, selectedDate)
      }
    }
  }, [availability, confirmed, idToken, loadSlots, loadingSlots, options, selectedDate, serviceType])

  const chooseService = (service: string) => {
    if (service === serviceType) return
    dispatchDraft({ type: 'service/set', service })
    setAvailability(null)
    setRangeInfo(null)
    setRangeReady(false)
  }

  const clearService = () => {
    dispatchDraft({ type: 'section/clear', section: 'service' })
    setAvailability(null)
    setRangeInfo(null)
    setRangeReady(false)
  }

  const clearDate = () => {
    dispatchDraft({ type: 'section/clear', section: 'date' })
    setAvailability(null)
  }

  const clearSlot = () => {
    dispatchDraft({ type: 'section/clear', section: 'slot' })
  }

  const clearContact = () => {
    dispatchDraft({ type: 'section/clear', section: 'contact' })
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
      dispatchDraft({ type: 'slot/set', slotId: null })
    } finally {
      setSubmitting(false)
    }
  }

  const resetFlow = () => {
    setConfirmed(null)
    setEditing(false)
    setNotice(null)
    store.reset()
    preselectedServiceRef.current = null
    if (options?.service_types.length === 1) {
      store.dispatch({ type: 'service/set', service: options.service_types[0] })
    }
    setDraft(store.getDraft())
    setAvailability(null)
    setRangeInfo(null)
    setRangeReady(false)
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
          <header className="sticky top-0 z-50 -mx-4 mb-6 border-b border-border-default bg-surface/70 px-4 py-4 backdrop-blur-md">
            <div className="mx-auto flex max-w-lg items-center justify-between">
              <div>
                <div className="mb-0.5 flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-brand-500" aria-hidden="true" />
                  <h1 className="text-lg font-bold tracking-tight text-text-primary">จองคิวนัดหมาย</h1>
                </div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                  จองคิวนัดหมายล่วงหน้า • JSK 4.0 Platform
                </p>
              </div>
              <Badge variant={options ? 'success' : 'warning'} className="h-6">
                {options ? 'เปิดรับจอง' : 'กำลังเชื่อมต่อ…'}
              </Badge>
            </div>
          </header>
          <p className="mb-5 text-sm text-text-secondary">เลือกบริการ วันที่ และช่วงเวลาที่สะดวก</p>

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
            <Card glass className="overflow-hidden">
              <CardHeader className="bg-bg/50 border-b border-border-subtle">
                <CardTitle className="text-base">
                  {editing ? 'แก้ไขข้อมูลผู้จอง' : 'จองคิวสำเร็จ'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
              {editing ? (
                <>
                  <ContactFieldsForm
                    contactName={contactName}
                    phoneNumber={phoneNumber}
                    note={note}
                    onContactName={onContactName}
                    onPhoneNumber={onPhoneNumber}
                    onNote={onNote}
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
                        dispatchDraft({
                          type: 'contact/set',
                          contact: {
                            contactName: confirmed.contact_name ?? '',
                            phoneNumber: confirmed.phone_number ?? '',
                            note: confirmed.note ?? '',
                          },
                        })
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
              </CardContent>
            </Card>
          )}

          {step !== 'done' && (
            <div className="space-y-4">
              <Section
                icon={<Users className="h-4 w-4" />}
                title="เลือกบริการ"
                action={<SectionClearButton onClear={clearService} />}
              >
                {serviceGroups.some((group) => group.options.length > 0) ? (
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-text-secondary">
                      บริการ
                    </span>
                    <select
                      aria-label="เลือกบริการ"
                      value={serviceType ?? ''}
                      onChange={(e) => {
                        if (e.target.value) chooseService(e.target.value)
                      }}
                      className="w-full rounded-lg border border-border-default bg-surface px-3 py-2.5 text-sm text-text-primary"
                    >
                      <option value="">-- เลือกบริการ --</option>
                      {serviceGroups
                        .filter((group) => group.options.length > 0)
                        .map((group) => (
                          <optgroup key={group.category} label={group.category}>
                            {group.options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                    </select>
                  </label>
                ) : (
                  <p className="text-sm text-text-tertiary">ยังไม่มีบริการที่เปิดให้จอง</p>
                )}
              </Section>

              {serviceType && (
                <Section
                  icon={<CalendarDays className="h-4 w-4" />}
                  title="เลือกวันที่"
                  action={<SectionClearButton onClear={clearDate} />}
                >
                  <DateSection
                    dates={dateOptions}
                    value={selectedDate}
                    onChange={chooseDate}
                    isDateDisabled={isDateDisabled}
                    getDayState={getDayState}
                    minDate={dateOptions[0] ?? null}
                    maxDate={dateOptions[dateOptions.length - 1] ?? null}
                  />
                </Section>
              )}

              {selectedDate && (
                <Section
                  icon={<Clock className="h-4 w-4" />}
                  title="เลือกช่วงเวลา"
                  action={<SectionClearButton onClear={clearSlot} />}
                >
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
                                    onClick={() =>
                                      dispatchDraft({ type: 'slot/set', slotId: slot.time })
                                    }
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
                <Section
                  icon={<Users className="h-4 w-4" />}
                  title="ข้อมูลผู้จอง"
                  action={<SectionClearButton onClear={clearContact} />}
                >
                  <ContactFieldsForm
                    contactName={contactName}
                    phoneNumber={phoneNumber}
                    note={note}
                    onContactName={onContactName}
                    onPhoneNumber={onPhoneNumber}
                    onNote={onNote}
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
