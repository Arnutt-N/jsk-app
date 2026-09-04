// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AdminBookingsPage from '../page'
import type { Booking } from '@/lib/booking'
import { isoToYMD } from '@/lib/utils'

vi.mock('@/components/ui/CalendarPickerTH', () => ({
  default: function MockCalendarPicker({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string | null
    onChange: (val: string | null) => void
    ariaLabel?: string
  }) {
    return (
      <input
        type="date"
        aria-label={ariaLabel || 'วันที่'}
        value={value ? isoToYMD(value) : ''}
        onChange={(e) => {
          const val = e.target.value
          if (!val) {
            onChange(null)
          } else {
            const d = new Date(`${val}T00:00:00`)
            onChange(!isNaN(d.getTime()) ? d.toISOString() : null)
          }
        }}
      />
    )
  },
}))

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
    booking_date: '2026-08-19',
    booking_time: '09:30:00',
    queue_number: '260819-001',
    status: 'CONFIRMED',
    contact_name: 'สมชาย ใจดี',
    phone_number: '0812345678',
    note: null,
    ...overrides,
  }
}

let fetchMock: ReturnType<typeof vi.fn>

function mockFetch(list: Booking[]) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      const status = new URL(url, 'http://test').searchParams.get('status')
      return jsonResponse(booking({ status: status as Booking['status'] }))
    }
    return jsonResponse(list)
  })
  vi.stubGlobal('fetch', fetchMock)
}

async function renderLoaded(list: Booking[] = [booking()]) {
  mockFetch(list)
  render(<AdminBookingsPage />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
}

/**
 * Queries scoped to the booking list.
 *
 * The status filter renders an <option> for every status, so an unscoped
 * `getByText('มาตามนัดแล้ว')` matches the dropdown as well as the badge.
 */
async function list() {
  return within(await screen.findByRole('list'))
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('the day list', () => {
  it('shows the queue number, time and contact for each booking', async () => {
    await renderLoaded()
    const row = await list()
    expect(row.getByText('09:30')).toBeInTheDocument()
    expect(row.getByText('260819-001')).toBeInTheDocument()
    expect(row.getByText('สมชาย ใจดี')).toBeInTheDocument()
    expect(row.getByText('ยืนยันแล้ว')).toBeInTheDocument()
  })

  it('falls back to a placeholder when no name was given', async () => {
    await renderLoaded([booking({ contact_name: null })])
    expect((await list()).getByText('ไม่ระบุชื่อ')).toBeInTheDocument()
  })

  it('says so plainly when the selected day is empty', async () => {
    const user = userEvent.setup()
    await renderLoaded([])

    await user.type(screen.getByLabelText('วันที่'), '2026-08-19')

    expect(await screen.findByText('ไม่มีการจองในวันที่เลือก')).toBeInTheDocument()
  })

  it('says "ไม่มีการจอง" when no date filter is set', async () => {
    await renderLoaded([])
    expect(await screen.findByText('ไม่มีการจอง')).toBeInTheDocument()
    expect(screen.queryByText('ไม่มีการจองในวันที่เลือก')).not.toBeInTheDocument()
  })

  it('shows a "ทุกวัน" hint next to the date picker when no date is selected', async () => {
    await renderLoaded()
    expect(await screen.findByText('ทุกวัน')).toBeInTheDocument()
  })

  it('requests all days by default (no date param)', async () => {
    await renderLoaded()
    await waitFor(() => {
      const [url] = fetchMock.mock.calls[0]
      expect(String(url)).not.toContain('date=')
    })
  })

  it('requests the selected date when one is chosen', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.type(screen.getByLabelText('วันที่'), '2026-08-19')

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url]) => String(url).includes('date=2026-08-19'),
      )
      expect(call).toBeTruthy()
    })
  })

  it('says "ทุกวัน" in the footer when no date is selected', async () => {
    await renderLoaded()
    expect(await screen.findByText('แสดงรายการทุกวัน')).toBeInTheDocument()
  })

  it('clears date filter and re-fetches all bookings when "ล้างวันที่" is clicked', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await user.type(screen.getByLabelText('วันที่'), '2026-08-19')
    const clearButton = await screen.findByRole('button', { name: 'ล้างวันที่' })
    await user.click(clearButton)
    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
      expect(String(lastCall[0])).not.toContain('date=')
    })
  })
})

describe('counter actions', () => {
  it('offers actions only for a confirmed booking', async () => {
    await renderLoaded([booking({ status: 'COMPLETED' })])
    const row = await list()
    expect(row.getByText('มาตามนัดแล้ว')).toBeInTheDocument()
    expect(row.queryByRole('button', { name: 'มาแล้ว' })).not.toBeInTheDocument()
  })

  it('sends the chosen status to the status endpoint', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.click(await screen.findByRole('button', { name: 'ไม่มา' }))

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
      expect(patch).toBeTruthy()
      expect(String(patch![0])).toBe('/api/v1/admin/bookings/10/status?status=NOSHOW')
    })
  })

  it('reflects the new status without a full reload', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.click(await screen.findByRole('button', { name: 'มาแล้ว' }))

    await waitFor(async () =>
      expect((await list()).getByText('มาตามนัดแล้ว')).toBeInTheDocument(),
    )
  })

  it('surfaces a failed update instead of silently reverting', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await screen.findByRole('button', { name: 'ยกเลิก' })

    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ detail: 'อัปเดตสถานะไม่สำเร็จ' }, 409),
    )
    await user.click(screen.getByRole('button', { name: 'ยกเลิก' }))

    expect(await screen.findByText('อัปเดตสถานะไม่สำเร็จ')).toBeInTheDocument()
  })
})
