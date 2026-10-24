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
    email: null,
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
}

const RESENT_AT = '2026-10-19T10:00:00'

let fetchMock: ReturnType<typeof vi.fn>

function mockFetch({ settings = SETTINGS, rows }: { settings?: unknown; rows?: Booking[] } = {}) {
  const list = rows ?? [booking()]
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url)
    if (path.endsWith('/settings')) return jsonResponse(settings)
    if (path.includes('/remind') && init?.method === 'POST') {
      return jsonResponse(booking({ reminder_sent_at: RESENT_AT }))
    }
    return jsonResponse(list)
  })
  vi.stubGlobal('fetch', fetchMock)
}

function remindCalls(): string[] {
  return fetchMock.mock.calls
    .map(([url, init]) => ({ url: String(url), method: (init as RequestInit | undefined)?.method }))
    .filter((call) => call.url.includes('/remind'))
    .map((call) => `${call.method} ${call.url}`)
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('reminder resend', () => {
  it('shows a never-reminded fallback when no reminder went out', async () => {
    mockFetch()
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    expect(screen.getByText('ยังไม่เคยเตือน')).toBeInTheDocument()
  })

  it('shows the last reminder time in Thai when one went out', async () => {
    mockFetch({ rows: [booking({ reminder_sent_at: '2026-10-18T08:30:00' })] })
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    expect(screen.getByText(/เตือนแล้ว/)).toBeInTheDocument()
    expect(screen.queryByText('ยังไม่เคยเตือน')).not.toBeInTheDocument()
  })

  it('confirms before resending and updates the row', async () => {
    const user = userEvent.setup()
    mockFetch()
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    await user.click(screen.getByRole('button', { name: 'ส่งเตือนซ้ำคิว 261019-001' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/ส่งข้อความเตือนให้สมชาย.*อีกครั้งหรือไม่/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'ส่งเตือน' }))
    await waitFor(() => expect(remindCalls()).toHaveLength(1))
    expect(remindCalls()[0]).toContain('POST')
    await waitFor(() => expect(screen.getByText(/เตือนแล้ว/)).toBeInTheDocument())
  })

  it('hides the resend entry point when the toggle is off', async () => {
    mockFetch({ settings: { ...SETTINGS, resend_enabled: false } })
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    expect(screen.queryByRole('button', { name: /ส่งเตือนซ้ำ/ })).not.toBeInTheDocument()
    expect(screen.getByText('ยังไม่เคยเตือน')).toBeInTheDocument()
  })

  it('treats a missing toggle in old settings as enabled', async () => {
    mockFetch({ settings: { ...SETTINGS, resend_enabled: undefined } })
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    expect(screen.getByRole('button', { name: /ส่งเตือนซ้ำ/ })).toBeInTheDocument()
  })
})
