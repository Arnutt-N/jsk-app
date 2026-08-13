// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BookingSettingsPage from '../page'
import type { BookingSettings } from '@/lib/booking'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function settings(overrides: Partial<BookingSettings> = {}): BookingSettings {
  return {
    enabled: true,
    service_types: ['ปรึกษากฎหมาย'],
    slot_minutes: 30,
    slot_capacity: 3,
    advance_days: 14,
    blackout_dates: ['2026-12-05'],
    reminder_enabled: true,
    reminder_lead_value: 1,
    reminder_lead_unit: 'DAY',
    ...overrides,
  }
}

let fetchMock: ReturnType<typeof vi.fn>

function mockFetch(initial: BookingSettings) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return jsonResponse(JSON.parse(String(init.body)))
    }
    return jsonResponse(initial)
  })
  vi.stubGlobal('fetch', fetchMock)
}

/** The saved payload from the last PUT. */
function savedPayload(): BookingSettings {
  const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
  if (!put) throw new Error('no PUT request was made')
  return JSON.parse(String((put[1] as RequestInit).body))
}

async function renderLoaded(initial = settings()) {
  mockFetch(initial)
  render(<BookingSettingsPage />)
  await waitFor(() => expect(screen.getByText('ตั้งค่าการจองคิว')).toBeInTheDocument())
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('loading', () => {
  it('shows the current configuration', async () => {
    await renderLoaded()
    expect(screen.getByDisplayValue('30')).toBeInTheDocument()
    expect(screen.getByText('ปรึกษากฎหมาย')).toBeInTheDocument()
    expect(screen.getByText('แจ้งเตือนล่วงหน้า 1 วัน ก่อนถึงเวลานัด')).toBeInTheDocument()
  })

  it('renders blackout dates in the Buddhist era', async () => {
    await renderLoaded()
    expect(screen.getByText('5 ธ.ค. 2569')).toBeInTheDocument()
  })
})

describe('the reminder setting', () => {
  it('sends the chosen unit and value in the saved payload', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.selectOptions(screen.getByLabelText('หน่วย'), 'HOUR')
    const leadValue = screen.getByLabelText('ล่วงหน้า')
    await user.clear(leadValue)
    await user.type(leadValue, '3')
    await user.click(screen.getByRole('button', { name: /บันทึกการตั้งค่า/ }))

    await waitFor(() => expect(savedPayload().reminder_lead_unit).toBe('HOUR'))
    expect(savedPayload().reminder_lead_value).toBe(3)
  })

  it('hides the lead-time inputs when reminders are switched off', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    expect(screen.getByLabelText('ล่วงหน้า')).toBeInTheDocument()
    await user.click(screen.getByLabelText('แจ้งเตือนล่วงหน้าก่อนถึงวันนัด'))

    expect(screen.queryByLabelText('ล่วงหน้า')).not.toBeInTheDocument()
    expect(screen.getByText('ปิดการแจ้งเตือนล่วงหน้า')).toBeInTheDocument()
  })

  it('persists the off state', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.click(screen.getByLabelText('แจ้งเตือนล่วงหน้าก่อนถึงวันนัด'))
    await user.click(screen.getByRole('button', { name: /บันทึกการตั้งค่า/ }))

    await waitFor(() => expect(savedPayload().reminder_enabled).toBe(false))
  })
})

describe('service types', () => {
  it('adds a typed service to the payload', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.type(screen.getByPlaceholderText('เช่น ปรึกษากฎหมาย'), 'ไกล่เกลี่ยข้อพิพาท')
    await user.click(screen.getByRole('button', { name: 'เพิ่มบริการ' }))
    await user.click(screen.getByRole('button', { name: /บันทึกการตั้งค่า/ }))

    await waitFor(() =>
      expect(savedPayload().service_types).toContain('ไกล่เกลี่ยข้อพิพาท'),
    )
  })

  it('removes a service', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.click(screen.getByLabelText('ลบบริการ ปรึกษากฎหมาย'))
    await user.click(screen.getByRole('button', { name: /บันทึกการตั้งค่า/ }))

    await waitFor(() => expect(savedPayload().service_types).toEqual([]))
  })

  it('warns when no service is configured', async () => {
    await renderLoaded(settings({ service_types: [] }))
    expect(
      screen.getByText('ยังไม่มีบริการ — เพิ่มอย่างน้อย 1 รายการก่อนเปิดใช้งาน'),
    ).toBeInTheDocument()
  })
})

describe('blackout dates', () => {
  it('removes a blackout date from the payload', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.click(screen.getByLabelText('ลบวันหยุด 5 ธ.ค. 2569'))
    await user.click(screen.getByRole('button', { name: /บันทึกการตั้งค่า/ }))

    await waitFor(() => expect(savedPayload().blackout_dates).toEqual([]))
  })
})

describe('failure handling', () => {
  it('surfaces a save error instead of pretending it worked', async () => {
    const user = userEvent.setup()
    mockFetch(settings())
    render(<BookingSettingsPage />)
    await waitFor(() => expect(screen.getByText('ตั้งค่าการจองคิว')).toBeInTheDocument())

    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ detail: 'บันทึกไม่สำเร็จ' }, 400),
    )
    await user.click(screen.getByRole('button', { name: /บันทึกการตั้งค่า/ }))

    await waitFor(() => expect(screen.getByText('บันทึกไม่สำเร็จ')).toBeInTheDocument())
    expect(screen.queryByText('บันทึกการตั้งค่าเรียบร้อยแล้ว')).not.toBeInTheDocument()
  })
})
