/**
 * Shared types and pure helpers for appointment booking.
 *
 * The formatting and grouping logic lives here rather than inside the pages so
 * it can be tested directly — Buddhist-era dates and the bookable-date window
 * are easy to get subtly wrong and hard to assert on through rendered DOM.
 */
import { API_BASE } from '@/lib/constants/api'

export type ReminderUnit = 'DAY' | 'HOUR'

export type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NOSHOW'

export interface Slot {
  time: string // "09:30:00"
  capacity: number
  booked: number
  remaining: number
  is_full: boolean
}

export interface Availability {
  service_type: string
  date: string // ISO "2026-08-19"
  slots: Slot[]
}

export interface Booking {
  id: number
  service_type: string
  booking_date: string
  booking_time: string
  queue_number: string | null
  status: BookingStatus
  contact_name: string | null
  phone_number: string | null
  note: string | null
}

export interface BookingSettings {
  enabled: boolean
  service_types: string[]
  slot_minutes: number
  slot_capacity: number
  advance_days: number
  blackout_dates: string[]
  reminder_enabled: boolean
  reminder_lead_value: number
  reminder_lead_unit: ReminderUnit
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  CONFIRMED: 'ยืนยันแล้ว',
  CANCELLED: 'ยกเลิก',
  COMPLETED: 'มาตามนัดแล้ว',
  NOSHOW: 'ไม่มาตามนัด',
}

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

/** Parse an ISO date string as a *local* date, avoiding UTC shift. */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function toISODate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** "2026-08-19" -> "19 ส.ค. 2569" — Thai readers expect the Buddhist era. */
export function formatThaiDate(iso: string): string {
  if (!iso) return '-'
  const date = parseISODate(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.getDate()} ${THAI_MONTHS_SHORT[date.getMonth()]} ${date.getFullYear() + 543}`
}

export function formatThaiWeekday(iso: string): string {
  const date = parseISODate(iso)
  return Number.isNaN(date.getTime()) ? '' : THAI_DAYS_SHORT[date.getDay()]
}

/** "09:30:00" -> "09:30". Tolerates a value that is already trimmed. */
export function formatTime(value: string): string {
  if (!value) return '-'
  return value.slice(0, 5)
}

/**
 * The dates a citizen may pick: today through `advanceDays` ahead, minus any
 * blackout date. Returned as ISO strings so they compare and key cleanly.
 */
export function buildDateOptions(
  today: Date,
  advanceDays: number,
  blackoutDates: readonly string[] = [],
): string[] {
  const blocked = new Set(blackoutDates)
  const options: string[] = []
  for (let offset = 0; offset <= advanceDays; offset += 1) {
    const candidate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
    const iso = toISODate(candidate)
    if (!blocked.has(iso)) options.push(iso)
  }
  return options
}

/** Split slots at noon so a long day does not render as one endless column. */
export function groupSlotsByPeriod(slots: readonly Slot[]): {
  morning: Slot[]
  afternoon: Slot[]
} {
  const morning: Slot[] = []
  const afternoon: Slot[] = []
  for (const slot of slots) {
    const hour = Number(slot.time.slice(0, 2))
    if (hour < 12) morning.push(slot)
    else afternoon.push(slot)
  }
  return { morning, afternoon }
}

/** Plain-language summary of the reminder setting, for the admin screen. */
export function describeReminder(settings: {
  reminder_enabled: boolean
  reminder_lead_value: number
  reminder_lead_unit: ReminderUnit
}): string {
  if (!settings.reminder_enabled) return 'ปิดการแจ้งเตือนล่วงหน้า'
  const unit = settings.reminder_lead_unit === 'DAY' ? 'วัน' : 'ชั่วโมง'
  return `แจ้งเตือนล่วงหน้า ${settings.reminder_lead_value} ${unit} ก่อนถึงเวลานัด`
}

// --- API -------------------------------------------------------------------

const LIFF_BASE = `${API_BASE}/liff/bookings`
const ADMIN_BASE = `${API_BASE}/admin/bookings`

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    return typeof body?.detail === 'string' ? body.detail : fallback
  } catch {
    return fallback
  }
}

function liffHeaders(idToken: string): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-Liff-Id-Token': idToken }
}

export async function fetchAvailability(
  idToken: string,
  serviceType: string,
  date: string,
): Promise<Availability> {
  const query = new URLSearchParams({ service_type: serviceType, date })
  const res = await fetch(`${LIFF_BASE}/availability?${query}`, {
    headers: liffHeaders(idToken),
  })
  if (!res.ok) throw new Error(await readError(res, 'ไม่สามารถโหลดช่วงเวลาที่ว่างได้'))
  return res.json()
}

export async function submitBooking(
  idToken: string,
  payload: {
    service_type: string
    booking_date: string
    booking_time: string
    contact_name?: string | null
    phone_number?: string | null
    note?: string | null
  },
): Promise<Booking> {
  const res = await fetch(LIFF_BASE, {
    method: 'POST',
    headers: liffHeaders(idToken),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await readError(res, 'จองคิวไม่สำเร็จ'))
  return res.json()
}

export async function fetchMyBookings(idToken: string): Promise<Booking[]> {
  const res = await fetch(`${LIFF_BASE}/me`, { headers: liffHeaders(idToken) })
  if (!res.ok) throw new Error(await readError(res, 'ไม่สามารถโหลดคิวของคุณได้'))
  return res.json()
}

export async function cancelBooking(idToken: string, bookingId: number): Promise<Booking> {
  const res = await fetch(`${LIFF_BASE}/${bookingId}/cancel`, {
    method: 'POST',
    headers: liffHeaders(idToken),
  })
  if (!res.ok) throw new Error(await readError(res, 'ยกเลิกการจองไม่สำเร็จ'))
  return res.json()
}

export async function fetchAdminBookings(params: {
  date?: string
  status?: BookingStatus
  serviceType?: string
}): Promise<Booking[]> {
  const query = new URLSearchParams()
  if (params.date) query.set('date', params.date)
  if (params.status) query.set('status', params.status)
  if (params.serviceType) query.set('service_type', params.serviceType)
  const res = await fetch(`${ADMIN_BASE}?${query}`)
  if (!res.ok) throw new Error(await readError(res, 'ไม่สามารถโหลดรายการจองได้'))
  return res.json()
}

export async function updateBookingStatus(
  bookingId: number,
  status: BookingStatus,
): Promise<Booking> {
  const res = await fetch(`${ADMIN_BASE}/${bookingId}/status?status=${status}`, {
    method: 'PATCH',
  })
  if (!res.ok) throw new Error(await readError(res, 'อัปเดตสถานะไม่สำเร็จ'))
  return res.json()
}

export async function fetchBookingSettings(): Promise<BookingSettings> {
  const res = await fetch(`${ADMIN_BASE}/settings`)
  if (!res.ok) throw new Error(await readError(res, 'ไม่สามารถโหลดการตั้งค่าได้'))
  return res.json()
}

export async function saveBookingSettings(settings: BookingSettings): Promise<BookingSettings> {
  const res = await fetch(`${ADMIN_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) throw new Error(await readError(res, 'บันทึกการตั้งค่าไม่สำเร็จ'))
  return res.json()
}
