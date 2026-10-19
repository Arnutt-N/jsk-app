// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AdminBookingsPage from '../page'
import type { Booking } from '@/lib/booking'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 10,
    service_type: 'ปรึกษากฎหมาย',
    booking_date: '2026-10-19',
    booking_time: '09:30:00',
    queue_number: '261019-001',
    status: 'CONFIRMED',
    contact_name: 'สมชาย ใจดี',
    phone_number: '0812345678',
    note: null,
    reminder_sent_at: null,
    assigned_staff_id: null,
    ...overrides,
  }
}

const SETTINGS = {
  enabled: true,
  service_types: ['ปรึกษากฎหมาย'],
  slot_minutes: 30,
  slot_capacity: 3,
  advance_days: 14,
  blackout_dates: [],
  reminder_enabled: true,
  reminder_lead_value: 1,
  reminder_lead_unit: 'DAY',
  walkin_enabled: true,
  calendar_enabled: true,
  resend_enabled: true,
  assign_enabled: true,
}

const DIRECTORY = [
  {
    id: 5,
    display_name: 'สมหญิง รับเรื่อง',
    role: 'AGENT',
    active_tasks: 2,
    pending_tasks: 1,
    in_progress_tasks: 1,
  },
]

let fetchMock: ReturnType<typeof vi.fn>

function mockFetch({ settings = SETTINGS, rows }: { settings?: unknown; rows?: Booking[] } = {}) {
  const list = rows ?? [booking()]
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url)
    if (path.endsWith('/settings')) return jsonResponse(settings)
    if (path.includes('/users/workload')) return jsonResponse(DIRECTORY)
    if (path.includes('/assignment') && init?.method === 'PATCH') {
      return jsonResponse(booking({ assigned_staff_id: 5 }))
    }
    return jsonResponse(list)
  })
  vi.stubGlobal('fetch', fetchMock)
}

function assignmentCalls(): { url: string; body: unknown }[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')
    .map(([url, init]) => ({
      url: String(url),
      body: JSON.parse(String((init as RequestInit)?.body)),
    }))
    .filter((call) => call.url.includes('/assignment'))
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('staff assignment', () => {
  it('shows the assignee name from the directory', async () => {
    mockFetch({ rows: [booking({ assigned_staff_id: 5 })] })
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    expect(screen.getByText(/ผู้รับผิดชอบ:/)).toBeInTheDocument()
    expect(screen.getByText(/สมหญิง รับเรื่อง/)).toBeInTheDocument()
  })

  it('shows an unassigned fallback when nobody holds the booking', async () => {
    mockFetch()
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    expect(screen.getByText(/ยังไม่มอบหมาย/)).toBeInTheDocument()
  })

  it('hides the whole assignment surface when the toggle is off', async () => {
    mockFetch({ settings: { ...SETTINGS, assign_enabled: false } })
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    expect(screen.queryByText(/ผู้รับผิดชอบ:/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /มอบหมายคิว/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ไร้ผู้รับ' })).not.toBeInTheDocument()
  })

  it('treats a missing toggle in old settings as disabled', async () => {
    mockFetch({ settings: { ...SETTINGS, assign_enabled: undefined } })
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    expect(screen.queryByRole('button', { name: /มอบหมายคิว/ })).not.toBeInTheDocument()
  })

  it('filters to unassigned bookings through the chip', async () => {
    const user = userEvent.setup()
    mockFetch()
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    await user.click(screen.getByRole('button', { name: 'ไร้ผู้รับ' }))
    await waitFor(() => {
      const listCalls = fetchMock.mock.calls.map(([url]) => String(url))
      expect(listCalls.some((url) => url.includes('unassigned_only=true'))).toBe(true)
    })
  })

  it('assigns through the staff modal and updates the row', async () => {
    const user = userEvent.setup()
    mockFetch()
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    await user.click(screen.getByRole('button', { name: 'มอบหมายคิว 261019-001' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('สมหญิง รับเรื่อง')
    await user.click(within(dialog).getByRole('button', { name: 'เลือก' }))
    await user.click(within(dialog).getByRole('button', { name: 'ยืนยัน' }))
    await waitFor(() => expect(assignmentCalls()).toHaveLength(1))
    expect(assignmentCalls()[0].body).toEqual({ assigned_staff_id: 5 })
    await waitFor(() => expect(screen.getByText(/สมหญิง รับเรื่อง/)).toBeInTheDocument())
  })

  it('unassigns through a confirm dialog', async () => {
    const user = userEvent.setup()
    mockFetch({ rows: [booking({ assigned_staff_id: 5 })] })
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    await user.click(screen.getByRole('button', { name: 'ถอนการมอบหมายคิว 261019-001' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'ถอน' }))
    await waitFor(() => expect(assignmentCalls()).toHaveLength(1))
    expect(assignmentCalls()[0].body).toEqual({ assigned_staff_id: null })
  })
})
