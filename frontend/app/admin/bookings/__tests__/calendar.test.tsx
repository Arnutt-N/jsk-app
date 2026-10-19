// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
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
  reminder_enabled: false,
  reminder_lead_value: 1,
  reminder_lead_unit: 'DAY',
  walkin_enabled: true,
  calendar_enabled: true,
}

const RANGE = {
  service_type: 'ปรึกษากฎหมาย',
  days: [
    { date: '2026-10-19', is_open: true, remaining: 2 },
    { date: '2026-10-20', is_open: true, remaining: 0 },
    { date: '2026-10-21', is_open: false, remaining: 0 },
  ],
}

let fetchMock: ReturnType<typeof vi.fn>

function mockFetch({ settings = SETTINGS }: { settings?: unknown } = {}) {
  fetchMock = vi.fn(async (url: string) => {
    const path = String(url)
    if (path.endsWith('/settings')) return jsonResponse(settings)
    if (path.includes('/availability/range')) return jsonResponse(RANGE)
    return jsonResponse([booking()])
  })
  vi.stubGlobal('fetch', fetchMock)
}

function rangeCalls(): string[] {
  return fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.includes('/availability/range'))
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('calendar view', () => {
  it('shows list/calendar tabs when the toggle is on', async () => {
    mockFetch()
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    expect(screen.getByRole('tab', { name: 'รายการ' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'ปฏิทิน' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('opens the month grid with fullness and fetches the visible month', async () => {
    const user = userEvent.setup()
    mockFetch()
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    await user.click(screen.getByRole('tab', { name: 'ปฏิทิน' }))
    expect(await screen.findByRole('group', { name: 'วันในเดือน' })).toBeInTheDocument()
    await waitFor(() => expect(rangeCalls()).not.toHaveLength(0))
    const call = rangeCalls()[0]
    expect(call).toContain('service_type=%E0%B8%9B%E0%B8%A3%E0%B8%B6%E0%B8%81%E0%B8%A9%E0%B8%B2%E0%B8%81%E0%B8%8E%E0%B8%AB%E0%B8%A1%E0%B8%B2%E0%B8%A2')
    expect(call).toMatch(/from=\d{4}-\d{2}-01/)
    expect(screen.getByText('ความเต็มของบริการ: ปรึกษากฎหมาย')).toBeInTheDocument()
  })

  it('clicking a day filters the list and returns to it', async () => {
    const user = userEvent.setup()
    mockFetch()
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    await user.click(screen.getByRole('tab', { name: 'ปฏิทิน' }))
    await screen.findByRole('group', { name: 'วันในเดือน' })
    const visible = rangeCalls()[0]
    const month = visible.match(/from=(\d{4}-\d{2})-01/)?.[1]
    expect(month).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '19 ตุลาคม 2569 (ว่าง)' }))
    await screen.findByRole('list')
    expect(screen.queryByRole('group', { name: 'วันในเดือน' })).not.toBeInTheDocument()
    const listCalls = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => !url.includes('/settings') && !url.includes('/availability'))
    expect(listCalls.some((url) => url.includes('date=2026-10-19'))).toBe(true)
  })

  it('hides the tabs entirely when the toggle is off', async () => {
    mockFetch({ settings: { ...SETTINGS, calendar_enabled: false } })
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'ปฏิทิน' })).not.toBeInTheDocument()
  })

  it('treats a missing toggle in old settings as enabled', async () => {
    // undefined serializes away: the page gets pre-Phase-3 settings.
    mockFetch({ settings: { ...SETTINGS, calendar_enabled: undefined } })
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    expect(screen.getByRole('tab', { name: 'ปฏิทิน' })).toBeInTheDocument()
  })
})
