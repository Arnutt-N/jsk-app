"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Select } from '@/components/ui/Select'
import { CalendarDays, ChevronLeft, ChevronRight, LayoutList, Pencil, Phone, Plus, RefreshCw, Search } from 'lucide-react'
import { logger } from '@/lib/logger'
import { formatThaiDate } from '@/lib/format-date'
import { isoToYMD } from '@/lib/utils'
import { EditContactDialog, WalkinBookingDialog } from '@/components/admin/WalkinBookingDialog'
import BookingMonthCalendar from '@/components/admin/BookingMonthCalendar'
import {
  BOOKING_STATUS_LABELS,
  fetchAdminAvailabilityRange,
  fetchAdminBookings,
  fetchBookingSettings,
  formatTime,
  updateBookingStatus,
  type Booking,
  type BookingStatus,
  type DayAvailability,
} from '@/lib/booking'

const CalendarPickerTH = dynamic(() => import('@/components/ui/CalendarPickerTH'), { ssr: false })

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'ทุกสถานะ' },
  ...(Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[]).map((status) => ({
    value: status,
    label: BOOKING_STATUS_LABELS[status],
  })),
]

const STATUS_VARIANT: Record<BookingStatus, 'success' | 'danger' | 'info' | 'warning'> = {
  CONFIRMED: 'success',
  CANCELLED: 'danger',
  COMPLETED: 'info',
  NOSHOW: 'warning',
}

// One full page from the API. "Next" shows when the page came back full —
// the same heuristic as the requests list.
const PAGE_SIZE = 100
// would silently re-take a seat another citizen may already hold.
const ACTIONS: { status: BookingStatus; label: string }[] = [
  { status: 'COMPLETED', label: 'มาแล้ว' },
  { status: 'NOSHOW', label: 'ไม่มา' },
  { status: 'CANCELLED', label: 'ยกเลิก' },
]

export default function AdminBookingsPage() {
  const [date, setDate] = useState('') // '' = all days; must not default to today
  const [statusFilter, setStatusFilter] = useState<BookingStatus | ''>('')
  const [serviceTypeFilter, setServiceTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Missing in older saved settings means enabled (walkin, calendar).
  const [walkinEnabled, setWalkinEnabled] = useState(true)
  const [calendarEnabled, setCalendarEnabled] = useState(true)
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [rangeByDate, setRangeByDate] = useState<Map<string, DayAvailability>>(new Map())
  const [loadingRange, setLoadingRange] = useState(false)
  const [serviceTypes, setServiceTypes] = useState<string[]>([])
  const [walkinOpen, setWalkinOpen] = useState(false)
  const [editing, setEditing] = useState<Booking | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setBookings(
        await fetchAdminBookings({
          date,
          status: statusFilter || undefined,
          serviceType: serviceTypeFilter || undefined,
          search: debouncedSearch.trim() || undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE || undefined,
        }),
      )
    } catch (err) {
      logger.error('Failed to load bookings:', err)
      setError(err instanceof Error ? err.message : 'โหลดรายการจองไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [date, statusFilter, serviceTypeFilter, debouncedSearch, page])

  // Same 500ms debounce as the requests list — each keystroke must not
  // become an API call. A filter change always restarts from the first page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 500)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await fetchBookingSettings()
        setWalkinEnabled(settings.walkin_enabled ?? true)
        setCalendarEnabled(settings.calendar_enabled ?? true)
        setServiceTypes(settings.service_types ?? [])
      } catch (err) {
        logger.error('Failed to load booking settings:', err)
      }
    }
    void loadSettings()
  }, [])

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

  // Fail-open like the LIFF strip: no fullness, still a usable date picker.
  const rangeService = serviceTypeFilter || serviceTypes[0] || ''

  const handleVisibleMonthChange = useCallback(
    async (year: number, monthZeroBased: number) => {
      if (!rangeService) {
        setRangeByDate(new Map())
        return
      }
      const first = `${year}-${`${monthZeroBased + 1}`.padStart(2, '0')}-01`
      const lastDay = new Date(year, monthZeroBased + 1, 0).getDate()
      const last = `${year}-${`${monthZeroBased + 1}`.padStart(2, '0')}-${`${lastDay}`.padStart(2, '0')}`
      setLoadingRange(true)
      try {
        const range = await fetchAdminAvailabilityRange(rangeService, first, last)
        setRangeByDate(new Map(range.days.map((day) => [day.date, day])))
      } catch (err) {
        logger.error('Failed to load calendar fullness:', err)
        setRangeByDate(new Map())
      } finally {
        setLoadingRange(false)
      }
    },
    [rangeService],
  )

  const handleSelectDay = useCallback((iso: string) => {
    setDate(iso)
    setPage(0)
    setView('list')
  }, [])

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
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <div className="w-48">
              <CalendarPickerTH
                value={date ? new Date(`${date}T00:00:00`).toISOString() : null}
                onChange={(iso) => {
                  setDate(iso ? isoToYMD(iso) : '')
                  setPage(0)
                }}
              />
            </div>
            {!date && (
              <span className="text-xs text-slate-400">ทุกวัน</span>
            )}
            {date && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDate('')
                  setPage(0)
                }}
                className="text-xs text-text-tertiary hover:text-text-primary"
              >
                ล้างวันที่
              </Button>
            )}
            <div className="w-36">
              <Select
                size="sm"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as BookingStatus | '')
                  setPage(0)
                }}
                options={STATUS_FILTER_OPTIONS}
              />
            </div>
            {serviceTypes.length > 0 && (
              <div className="w-44">
                <Select
                  size="sm"
                  value={serviceTypeFilter}
                  onChange={(e) => {
                    setServiceTypeFilter(e.target.value)
                    setPage(0)
                  }}
                  options={[
                    { value: '', label: 'ทุกบริการ' },
                    ...serviceTypes.map((type) => ({ value: type, label: type })),
                  ]}
                />
              </div>
            )}
          </div>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
            รีเฟรช
          </Button>
          {walkinEnabled && (
            <Button onClick={() => setWalkinOpen(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              เพิ่มคิวนอก
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {calendarEnabled && (
          <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="tablist" aria-label="มุมมองคิวนัดหมาย">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'list'}
              onClick={() => setView('list')}
              className={view === 'list'
                ? 'flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900'
                : 'flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'}
            >
              <LayoutList className="h-3.5 w-3.5" aria-hidden="true" />
              รายการ
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'calendar'}
              onClick={() => setView('calendar')}
              className={view === 'calendar'
                ? 'flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900'
                : 'flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'}
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              ปฏิทิน
            </button>
          </div>
        )}
        <div className="w-64">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นชื่อ เบอร์ หรือเลขคิว"
            aria-label="ค้นหาการจอง"
            leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
          />
        </div>
        {debouncedSearch && (
          <span className="text-xs text-slate-400">ค้นหา: {debouncedSearch}</span>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {calendarEnabled && view === 'calendar' && (
        <BookingMonthCalendar
          selectedDate={date}
          rangeByDate={rangeByDate}
          loadingRange={loadingRange}
          rangeServiceLabel={rangeService || null}
          onSelectDay={handleSelectDay}
          onVisibleMonthChange={handleVisibleMonthChange}
        />
      )}

      {(view === 'list' || !calendarEnabled) && (loading ? (
        <div className="py-16 text-center">
          <LoadingSpinner />
        </div>
      ) : bookings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400 dark:border-slate-700">
          {debouncedSearch
            ? 'ไม่พบรายการที่ตรงกับที่ค้นหา'
            : date
              ? 'ไม่มีการจองในวันที่เลือก'
              : 'ไม่มีการจอง'}
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
                  {walkinEnabled && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={updatingId === booking.id}
                      onClick={() => setEditing(booking)}
                      aria-label={`แก้ไขข้อมูลผู้จองคิว ${booking.queue_number ?? booking.id}`}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      แก้ข้อมูล
                    </Button>
                  )}
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
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          แสดงรายการ{date ? `ของวันที่ ${formatThaiDate(date, { yearFormat: 'numeric' })}` : 'ทุกวัน'}
        </p>
        {(page > 0 || bookings.length >= PAGE_SIZE) && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page === 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="หน้าก่อน"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <span className="text-xs text-slate-500">หน้า {page + 1}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={bookings.length < PAGE_SIZE || loading}
              onClick={() => setPage((p) => p + 1)}
              aria-label="หน้าถัดไป"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {walkinEnabled && (
        <WalkinBookingDialog
          open={walkinOpen}
          serviceTypes={serviceTypes}
          initialDate={date}
          onClose={() => setWalkinOpen(false)}
          onCreated={() => void load()}
        />
      )}
      <EditContactDialog
        booking={walkinEnabled ? editing : null}
        onClose={() => setEditing(null)}
        onUpdated={(updated) =>
          setBookings((current) => current.map((b) => (b.id === updated.id ? updated : b)))
        }
      />
    </div>
  )
}
