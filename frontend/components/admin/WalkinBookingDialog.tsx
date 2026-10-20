"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select, type SelectOption } from '@/components/ui/Select'
import { logger } from '@/lib/logger'
import { isoToYMD } from '@/lib/utils'
import {
  createWalkinBooking,
  fetchAdminAvailability,
  formatTime,
  updateAdminBookingContact,
  type Booking,
  type Slot,
} from '@/lib/booking'

const CalendarPickerTH = dynamic(() => import('@/components/ui/CalendarPickerTH'), { ssr: false })

// ---------------------------------------------------------------------------
// Walk-in create dialog (counter staff book on behalf of a citizen who is here)
// ---------------------------------------------------------------------------

interface WalkinDialogProps {
  open: boolean
  serviceTypes: string[]
  initialDate: string
  emailEnabled: boolean
  onClose: () => void
  onCreated: (booking: Booking) => void
}

export function WalkinBookingDialog({ open, serviceTypes, initialDate, emailEnabled, onClose, onCreated }: WalkinDialogProps) {
  const [service, setService] = useState('')
  const [date, setDate] = useState(initialDate)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotTime, setSlotTime] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [email, setEmail] = useState('')
  const idempotencyKey = useRef(crypto.randomUUID())
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setService('')
      setDate(initialDate)
      setSlots([])
      setSlotTime('')
      setName('')
      setPhone('')
      setNote('')
      setEmail('')
      idempotencyKey.current = crypto.randomUUID()
      setError(null)
    }
  }, [open, initialDate])

  useEffect(() => {
    if (!open || !service || !date) {
      setSlots([])
      return
    }
    let cancelled = false
    const load = async () => {
      setLoadingSlots(true)
      setSlotTime('')
      try {
        const availability = await fetchAdminAvailability(service, date)
        if (!cancelled) setSlots(availability.slots)
      } catch (err) {
        logger.error('Failed to load counter slots:', err)
        if (!cancelled) {
          setSlots([])
          setError(err instanceof Error ? err.message : 'โหลดช่วงเวลาไม่สำเร็จ')
        }
      } finally {
        if (!cancelled) setLoadingSlots(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, service, date])

  const slotOptions: SelectOption[] = slots.map((slot) => ({
    value: slot.time,
    label: `${formatTime(slot.time)} (ว่าง ${slot.remaining})`,
    disabled: slot.is_full,
  }))

  const handleSave = async () => {
    if (!service || !date || !slotTime) {
      setError('กรุณาเลือกบริการ วันที่ และเวลาให้ครบ')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const booking = await createWalkinBooking({
        service_type: service,
        booking_date: date,
        booking_time: slotTime,
        contact_name: name.trim() || null,
        phone_number: phone.trim() || null,
        note: note.trim() || null,
        email: emailEnabled ? email.trim() : '',
        idempotency_key: idempotencyKey.current,
      })
      onCreated(booking)
      onClose()
    } catch (err) {
      logger.error('Failed to create walk-in booking:', err)
      setError(err instanceof Error ? err.message : 'เพิ่มคิวนอกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="เพิ่มคิวนอก"
      description="จองแทนผู้ที่มาติดต่อหน้าเคาน์เตอร์ (ไม่ต้องมี LINE)"
      maxWidth="lg"
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text-primary">บริการ</span>
          <Select
            value={service}
            onChange={(e) => setService(e.target.value)}
            options={serviceTypes.map((type) => ({ value: type, label: type }))}
            placeholder={serviceTypes.length > 0 ? 'เลือกบริการ' : 'ยังไม่มีบริการ — เพิ่มในหน้าตั้งค่าก่อน'}
          />
        </label>

        <div>
          <span className="mb-1 block text-sm font-medium text-text-primary">วันที่</span>
          <CalendarPickerTH
            value={date ? new Date(`${date}T00:00:00`).toISOString() : null}
            onChange={(iso) => setDate(iso ? isoToYMD(iso) : '')}
            ariaLabel="วันที่นัด"
          />
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text-primary">เวลา</span>
          <Select
            value={slotTime}
            onChange={(e) => setSlotTime(e.target.value)}
            options={slotOptions}
            placeholder={
              loadingSlots ? 'กำลังโหลดเวลา...' : !service || !date ? 'เลือกบริการและวันที่ก่อน' : 'เลือกเวลา'
            }
            disabled={loadingSlots || slots.length === 0}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-text-primary">ชื่อผู้จอง</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น สมชาย ใจดี" maxLength={120} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-text-primary">เบอร์โทร</span>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="เช่น 0812345678"
              inputMode="tel"
              maxLength={20}
              helperText="ตัวเลขเท่านั้น"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text-primary">หมายเหตุ</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เพิ่มเติม (ถ้ามี)" maxLength={1000} />
        </label>

        {emailEnabled && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-text-primary">อีเมล (ถ้ามี)</span>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              inputMode="email"
              maxLength={254}
              helperText="ใส่ไว้รับการยืนยันและเตือนทางอีเมล"
            />
          </label>
        )}

        {error && <p className="text-sm text-danger-text dark:text-danger-light">{error}</p>}

        {/* Padded action row: breathing room from the dialog edges on purpose. */}
        <div className="flex justify-end gap-3 px-1 pb-1 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : 'บันทึกคิว'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Edit-contact dialog (fix a typo without cancelling the seat)
// ---------------------------------------------------------------------------

interface EditContactDialogProps {
  booking: Booking | null
  emailEnabled: boolean
  onClose: () => void
  onUpdated: (booking: Booking) => void
}

export function EditContactDialog({ booking, emailEnabled, onClose, onUpdated }: EditContactDialogProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(booking?.contact_name ?? '')
    setPhone(booking?.phone_number ?? '')
    setNote(booking?.note ?? '')
    setEmail(booking?.email ?? '')
    setError(null)
  }, [booking])

  const handleSave = useCallback(async () => {
    if (!booking) return
    setSaving(true)
    setError(null)
    try {
      const updated = await updateAdminBookingContact(booking.id, {
        contact_name: name.trim() || null,
        phone_number: phone.trim() || null,
        note: note.trim() || null,
        email: emailEnabled ? email.trim() : '',
      })
      onUpdated(updated)
      onClose()
    } catch (err) {
      logger.error('Failed to update booking contact:', err)
      setError(err instanceof Error ? err.message : 'แก้ไขข้อมูลไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }, [booking, name, phone, note, email, emailEnabled, onUpdated, onClose])

  return (
    <Modal
      isOpen={booking !== null}
      onClose={onClose}
      title="แก้ไขข้อมูลผู้จอง"
      description={booking ? `คิว ${booking.queue_number ?? '-'}` : undefined}
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text-primary">ชื่อผู้จอง</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text-primary">เบอร์โทร</span>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} helperText="ตัวเลขเท่านั้น" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text-primary">หมายเหตุ</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </label>
        {emailEnabled && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-text-primary">อีเมล (ถ้ามี)</span>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              inputMode="email"
              helperText="ใส่ไว้รับการยืนยันและเตือนทางอีเมล"
            />
          </label>
        )}

        {error && <p className="text-sm text-danger-text dark:text-danger-light">{error}</p>}

        {/* Padded action row: breathing room from the dialog edges on purpose. */}
        <div className="flex justify-end gap-3 px-1 pb-1 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
