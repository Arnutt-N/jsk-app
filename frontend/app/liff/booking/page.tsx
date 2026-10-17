"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import LiffStatusBadge from '@/components/liff/LiffStatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Skeleton } from '@/components/ui/Skeleton'
import { Select } from '@/components/ui/Select'
import { CalendarDays, CheckCircle2, Clock, Loader2, RotateCcw, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { useLiffInit } from '@/hooks/useLiffInit'
import DateSection, { type DayInfo } from '@/components/liff/booking/DateSection'
import LiffStepper from '@/components/liff/LiffStepper'
import { useBookingStore } from '@/lib/booking/store'
import { buildServiceGroups, loadTaxonomy, type TaxonomyTable } from '@/lib/booking/service-mapping'
import { useToast } from '@/components/ui/Toast'
import {
  cancelBooking,
  formatThaiDate,
  formatTime,
  groupSlotsByPeriod,
  submitBooking,
  updateBookingContact,
  type Booking,
} from '@/lib/booking'
import { TOPIC_OPTIONS } from '@/lib/constants/categories'

type Step = 'service' | 'date' | 'slot' | 'details' | 'done'

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: 'service', label: 'บริการ', icon: <Users className="h-4 w-4" aria-hidden="true" /> },
  { key: 'date', label: 'วันที่', icon: <CalendarDays className="h-4 w-4" aria-hidden="true" /> },
  { key: 'slot', label: 'เวลา', icon: <Clock className="h-4 w-4" aria-hidden="true" /> },
  { key: 'details', label: 'ยืนยัน', icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> },
]

function contactPayload(contactName: string, phoneNumber: string, note: string) {
  return {
    contact_name: contactName.trim() || null,
    phone_number: phoneNumber.trim() || null,
    note: note.trim() || null,
  }
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
    <Card glass className={cn('overflow-visible', className)}>
      <CardHeader className="bg-bg/50 border-b border-border-subtle rounded-t-2xl">
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
  const { idToken, initDone } = useLiffInit({
    getLiff: () => (typeof window !== 'undefined' ? window.liff : undefined),
    requireLiffId: true,
    redirectLogin: true,
    warnWhenSdkMissing: true,
    onError: () => setError('ไม่สามารถเชื่อมต่อ LINE ได้ กรุณาเปิดหน้านี้จากแอป LINE'),
  })
  const [confirmed, setConfirmed] = useState<Booking | null>(null)
  // Draft plus every fetch it drives; section/clear and draft/reset cascade
  // to fetched data inside the store, so the page never resets fetches by hand.
  const {
    draft,
    dispatch,
    options,
    dateOptions,
    availability,
    loadingSlots,
    rangeInfo,
    error,
    setError,
    loadSlots,
  } = useBookingStore({ idToken, confirmed: confirmed !== null })

  const serviceType = draft.service
  const selectedDate = draft.date
  const contactName = draft.contactName
  const phoneNumber = draft.phoneNumber
  const note = draft.note
  const onContactName = (value: string) =>
    dispatch({ type: 'contact/set', contact: { contactName: value } })
  const onPhoneNumber = (value: string) =>
    dispatch({ type: 'contact/set', contact: { phoneNumber: value.replace(/[^\d]/g, '') } })
  const onNote = (value: string) =>
    dispatch({ type: 'contact/set', contact: { note: value } })
  const selectedSlot = useMemo(
    () => availability?.slots.find((slot) => slot.time === draft.slotId) ?? null,
    [availability, draft.slotId],
  )

  const [submitting, setSubmitting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const step: Step = confirmed
    ? 'done'
    : selectedSlot
      ? 'details'
      : selectedDate
        ? 'slot'
        : serviceType
          ? 'date'
          : 'service'

  const activeIndex = step === 'done' ? STEPS.length : STEPS.findIndex((s) => s.key === step)

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

  // One pass over the range data answers both "tappable?" and "how does it
  // look?" so the strip chip and the picker can never disagree. Days outside
  // the window are closed, and days without range data stay open (fail-open).
  const inWindow = useMemo(() => new Set(dateOptions), [dateOptions])
  const getDayInfo = useCallback(
    (iso: string): DayInfo => {
      if (!inWindow.has(iso)) return { disabled: true, state: 'closed' }
      const info = rangeInfo?.get(iso)
      if (!info) return { disabled: false, state: 'open' }
      if (!info.is_open) return { disabled: true, state: 'closed' }
      if (info.remaining === 0) return { disabled: true, state: 'full' }
      return { disabled: false, state: 'open' }
    },
    [inWindow, rangeInfo],
  )

  const chooseDate = useCallback(
    (date: string) => {
      dispatch({ type: 'date/set', date })
      if (serviceType) void loadSlots(serviceType, date)
    },
    [dispatch, loadSlots, serviceType],
  )

  const chooseService = (service: string) => {
    if (service === serviceType) return
    dispatch({ type: 'service/set', service })
  }

  const clearService = () => {
    dispatch({ type: 'section/clear', section: 'service' })
  }

  const clearDate = () => {
    dispatch({ type: 'section/clear', section: 'date' })
  }

  const clearSlot = () => {
    dispatch({ type: 'section/clear', section: 'slot' })
  }

  const clearContact = () => {
    dispatch({ type: 'section/clear', section: 'contact' })
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
      dispatch({ type: 'slot/set', slotId: null })
    } finally {
      setSubmitting(false)
    }
  }

  const resetFlow = () => {
    setConfirmed(null)
    setEditing(false)
    setNotice(null)
    dispatch({ type: 'draft/reset' })
    if (options?.service_types.length === 1) {
      dispatch({ type: 'service/set', service: options.service_types[0] })
    }
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
              <LiffStatusBadge kind="business" state={options ? 'open' : 'loading'} />
            </div>
          </header>
          <p className="mb-5 text-sm text-text-secondary">เลือกบริการ วันที่ และช่วงเวลาที่สะดวก</p>

          {step !== 'done' && <LiffStepper steps={STEPS} currentIndex={activeIndex} ariaLabel="ขั้นตอนการจอง" />}

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
                        dispatch({
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
                    <Select
                      aria-label="เลือกบริการ"
                      value={serviceType ?? ''}
                      onChange={(e) => {
                        if (e.target.value) chooseService(e.target.value)
                      }}
                      groups={serviceGroups
                        .filter((group) => group.options.length > 0)
                        .map((group) => ({
                          label: group.category,
                          options: group.options,
                        }))}
                      placeholder="-- เลือกบริการ --"
                    />
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
                    getDayInfo={getDayInfo}
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
                                      dispatch({ type: 'slot/set', slotId: slot.time })
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
