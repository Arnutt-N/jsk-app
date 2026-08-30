// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { toISODate, type Booking } from '@/lib/booking'

import LiffBookingPage from '../page'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** ISO date `offset` days from today — the same dates buildDateOptions offers. */
function isoFromToday(offset: number): string {
  const base = new Date()
  return toISODate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset))
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
    isInClient: vi.fn(() => true),
    getProfile: vi.fn(async () => ({ userId: 'U1', displayName: 'สมชาย' })),
    getIDToken: vi.fn(() => 'token-123'),
    closeWindow: vi.fn(),
  })
}

function stubFetch(
  overrides: {
    onCancel?: (booking: Booking) => Booking
    onUpdate?: (booking: Booking) => Booking
    advanceDays?: number
    /** Blackout dates to serve from /options (defaults to none). */
    blackouts?: string[]
    /** Per-day override for the /availability/range response. */
    rangeDay?: (iso: string) => { date: string; is_open: boolean; remaining: number }
    /** Make the range request fail with this status (fail-open scenarios). */
    rangeStatus?: number
  } = {},
) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/options')) {
      return jsonResponse({
        service_types: ['ปรึกษากฎหมาย'],
        advance_days: overrides.advanceDays ?? 14,
        blackout_dates: overrides.blackouts ?? [],
      })
    }
    // NOTE: the range route must be matched before /availability — its URL
    // contains that substring.
    if (u.includes('/availability/range')) {
      if (overrides.rangeStatus) return jsonResponse({ detail: 'range failed' }, overrides.rangeStatus)
      const params = new URL(u, 'http://localhost').searchParams
      const from = params.get('from') as string
      const to = params.get('to') as string
      const days: { date: string; is_open: boolean; remaining: number }[] = []
      const cursor = new Date(`${from}T00:00:00`)
      const end = new Date(`${to}T00:00:00`)
      while (cursor <= end) {
        const iso = toISODate(cursor)
        days.push(overrides.rangeDay?.(iso) ?? { date: iso, is_open: true, remaining: 5 })
        cursor.setDate(cursor.getDate() + 1)
      }
      return jsonResponse({ service_type: 'ปรึกษากฎหมาย', days })
    }
    if (u.includes('/availability')) {
      return jsonResponse({
        service_type: 'ปรึกษากฎหมาย',
        date: '2026-08-19',
        slots: [
          { time: '09:30:00', capacity: 3, booked: 0, remaining: 3, is_full: false },
          { time: '10:00:00', capacity: 3, booked: 3, remaining: 0, is_full: true },
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
      return jsonResponse(
        overrides.onUpdate?.({ ...CONFIRMED, ...payload }) ?? { ...CONFIRMED, ...payload },
      )
    }
    // POST booking
    return jsonResponse(CONFIRMED)
  })
  vi.stubGlobal('fetch', fetchMock)
}

/** The date strip is the scroll container holding every bookable day chip. */
async function dateStrip(): Promise<HTMLElement> {
  const today = await screen.findByRole('button', { name: /วันนี้/ })
  return today.parentElement as HTMLElement
}

/** Walk the wizard to the confirmation screen. */
async function bookToDone() {
  const user = userEvent.setup()
  render(<LiffBookingPage />)
  await user.click(await screen.findByRole('button', { name: 'ปรึกษากฎหมาย' }))

  const slotSection = (await screen.findByText('เลือกช่วงเวลา')).closest('section') as HTMLElement
  await user.click(await within(slotSection).findByRole('button', { name: /09:30/ }))

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

describe('date selection', () => {
  it('renders every day in the advance window, not just the first few', async () => {
    stubFetch({ advanceDays: 13 })
    render(<LiffBookingPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'ปรึกษากฎหมาย' }))

    // advance_days = 13 -> today plus 13 days = 14 selectable chips.
    expect((await dateStrip()).querySelectorAll('button')).toHaveLength(14)
  })

  it('scroll-pads the strip so the edge chips keep their full border', async () => {
    render(<LiffBookingPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'ปรึกษากฎหมาย' }))

    const strip = await dateStrip()
    expect(strip.className).toContain('overflow-x-auto')
    expect(strip.className).toContain('px-4')
    expect(strip.className).toContain('scroll-px-4')
  })

  it('preselects the nearest day and loads its slots without another tap', async () => {
    render(<LiffBookingPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'ปรึกษากฎหมาย' }))

    expect(await screen.findByText('ช่วงเช้า')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /วันนี้/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('serves a revisited day from cache instead of refetching', async () => {
    const user = userEvent.setup()
    render(<LiffBookingPage />)
    await user.click(await screen.findByRole('button', { name: 'ปรึกษากฎหมาย' }))
    await screen.findByText('ช่วงเช้า')

    const availabilityCalls = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/availability')).length
    const before = availabilityCalls()

    const [today, tomorrow] = Array.from((await dateStrip()).querySelectorAll('button'))
    await user.click(tomorrow)
    await waitFor(() => expect(availabilityCalls()).toBe(before + 1))
    await user.click(today)

    expect(availabilityCalls()).toBe(before + 1) // the revisited day came from cache
  })

  it('disables a closed day chip before the citizen taps it', async () => {
    stubFetch({
      rangeDay: (d) =>
        d === isoFromToday(1)
          ? { date: d, is_open: false, remaining: 0 }
          : { date: d, is_open: true, remaining: 5 },
    })
    render(<LiffBookingPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'ปรึกษากฎหมาย' }))

    const strip = await dateStrip()
    await waitFor(() => expect(strip.querySelectorAll('button[disabled]')).toHaveLength(1))
    expect(screen.getByRole('button', { name: /วันนี้/ })).toBeEnabled()
  })

  it('preselects the first open day with seats, skipping closed days', async () => {
    stubFetch({
      rangeDay: (d) =>
        d === isoFromToday(0) || d === isoFromToday(1)
          ? { date: d, is_open: false, remaining: 0 }
          : { date: d, is_open: true, remaining: 5 },
    })
    render(<LiffBookingPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'ปรึกษากฎหมาย' }))

    // The slot grid loaded — meaning some day was preselected — but not today.
    expect(await screen.findByText('ช่วงเช้า')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /วันนี้/ })).toHaveAttribute('aria-pressed', 'false')
    const thirdChip = (await dateStrip()).querySelectorAll('button')[2]
    expect(thirdChip).toHaveAttribute('aria-pressed', 'true')

    const dayCall = fetchMock.mock.calls.find(
      ([url]) => String(url).includes('/availability') && !String(url).includes('/range'),
    )
    expect(String(dayCall?.[0])).toContain(`date=${isoFromToday(2)}`)
  })

  it('clips the range request to 62 calendar days when blackouts thin the window', async () => {
    // advance_days beyond the backend cap, with blackouts thinning the window:
    // the old count-based clip asked for >62 calendar days and got a 422.
    const blackouts = Array.from({ length: 10 }, (_, i) => isoFromToday(5 + i * 3))
    stubFetch({ advanceDays: 99, blackouts })
    render(<LiffBookingPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'ปรึกษากฎหมาย' }))

    await waitFor(() => {
      const rangeCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/availability/range'),
      )
      expect(rangeCall).toBeDefined()
      const params = new URL(String(rangeCall?.[0]), 'http://localhost').searchParams
      expect(params.get('from')).toBe(isoFromToday(0))
      expect(params.get('to')).toBe(isoFromToday(62))
    })
  })

  it('keeps every chip enabled and preselects today when the range fetch fails', async () => {
    stubFetch({ rangeStatus: 500 })
    render(<LiffBookingPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'ปรึกษากฎหมาย' }))

    expect(await screen.findByText('ช่วงเช้า')).toBeInTheDocument()
    expect((await dateStrip()).querySelectorAll('button[disabled]')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /วันนี้/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('design-system consistency', () => {
  it('uses brand tokens rather than emerald for selected state', async () => {
    render(<LiffBookingPage />)
    const service = await screen.findByRole('button', { name: 'ปรึกษากฎหมาย' })
    await userEvent.click(service)

    await waitFor(() => expect(service).toHaveAttribute('aria-pressed', 'true'))
    expect(service.className).toContain('border-brand-500')
    expect(service.className).not.toContain('emerald')

    const today = screen.getByRole('button', { name: /วันนี้/ })
    expect(today.className).toContain('border-brand-500')
    expect(today.className).not.toContain('emerald')
  })

  it('disables a full slot and labels it เต็ม', async () => {
    render(<LiffBookingPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'ปรึกษากฎหมาย' }))

    const fullSlot = await screen.findByRole('button', { name: /10:00/ })
    expect(fullSlot).toBeDisabled()
    expect(within(fullSlot).getByText('เต็ม')).toBeInTheDocument()
  })
})

describe('post-booking actions', () => {
  it('offers cancel and edit buttons on the confirmation screen', async () => {
    await bookToDone()
    expect(screen.getByRole('button', { name: 'ยกเลิกการจอง' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'แก้ไขข้อมูล' })).toBeInTheDocument()
    expect(screen.getByText('260819-001')).toBeInTheDocument()
  })

  it('cancels the booking after dialog confirmation and returns to the start', async () => {
    const user = await bookToDone()

    await user.click(screen.getByRole('button', { name: 'ยกเลิกการจอง' }))
    await user.click(await screen.findByRole('button', { name: 'ยืนยันยกเลิก' }))

    await waitFor(() => {
      const cancel = fetchMock.mock.calls.find(
        ([url, init]) => init?.method === 'POST' && String(url).endsWith('/1/cancel'),
      )
      expect(cancel).toBeTruthy()
    })
    expect(await screen.findByText('ยกเลิกการจองแล้ว')).toBeInTheDocument()
    expect(screen.queryByText('260819-001')).not.toBeInTheDocument()
  })

  it('does not cancel when the citizen backs out of the dialog', async () => {
    const user = await bookToDone()

    await user.click(screen.getByRole('button', { name: 'ยกเลิกการจอง' }))
    await user.click(await screen.findByRole('button', { name: 'เก็บการจองไว้' }))

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
