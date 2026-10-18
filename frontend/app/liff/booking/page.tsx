"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import LiffStatusBadge from '@/components/liff/LiffStatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useLiffLeave } from '@/hooks/useLiffLeave'
import { LeaveConfirmDialog } from '@/components/liff/LeaveConfirmDialog'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Skeleton } from '@/components/ui/Skeleton'
import { Select } from '@/components/ui/Select'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, Phone, RotateCcw, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { useLiffInit } from '@/hooks/useLiffInit'
import DateSection, { type DayInfo } from '@/components/liff/booking/DateSection'
import LiffStepper from '@/components/liff/LiffStepper'
import { useBookingStore } from '@/lib/booking/store'
import { composeContactName, splitContactName, validateBookingContact } from '@/lib/liff/validation'
import { PREFIX_OPTIONS } from '@/lib/constants/prefixes'
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

type WizardStep = (typeof STEP)[keyof typeof STEP]

const STEP = {
  SERVICE: 0,
  DATETIME: 1,
  CONTACT: 2,
  SUMMARY: 3,
} as const

const STEPS: { label: string; icon: React.ReactNode }[] = [
  { label: 'บริการ', icon: <Users className="h-4 w-4" aria-hidden="true" /> },
  { label: 'วันเวลา', icon: <CalendarDays className="h-4 w-4" aria-hidden="true" /> },
  { label: 'ผู้จอง', icon: <Phone className="h-4 w-4" aria-hidden="true" /> },
  { label: 'ยืนยัน', icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> },
]

function contactPayload(prefix: string, firstname: string, lastname: string, phoneNumber: string, note: string) {
  return {
    contact_name: composeContactName({ prefix, firstname, lastname }) || null,
    prefix: prefix.trim() || null,
    firstname: firstname.trim() || null,
    lastname: lastname.trim() || null,
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

function WizardNav({
  step,
  onBack,
  onNext,
  onCancel,
}: {
  step: WizardStep
  onBack: () => void
  onNext: () => void
  onCancel: () => void
}) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex w-full gap-3">
        {step > STEP.SERVICE && (
          <Button
            type="button"
            variant="outline"
            className="h-auto flex-1 py-3"
            onClick={onBack}
            leftIcon={<ChevronLeft className="h-4 w-4" aria-hidden="true" />}
          >
            กลับ
          </Button>
        )}
        {step < STEP.SUMMARY && (
          <Button
            type="button"
            className="h-auto flex-[2] py-3"
            onClick={onNext}
            rightIcon={<ChevronRight className="h-4 w-4" aria-hidden="true" />}
          >
            ถัดไป
          </Button>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="h-auto w-full py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/20"
        onClick={onCancel}
        leftIcon={<X className="h-3.5 w-3.5" aria-hidden="true" />}
      >
        ยกเลิกรายการ
      </Button>
    </div>
  )
}

/** Label/value rows shared by the summary step and the done screen. */
function SummaryRows({ rows }: { rows: Array<{ label: string; value: string | null }> }) {
  return (
    <dl className="space-y-2 text-sm">
      {rows.map((row) =>
        row.value ? (
          <div key={row.label} className="flex justify-between gap-4">
            <dt className="text-text-secondary">{row.label}</dt>
            <dd className="text-right font-medium text-text-primary">{row.value}</dd>
          </div>
        ) : null,
      )}
    </dl>
  )
}

interface ContactFieldsFormProps {
  prefix: string
  firstname: string
  lastname: string
  phoneNumber: string
  note: string
  onPrefix: (value: string) => void
  onFirstname: (value: string) => void
  onLastname: (value: string) => void
  onPhoneNumber: (value: string) => void
  onNote: (value: string) => void
  nameErrors?: { prefix?: string; firstname?: string; lastname?: string }
  phoneError?: string
  /** The note belongs to the service step; only the post-booking edit form shows it here. */
  showNote?: boolean
}

function ContactFieldsForm({
  prefix,
  firstname,
  lastname,
  phoneNumber,
  note,
  onPrefix,
  onFirstname,
  onLastname,
  onPhoneNumber,
  onNote,
  nameErrors,
  phoneError,
  showNote = true,
}: ContactFieldsFormProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <label className="col-span-1 block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-text-secondary">คำนำหน้า</span>
          <Select
            aria-label="คำนำหน้า"
            value={prefix}
            onChange={(e) => onPrefix(e.target.value)}
            options={PREFIX_OPTIONS}
            placeholder="เลือก"
            state={nameErrors?.prefix ? 'error' : 'default'}
            errorMessage={nameErrors?.prefix}
          />
        </label>
        <label className="col-span-2 block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-text-secondary">ชื่อ</span>
          <Input
            type="text"
            value={firstname}
            onChange={(e) => onFirstname(e.target.value)}
            maxLength={100}
            placeholder="ชื่อจริง"
            state={nameErrors?.firstname ? 'error' : 'default'}
            errorMessage={nameErrors?.firstname}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-text-secondary">นามสกุล</span>
        <Input
          type="text"
          value={lastname}
          onChange={(e) => onLastname(e.target.value)}
          maxLength={100}
          placeholder="นามสกุล"
          state={nameErrors?.lastname ? 'error' : 'default'}
          errorMessage={nameErrors?.lastname}
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
          state={phoneError ? 'error' : 'default'}
          errorMessage={phoneError}
          aria-invalid={phoneError ? true : undefined}
        />
      </label>
      {showNote && (
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
      )}
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
  const { idToken, initDone, isInLineApp } = useLiffInit({
    getLiff: () => (typeof window !== 'undefined' ? window.liff : undefined),
    requireLiffId: true,
    redirectLogin: true,
    warnWhenSdkMissing: true,
    fetchProfile: false,
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
  const prefix = draft.prefix
  const firstname = draft.firstname
  const lastname = draft.lastname
  const phoneNumber = draft.phoneNumber
  const note = draft.note
  const onPrefix = (value: string) =>
    dispatch({ type: 'contact/set', contact: { prefix: value } })
  const onFirstname = (value: string) =>
    dispatch({ type: 'contact/set', contact: { firstname: value } })
  const onLastname = (value: string) =>
    dispatch({ type: 'contact/set', contact: { lastname: value } })
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
  const { leaveOpen, requestLeave, cancelLeave, confirmLeave } = useLiffLeave()
  const [notice, setNotice] = useState<string | null>(null)
  const [showContactErrors, setShowContactErrors] = useState(false)
  const [serviceError, setServiceError] = useState<string | null>(null)
  const [datetimeError, setDatetimeError] = useState<string | null>(null)

  const contactErrors = validateBookingContact({ prefix, firstname, lastname, phoneNumber })
  const displayName = composeContactName({ prefix, firstname, lastname })
  const contactNameError =
    contactErrors.prefix ?? contactErrors.firstname ?? contactErrors.lastname

  const [wizardStep, setWizardStep] = useState<WizardStep>(() => {
    if (draft.slotId) return STEP.CONTACT
    if (draft.date) return STEP.DATETIME
    return STEP.SERVICE
  })

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [wizardStep])

  const goToStep = useCallback((target: WizardStep) => {
    setWizardStep(target)
  }, [])

  const goNext = useCallback(() => {
    setWizardStep((current) => {
      if (current === STEP.SERVICE) return STEP.DATETIME
      if (current === STEP.DATETIME) return STEP.CONTACT
      if (current === STEP.CONTACT) return STEP.SUMMARY
      return current
    })
  }, [])

  const tryNext = useCallback(() => {
    if (wizardStep === STEP.SERVICE) {
      if (!serviceType) {
        setServiceError('กรุณาเลือกบริการ')
        return
      }
      goNext()
      return
    }
    if (wizardStep === STEP.DATETIME) {
      if (!selectedDate || !selectedSlot) {
        setDatetimeError('กรุณาเลือกวันและเวลา')
        return
      }
      goNext()
      return
    }
    if (contactNameError || contactErrors.phoneNumber) {
      setShowContactErrors(true)
      return
    }
    setShowContactErrors(false)
    goNext()
  }, [wizardStep, serviceType, selectedDate, selectedSlot, contactNameError, contactErrors.phoneNumber, goNext])

  const goBack = useCallback(() => {
    setWizardStep((current) => {
      if (current === STEP.SUMMARY) return STEP.CONTACT
      if (current === STEP.CONTACT) return STEP.DATETIME
      if (current === STEP.DATETIME) return STEP.SERVICE
      return current
    })
  }, [])


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
      setDatetimeError(null)
      dispatch({ type: 'date/set', date })
      if (serviceType) void loadSlots(serviceType, date)
    },
    [dispatch, loadSlots, serviceType],
  )

  const chooseService = (service: string) => {
    if (service === serviceType) return
    setServiceError(null)
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
    if (contactNameError || contactErrors.phoneNumber) {
      setShowContactErrors(true)
      setWizardStep(2)
      return
    }
    setSubmitting(true)
    setError(null)
    setNotice(null)
    try {
      const booking = await submitBooking(idToken, {
        service_type: serviceType,
        booking_date: selectedDate,
        booking_time: selectedSlot.time,
        ...contactPayload(prefix, firstname, lastname, phoneNumber, note),
      })
      setConfirmed(booking)
    } catch (err) {
      logger.error('Booking submit failed:', err)
      setError(err instanceof Error ? err.message : 'จองคิวไม่สำเร็จ')
      // The slot may have filled while the form was open — refresh it so the
      // citizen sees the real state instead of a stale "available" button.
      if (serviceType && selectedDate) void loadSlots(serviceType, selectedDate, { force: true })
      dispatch({ type: 'slot/set', slotId: null })
      setWizardStep(STEP.DATETIME)
    } finally {
      setSubmitting(false)
    }
  }

  const resetFlow = () => {
    setConfirmed(null)
    setEditing(false)
    setNotice(null)
    setWizardStep(STEP.SERVICE)
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
    if (contactNameError || contactErrors.phoneNumber) {
      setError(contactNameError ?? contactErrors.phoneNumber ?? 'กรุณากรอกข้อมูลให้ครบถ้วน')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const updated = await updateBookingContact(
        idToken,
        confirmed.id,
        contactPayload(prefix, firstname, lastname, phoneNumber, note),
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

          {!confirmed && (
            <LiffStepper steps={STEPS} currentIndex={wizardStep} ariaLabel="ขั้นตอนการจอง" />
          )}

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

          {confirmed && (
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
                    prefix={prefix}
                    firstname={firstname}
                    lastname={lastname}
                    phoneNumber={phoneNumber}
                    note={note}
                    onPrefix={onPrefix}
                    onFirstname={onFirstname}
                    onLastname={onLastname}
                    onPhoneNumber={onPhoneNumber}
                    onNote={onNote}
                    nameErrors={contactErrors}
                    phoneError={contactErrors.phoneNumber}
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
                  <div className="mt-5">
                    <SummaryRows
                      rows={[
                        { label: 'บริการ', value: confirmed.service_type },
                        { label: 'วันที่', value: formatThaiDate(confirmed.booking_date) },
                        { label: 'เวลา', value: `${formatTime(confirmed.booking_time)} น.` },
                        { label: 'ผู้จอง', value: confirmed.contact_name },
                        { label: 'โทรศัพท์', value: confirmed.phone_number },
                      ]}
                    />
                  </div>
                  <p className="mt-5 text-center text-xs text-text-tertiary">
                    ระบบได้ส่งรายละเอียดไปยัง LINE ของท่านแล้ว กรุณามาก่อนเวลานัด 10 นาที
                  </p>
                  <div className="mt-5 space-y-2">
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => {
                        const split = splitContactName(confirmed.contact_name)
                        dispatch({
                          type: 'contact/set',
                          contact: {
                            prefix: split.prefix,
                            firstname: split.firstname,
                            lastname: split.lastname,
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

          {!confirmed && wizardStep === STEP.SERVICE && (
            <div className="space-y-4">
              <Section
                icon={<Users className="h-4 w-4" />}
                title="เลือกบริการ"
                action={<SectionClearButton onClear={clearService} />}
              >
                {serviceGroups.some((group) => group.options.length > 0) ? (
                  <>
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
                        state={serviceError ? 'error' : 'default'}
                        errorMessage={serviceError ?? undefined}
                      />
                    </label>
                    <label className="mt-4 block">
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
                  </>
                ) : (
                  <p className="text-sm text-text-tertiary">ยังไม่มีบริการที่เปิดให้จอง</p>
                )}
              </Section>
              <WizardNav step={STEP.SERVICE} onBack={goBack} onNext={tryNext} onCancel={requestLeave} />
            </div>
          )}

          {!confirmed && wizardStep === STEP.DATETIME && (
            <div className="space-y-4">
              {serviceType && (
                <Section
                  icon={<CalendarDays className="h-4 w-4" />}
                  title="เลือกวันที่"
                  className="relative z-20"
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
                                    onClick={() => {
                                      setDatetimeError(null)
                                      dispatch({ type: 'slot/set', slotId: slot.time })
                                    }}
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

              {datetimeError && (
                <p role="alert" className="text-sm text-danger-text">
                  {datetimeError}
                </p>
              )}
              <WizardNav step={STEP.DATETIME} onBack={goBack} onNext={tryNext} onCancel={requestLeave} />
            </div>
          )}

          {!confirmed && wizardStep === STEP.CONTACT && (
            <div className="space-y-4">
              <Section
                icon={<Users className="h-4 w-4" />}
                title="ข้อมูลผู้จอง"
                action={<SectionClearButton onClear={clearContact} />}
              >
                <ContactFieldsForm
                  prefix={prefix}
                  firstname={firstname}
                  lastname={lastname}
                  phoneNumber={phoneNumber}
                  note={note}
                  onPrefix={onPrefix}
                  onFirstname={onFirstname}
                  onLastname={onLastname}
                  onPhoneNumber={onPhoneNumber}
                  onNote={onNote}
                  nameErrors={showContactErrors ? contactErrors : undefined}
                  phoneError={showContactErrors ? contactErrors.phoneNumber : undefined}
                  showNote={false}
                />
              </Section>
              <WizardNav step={STEP.CONTACT} onBack={goBack} onNext={tryNext} onCancel={requestLeave} />
            </div>
          )}

          {!confirmed && wizardStep === STEP.SUMMARY && selectedSlot && (
            <div className="space-y-4">
              <Section
                icon={<CheckCircle2 className="h-4 w-4" />}
                title="ตรวจสอบและยืนยันการจอง"
              >
                <div className="space-y-4 text-sm">
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="font-medium text-text-primary">บริการ</p>
                      <button
                        type="button"
                        onClick={() => goToStep(STEP.SERVICE)}
                        className="shrink-0 text-xs font-semibold text-brand-500 hover:underline"
                      >
                        แก้ไข
                      </button>
                    </div>
                    <p className="text-text-secondary">{serviceType}</p>
                    {note.trim() && (
                      <p className="mt-1 whitespace-pre-wrap text-text-secondary">
                        <span className="text-text-tertiary">รายละเอียด: </span>
                        {note.trim()}
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="font-medium text-text-primary">วันเวลา</p>
                      <button
                        type="button"
                        onClick={() => goToStep(STEP.DATETIME)}
                        className="shrink-0 text-xs font-semibold text-brand-500 hover:underline"
                      >
                        แก้ไข
                      </button>
                    </div>
                    <p className="text-text-secondary">
                      {formatThaiDate(selectedDate ?? '')} เวลา {formatTime(selectedSlot.time)} น.
                    </p>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="font-medium text-text-primary">ผู้จอง</p>
                      <button
                        type="button"
                        onClick={() => goToStep(STEP.CONTACT)}
                        className="shrink-0 text-xs font-semibold text-brand-500 hover:underline"
                      >
                        แก้ไข
                      </button>
                    </div>
                    {displayName || phoneNumber.trim() ? (
                      <SummaryRows
                        rows={[
                          { label: 'ผู้จอง', value: displayName || null },
                          { label: 'โทรศัพท์', value: phoneNumber.trim() || null },
                        ]}
                      />
                    ) : (
                      <p className="text-text-tertiary">ไม่ได้ระบุ</p>
                    )}
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'กำลังจอง...' : 'ยืนยันการจอง'}
                  </Button>
                </div>
              </Section>
              <WizardNav step={STEP.SUMMARY} onBack={goBack} onNext={tryNext} onCancel={requestLeave} />
            </div>
          )}
        </>
      )}

      <LeaveConfirmDialog
        isOpen={leaveOpen}
        isInLineApp={isInLineApp}
        onClose={cancelLeave}
        onConfirm={() => {
          resetFlow()
          confirmLeave()
        }}
      />

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
