// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LiffBookingPage from '../page'
import type { Booking } from '@/lib/booking'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const CONFIRMED: Booking = {
  id: 1,
  service_type: 'ปรึกษากฎหมาย',
  booking_date: '2026-08-19',
  booking_time: '09:30:00',
  queue_number: '260819-001',
  status: 'CONFIRMED',
  contact_name: 'สมชาย ใจดี',
  phone_number: '0812345678',
  note: null,
}

let fetchMock: ReturnType<typeof vi.fn>

function stubLiff() {
  vi.stubGlobal('liff', {
    init: vi.fn(async () => {}),
    isLoggedIn: vi.fn(() => true),
    getIDToken: vi.fn(() => 'token-123'),
    closeWindow: vi.fn(),
  })
}

function stubFetch(overrides: {
  onCancel?: (booking: Booking) => Booking
  onUpdate?: (booking: Booking) => Booking
} = {}) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/options')) {
      return jsonResponse({
        service_types: ['ปรึกษากฎหมาย'],
        advance_days: 14,
        blackout_dates: [],
      })
    }
    if (u.includes('/availability')) {
      return jsonResponse({
        service_type: 'ปรึกษากฎหมาย',
        date: '2026-08-19',
        slots: [
          { time: '09:30:00', capacity: 3, booked: 0, remaining: 3, is_full: false },
        ],
      })
    }
    if (init?.method === 'POST' && u.endsWith('/cancel')) {
      return jsonResponse(
        overrides.onCancel?.({ ...CONFIRMED, status: 'CANCELLED' }) ?? {
          ...CONFIRMED,
          status: 'CANCELLED',
        },
      )
    }
    if (init?.method === 'PATCH') {
      const payload = JSON.parse(String(init.body))
      return jsonResponse(overrides.onUpdate?.({ ...CONFIRMED, ...payload }) ?? { ...CONFIRMED, ...payload })
    }
    // POST booking
    return jsonResponse(CONFIRMED)
  })
  vi.stubGlobal('fetch', fetchMock)
}

/** Walk the wizard to the confirmation screen. */
async function bookToDone() {
  const user = userEvent.setup()
  render(<LiffBookingPage />)
  await screen.findByRole('button', { name: 'ปรึกษากฎหมาย' })
  await user.click(screen.getByRole('button', { name: 'ปรึกษากฎหมาย' }))

  const dateSection = screen.getByText('เลือกวันที่').closest('section') as HTMLElement
  const firstDate = within(dateSection).getAllByRole('button')[0]
  await user.click(firstDate)

  const slotSection = screen.getByText('เลือกช่วงเวลา').closest('section') as HTMLElement
  await within(slotSection).findByRole('button', { name: /09:30/ })
  await user.click(within(slotSection).getByRole('button', { name: /09:30/ }))

  await user.type(screen.getByPlaceholderText('ชื่อสำหรับเรียกคิว'), 'สมชาย ใจดี')
  await user.type(screen.getByPlaceholderText('0812345678'), '0812345678')
  await user.click(screen.getByRole('button', { name: 'ยืนยันการจอง' }))
  await screen.findByText('จองคิวสำเร็จ')
  return user
}

beforeEach(() => {
  vi.restoreAllMocks()
  process.env.NEXT_PUBLIC_LIFF_ID = 'test-liff-id'
  stubLiff()
  stubFetch()
})

describe('post-booking actions', () => {
  it('offers cancel and edit buttons on the confirmation screen', async () => {
    await bookToDone()
    expect(screen.getByRole('button', { name: 'ยกเลิกการจอง' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'แก้ไขข้อมูล' })).toBeInTheDocument()
    expect(screen.getByText('260819-001')).toBeInTheDocument()
  })

  it('cancels the booking after confirmation and returns to the start', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = await bookToDone()

    await user.click(screen.getByRole('button', { name: 'ยกเลิกการจอง' }))

    await waitFor(() => {
      const cancel = fetchMock.mock.calls.find(
        ([url, init]) => init?.method === 'POST' && String(url).endsWith('/1/cancel'),
      )
      expect(cancel).toBeTruthy()
    })
    expect(await screen.findByText('ยกเลิกการจองแล้ว')).toBeInTheDocument()
    expect(screen.queryByText('260819-001')).not.toBeInTheDocument()
  })

  it('does not cancel when the citizen backs out of the confirm dialog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = await bookToDone()

    await user.click(screen.getByRole('button', { name: 'ยกเลิกการจอง' }))

    expect(screen.getByText('260819-001')).toBeInTheDocument()
    const cancels = fetchMock.mock.calls.filter(
      ([url, init]) => init?.method === 'POST' && String(url).endsWith('/cancel'),
    )
    expect(cancels).toHaveLength(0)
  })

  it('edits the contact info and shows the updated confirmation', async () => {
    stubFetch({ onUpdate: (b) => ({ ...b, contact_name: 'ชื่อใหม่' }) })
    const user = await bookToDone()

    await user.click(screen.getByRole('button', { name: 'แก้ไขข้อมูล' }))
    const nameInput = screen.getByPlaceholderText('ชื่อสำหรับเรียกคิว')
    await user.clear(nameInput)
    await user.type(nameInput, 'ชื่อใหม่')
    await user.click(screen.getByRole('button', { name: 'บันทึกการแก้ไข' }))

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
      expect(patch).toBeTruthy()
    })
    expect(await screen.findByText('แก้ไขข้อมูลเรียบร้อย')).toBeInTheDocument()
    expect(screen.getByText('ชื่อใหม่')).toBeInTheDocument()
  })
})
