"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { CalendarDays, Phone, RefreshCw } from 'lucide-react'
import { logger } from '@/lib/logger'
import {
  BOOKING_STATUS_LABELS,
  fetchAdminBookings,
  formatThaiDate,
  formatTime,
  toISODate,
  updateBookingStatus,
  type Booking,
  type BookingStatus,
} from '@/lib/booking'

const STATUS_VARIANT: Record<BookingStatus, 'success' | 'danger' | 'info' | 'warning'> = {
  CONFIRMED: 'success',
  CANCELLED: 'danger',
  COMPLETED: 'info',
  NOSHOW: 'warning',
}

// Only terminal states can be set from here — re-confirming a cancelled booking
// would silently re-take a seat another citizen may already hold.
const ACTIONS: { status: BookingStatus; label: string }[] = [
  { status: 'COMPLETED', label: 'มาแล้ว' },
  { status: 'NOSHOW', label: 'ไม่มา' },
  { status: 'CANCELLED', label: 'ยกเลิก' },
]

export default function AdminBookingsPage() {
  const [date, setDate] = useState(() => toISODate(new Date()))
  const [statusFilter, setStatusFilter] = useState<BookingStatus | ''>('')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setBookings(
        await fetchAdminBookings({
          date,
          status: statusFilter || undefined,
        }),
      )
    } catch (err) {
      logger.error('Failed to load bookings:', err)
      setError(err instanceof Error ? err.message : 'โหลดรายการจองไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [date, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  const handleStatus = async (booking: Booking, status: BookingStatus) => {
    setUpdatingId(booking.id)
    setError(null)
    try {
      const updated = await updateBookingStatus(booking.id, status)
      setBookings((current) => current.map((b) => (b.id === updated.id ? updated : b)))
    } catch (err) {
      logger.error('Failed to update booking status:', err)
      setError(err instanceof Error ? err.message : 'อัปเดตสถานะไม่สำเร็จ')
    } finally {
      setUpdatingId(null)
    }
  }

  const counts = useMemo(() => {
    const total = bookings.length
    const confirmed = bookings.filter((b) => b.status === 'CONFIRMED').length
    return { total, confirmed }
  }, [bookings])

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">คิวนัดหมาย</h1>
          <p className="mt-1 text-sm text-slate-500">
            {counts.total} รายการ · รอให้บริการ {counts.confirmed} รายการ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <span className="sr-only">วันที่</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="text-sm">
            <span className="sr-only">สถานะ</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as BookingStatus | '')}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="">ทุกสถานะ</option>
              {(Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[]).map((status) => (
                <option key={status} value={status}>
                  {BOOKING_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
            รีเฟรช
          </Button>
        </div>
      </header>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="py-16 text-center">
          <LoadingSpinner />
        </div>
      ) : bookings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400 dark:border-slate-700">
          ไม่มีการจองในวันที่เลือก
        </p>
      ) : (
        <ul className="space-y-2">
          {bookings.map((booking) => (
            <li
              key={booking.id}
              className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="min-w-[5rem]">
                <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatTime(booking.booking_time)}
                </p>
                <p className="text-xs text-slate-400">{booking.queue_number ?? '-'}</p>
              </div>

              <div className="min-w-[12rem] flex-1">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {booking.contact_name || 'ไม่ระบุชื่อ'}
                </p>
                <p className="text-sm text-slate-500">{booking.service_type}</p>
                {booking.note && <p className="mt-1 text-xs text-slate-400">{booking.note}</p>}
              </div>

              {booking.phone_number && (
                <a
                  href={`tel:${booking.phone_number}`}
                  className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  {booking.phone_number}
                </a>
              )}

              <Badge variant={STATUS_VARIANT[booking.status]}>
                {BOOKING_STATUS_LABELS[booking.status]}
              </Badge>

              {booking.status === 'CONFIRMED' && (
                <div className="flex gap-1">
                  {ACTIONS.map((action) => (
                    <Button
                      key={action.status}
                      size="sm"
                      variant="secondary"
                      disabled={updatingId === booking.id}
                      onClick={() => void handleStatus(booking, action.status)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-slate-400">แสดงรายการของวันที่ {formatThaiDate(date)}</p>
    </div>
  )
}
