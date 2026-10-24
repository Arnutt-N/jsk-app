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
  reminder_enabled: false,
  reminder_lead_value: 1,
  reminder_lead_unit: 'DAY',
  walkin_enabled: true,
  email_enabled: true,
}

const SLOTS = {
  service_type: 'ปรึกษากฎหมาย',
  date: '2026-08-19',
  slots: [
    { time: '09:00:00', capacity: 3, booked: 3, remaining: 0, is_full: true },
    { time: '09:30:00', capacity: 3, booked: 1, remaining: 2, is_full: false },
  ],
}

let fetchMock: ReturnType<typeof vi.fn>

function mockFetch({ settings = SETTINGS, rows }: { settings?: unknown; rows?: Booking[] } = {}) {
  const list = rows ?? [booking()]
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url)
    if (path.endsWith('/settings')) return jsonResponse(settings)
    if (path.includes('/availability')) return jsonResponse(SLOTS)
    if (init?.method === 'POST') return jsonResponse(booking({ id: 11 }), 201)
    if (init?.method === 'PATCH' && path.includes('/contact')) {
      return jsonResponse(booking({ contact_name: 'สมศรี ใจดี' }))
    }
    return jsonResponse(list)
  })
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => {
  vi.restoreAllMocks()
})

async function openWalkinDialog(user: ReturnType<typeof userEvent.setup>) {
  mockFetch()
  render(<AdminBookingsPage />)
  await user.click(await screen.findByRole('button', { name: 'เพิ่มคิวนอก' }))
  return within(await screen.findByRole('dialog'))
}

describe('walk-in dialog', () => {
  it('hides the entry points when the toggle is off', async () => {
    mockFetch({ settings: { ...SETTINGS, walkin_enabled: false } })
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    expect(screen.queryByRole('button', { name: 'เพิ่มคิวนอก' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /แก้ไขข้อมูลผู้จองคิว/ })).not.toBeInTheDocument()
  })

  it('asks for service, date and time before saving', async () => {
    const user = userEvent.setup()
    const dialog = await openWalkinDialog(user)
    await user.click(dialog.getByRole('button', { name: 'บันทึกคิว' }))
    expect(await dialog.findByText('กรุณาเลือกบริการ วันที่ และเวลาให้ครบ')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('creates the booking through the counter endpoint and reloads', async () => {
    const user = userEvent.setup()
    const dialog = await openWalkinDialog(user)

    const serviceSelect = dialog.getByText('บริการ').parentElement!.querySelector('select')!
    await user.selectOptions(serviceSelect, 'ปรึกษากฎหมาย')
    await user.type(dialog.getByLabelText('วันที่นัด'), '2026-08-19')

    const timeSelect = dialog.getByText('เวลา').parentElement!.querySelector('select')!
    await waitFor(() => expect(timeSelect.querySelectorAll('option').length).toBeGreaterThan(1))
    await user.selectOptions(timeSelect, '09:30:00')
    await user.click(dialog.getByRole('button', { name: 'บันทึกคิว' }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
      expect(post).toBeTruthy()
      expect(String(post![0])).toBe('/api/v1/admin/bookings')
      expect(JSON.parse(String(post![1]?.body)).service_type).toBe('ปรึกษากฎหมาย')
    })
  })

  it('sends the typed email with the walk-in payload', async () => {
    const user = userEvent.setup()
    const dialog = await openWalkinDialog(user)

    const serviceSelect = dialog.getByText('บริการ').parentElement!.querySelector('select')!
    await user.selectOptions(serviceSelect, 'ปรึกษากฎหมาย')
    await user.type(dialog.getByLabelText('วันที่นัด'), '2026-08-19')

    const timeSelect = dialog.getByText('เวลา').parentElement!.querySelector('select')!
    await waitFor(() => expect(timeSelect.querySelectorAll('option').length).toBeGreaterThan(1))
    await user.selectOptions(timeSelect, '09:30:00')
    await user.type(dialog.getByPlaceholderText('name@example.com'), 'citizen@example.com')
    await user.click(dialog.getByRole('button', { name: 'บันทึกคิว' }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse(String(post![1]?.body)).email).toBe('citizen@example.com')
    })
  })

  it('marks full slots as unavailable in the shared selector', async () => {
    const user = userEvent.setup()
    const dialog = await openWalkinDialog(user)

    const serviceSelect = dialog.getByText('บริการ').parentElement!.querySelector('select')!
    await user.selectOptions(serviceSelect, 'ปรึกษากฎหมาย')
    await user.type(dialog.getByLabelText('วันที่นัด'), '2026-08-19')

    await waitFor(() => {
      const full = dialog.getByRole('option', { name: '09:00 (ว่าง 0)' }) as HTMLOptionElement
      expect(full.disabled).toBe(true)
    })
  })
})

describe('search, service filter and pagination', () => {
  it('sends the typed text as q after a pause', async () => {
    const user = userEvent.setup()
    mockFetch()
    render(<AdminBookingsPage />)
    await screen.findByRole('list')

    await user.type(screen.getByLabelText('ค้นหาการจอง'), '081')

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes('q=081'))
      expect(call).toBeTruthy()
    })
  })

  it('says so plainly when nothing matches', async () => {
    const user = userEvent.setup()
    mockFetch({ rows: [] })
    render(<AdminBookingsPage />)
    await screen.findByText('ไม่มีการจอง')

    await user.type(screen.getByLabelText('ค้นหาการจอง'), 'ไม่มีคนนี้')

    expect(await screen.findByText('ไม่พบรายการที่ตรงกับที่ค้นหา')).toBeInTheDocument()
  })

  it('sends the chosen service type', async () => {
    const user = userEvent.setup()
    mockFetch()
    render(<AdminBookingsPage />)
    await screen.findByRole('list')

    const selects = screen.getAllByRole('combobox')
    const serviceSelect = selects[selects.length - 1]
    await user.selectOptions(serviceSelect, 'ปรึกษากฎหมาย')

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) =>
        String(url).includes(`service_type=${encodeURIComponent('ปรึกษากฎหมาย')}`),
      )
      expect(call).toBeTruthy()
    })
  })

  it('pages forward through a full page of results', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 100 }, (_, i) => booking({ id: 100 + i }))
    mockFetch({ rows })
    render(<AdminBookingsPage />)
    await screen.findByRole('list')

    await user.click(await screen.findByRole('button', { name: 'หน้าถัดไป' }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes('offset=100'))
      expect(call).toBeTruthy()
    })
    expect(await screen.findByText('หน้า 2')).toBeInTheDocument()
  })

  it('hides paging when the list fits on one page', async () => {
    mockFetch()
    render(<AdminBookingsPage />)
    await screen.findByRole('list')
    expect(screen.queryByRole('button', { name: 'หน้าถัดไป' })).not.toBeInTheDocument()
  })
})
describe('edit-contact dialog', () => {
  it('saves the new name through the contact endpoint', async () => {
    const user = userEvent.setup()
    mockFetch()
    render(<AdminBookingsPage />)
    await user.click(await screen.findByRole('button', { name: /แก้ไขข้อมูลผู้จองคิว/ }))

    const dialog = within(await screen.findByRole('dialog'))
    const inputs = dialog.getAllByRole('textbox')
    await user.clear(inputs[0])
    await user.type(inputs[0], 'สมศรี ใจดี')
    await user.click(dialog.getByRole('button', { name: 'บันทึก' }))

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([url, init]) => init?.method === 'PATCH' && String(url).includes('/contact'),
      )
      expect(patch).toBeTruthy()
      expect(String(patch![0])).toBe('/api/v1/admin/bookings/10/contact')
    })
  })

  it('clears the email when the field is emptied', async () => {
    const user = userEvent.setup()
    mockFetch({ rows: [booking({ email: 'citizen@example.com' })] })
    render(<AdminBookingsPage />)
    await user.click(await screen.findByRole('button', { name: /แก้ไขข้อมูลผู้จองคิว/ }))

    const dialog = within(await screen.findByRole('dialog'))
    const inputs = dialog.getAllByRole('textbox')
    await user.clear(inputs[3])
    await user.click(dialog.getByRole('button', { name: 'บันทึก' }))

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([url, init]) => init?.method === 'PATCH' && String(url).includes('/contact'),
      )
      expect(patch).toBeTruthy()
      expect(JSON.parse(String(patch![1]?.body)).email).toBe('')
    })
  })
})
