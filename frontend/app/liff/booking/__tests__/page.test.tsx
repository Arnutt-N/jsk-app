// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { toISODate, parseISODate, type Booking } from '@/lib/booking'
import { THAI_MONTHS_LONG } from '@/lib/format-date'
import { toBE } from '@/lib/utils'
import { ToastProvider } from '@/components/ui/Toast'

import LiffBookingPage from '../page'

function renderPage() {
  return render(
    <ToastProvider>
      <LiffBookingPage />
    </ToastProvider>,
  )
}

async function chooseService() {
  await userEvent.selectOptions(
    await screen.findByRole('combobox', { name: 'เลือกบริการ' }),
    'ปรึกษากฎหมาย',
  )
}

async function goNext() {
  await userEvent.click(await screen.findByRole('button', { name: 'ถัดไป' }))
}

async function goBack() {
  await userEvent.click(await screen.findByRole('button', { name: 'กลับ' }))
}

async function openCalendar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'เลือกจากปฏิทิน' }))
  await user.click(screen.getByLabelText('เปิดปฏิทินเลือกวันที่'))
}

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
  reminder_sent_at: null,
  assigned_staff_id: null,
  email: null,
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
    /** Make the options request fail with this status (offline badge scenario). */
    optionsStatus?: number
    /** Blackout dates to serve from /options (defaults to none). */
    blackouts?: string[]
    /** Range cap to serve from /options as max_range_days (defaults: omit). */
    maxRangeDays?: number
    /** Email channel flag to serve from /options as email_enabled (defaults: omit = off). */
    emailEnabled?: boolean
    /** Make the range request hang (pins the flow on the date step). */
    rangeHang?: boolean
    /** Per-day override for the /availability/range response. */
    rangeDay?: (iso: string) => { date: string; is_open: boolean; remaining: number }
    /** Make the range request fail with this status (fail-open scenarios). */
    rangeStatus?: number
    submitStatus?: number
  } = {},
) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/options')) {
      if (overrides.optionsStatus)
        return jsonResponse({ detail: 'options failed' }, overrides.optionsStatus)
      return jsonResponse({
        service_types: ['ปรึกษากฎหมาย'],
        advance_days: overrides.advanceDays ?? 14,
        blackout_dates: overrides.blackouts ?? [],
        ...(overrides.maxRangeDays !== undefined && {
          max_range_days: overrides.maxRangeDays,
        }),
        ...(overrides.emailEnabled !== undefined && {
          email_enabled: overrides.emailEnabled,
        }),
      })
    }
    // NOTE: the range route must be matched before /availability — its URL
    // contains that substring.
    if (u.includes('/availability/range')) {
      if (overrides.rangeHang) return new Promise<Response>(() => {})
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
    if (init?.method === 'POST' && overrides.submitStatus)
      return jsonResponse({ detail: 'slot just filled' }, overrides.submitStatus)
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
  renderPage()
  await chooseService()
  await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))

  await user.click(await screen.findByRole('button', { name: /09:30/ }))
  await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))

  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'คำนำหน้า' }), 'นาย')
  await user.type(screen.getByPlaceholderText('ชื่อจริง'), 'สมชาย')
  await user.type(screen.getByPlaceholderText('นามสกุล'), 'ใจดี')
  await user.type(screen.getByPlaceholderText('0812345678'), '0812345678')
  await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
  await user.click(screen.getByRole('button', { name: 'ยืนยันการจอง' }))
  await screen.findByText('จองคิวสำเร็จ')
  return user
}

beforeEach(() => {
  vi.restoreAllMocks()
  window.sessionStorage.clear()
  process.env.NEXT_PUBLIC_LIFF_ID = 'test-liff-id'
  stubLiff()
  stubFetch({ emailEnabled: true })
})

describe('date selection', () => {
  it('renders one week per page with a week label, not the whole window', async () => {
    stubFetch({ advanceDays: 13 })
    renderPage()
    await chooseService()
    await goNext()

    const chips = () =>
      (
        (
          screen
            .getByRole('heading', { name: 'เลือกวันที่' })
            .closest('.backdrop-blur-xl') as HTMLElement
        ).querySelector('.overflow-x-auto') as HTMLElement
      ).querySelectorAll('button')

    await screen.findByRole('button', { name: /วันนี้/ })
    expect(chips()).toHaveLength(7)
    const firstLabel = screen.getByText(/ – /).textContent

    await userEvent.click(screen.getByRole('button', { name: 'สัปดาห์ถัดไป' }))

    expect(chips()).toHaveLength(7)
    expect(screen.queryByRole('button', { name: /วันนี้/ })).not.toBeInTheDocument()
    expect(screen.getByText(/ – /).textContent).not.toBe(firstLabel)
    expect(screen.getByRole('button', { name: 'สัปดาห์ถัดไป' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'สัปดาห์ก่อนหน้า' })).toBeEnabled()
  })

  it('scroll-pads the strip so the edge chips keep their full border', async () => {
    renderPage()
    await chooseService()
    await goNext()

    const strip = await dateStrip()
    expect(strip.className).toContain('overflow-x-auto')
    expect(strip.className).toContain('px-4')
    expect(strip.className).toContain('scroll-px-4')
  })

  it('preselects the nearest day and loads its slots without another tap', async () => {
    renderPage()
    await chooseService()
    await goNext()

    expect(await screen.findByText('ช่วงเช้า')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /วันนี้/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('serves a revisited day from cache instead of refetching', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await goNext()
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
    renderPage()
    await chooseService()
    await goNext()

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
    renderPage()
    await chooseService()
    await goNext()

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
    renderPage()
    await chooseService()

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

  it('clips the range request with the cap advertised by /options, not a local guess', async () => {
    // The backend owns the cap and serves it via /options (max_range_days);
    // the hardcoded 62 is only a fallback for older backends.
    stubFetch({ advanceDays: 99, maxRangeDays: 10 })
    renderPage()
    await chooseService()

    await waitFor(() => {
      const rangeCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/availability/range'),
      )
      expect(rangeCall).toBeDefined()
      const params = new URL(String(rangeCall?.[0]), 'http://localhost').searchParams
      expect(params.get('from')).toBe(isoFromToday(0))
      expect(params.get('to')).toBe(isoFromToday(10))
    })
  })

  it('keeps every chip enabled and preselects today when the range fetch fails', async () => {
    stubFetch({ rangeStatus: 500 })
    renderPage()
    await chooseService()
    await goNext()

    expect(await screen.findByText('ช่วงเช้า')).toBeInTheDocument()
    expect((await dateStrip()).querySelectorAll('button[disabled]')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /วันนี้/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('marks full days เต็ม and closed days หยุด with a legend', async () => {
    stubFetch({
      rangeDay: (d) =>
        d === isoFromToday(1)
          ? { date: d, is_open: true, remaining: 0 }
          : d === isoFromToday(2)
            ? { date: d, is_open: false, remaining: 0 }
            : { date: d, is_open: true, remaining: 5 },
    })
    renderPage()
    await chooseService()
    await goNext()

    const strip = await dateStrip()
    await waitFor(() => expect(strip.querySelectorAll('button[disabled]')).toHaveLength(2))
    expect(within(strip).getByText('เต็ม')).toBeInTheDocument()
    expect(within(strip).getByText('หยุด')).toBeInTheDocument()
    expect(screen.getByLabelText('คำอธิบายสถานะวันจอง')).toBeInTheDocument()
  })
})

describe('shared form chrome', () => {
  it('renders a sticky header bar with the platform subtitle and an open badge', async () => {
    renderPage()
    await chooseService()

    const banner = screen.getByRole('banner')
    expect(banner.className).toContain('sticky')
    expect(within(banner).getByText('จองคิวนัดหมาย')).toBeInTheDocument()
    expect(
      within(banner).getByText('จองคิวนัดหมายล่วงหน้า • JSK 4.0 Platform'),
    ).toBeInTheDocument()
    expect(within(banner).getByText('เปิดรับจอง')).toBeInTheDocument()
  })

  it('shows a connecting badge when the options request fails', async () => {
    stubFetch({ optionsStatus: 500 })
    renderPage()

    const banner = await screen.findByRole('banner')
    expect(within(banner).getByText('กำลังเชื่อมต่อ…')).toBeInTheDocument()
  })

  it('keeps the helper sentence under the header bar', async () => {
    renderPage()
    await screen.findByRole('combobox', { name: 'เลือกบริการ' })

    expect(screen.getByText('เลือกบริการ วันที่ และช่วงเวลาที่สะดวก')).toBeInTheDocument()
  })

  it('renders the four wizard steps as icon circles with the current step marked', async () => {
    const { container } = renderPage()
    await chooseService()

    const stepper = screen.getByRole('list', { name: 'ขั้นตอนการจอง' })
    for (const label of ['บริการ', 'วันเวลา', 'ผู้จอง', 'ยืนยัน']) {
      expect(within(stepper).getByText(label)).toBeInTheDocument()
    }
    for (const n of ['2', '3', '4']) {
      expect(within(stepper).queryByText(n)).not.toBeInTheDocument()
    }
    expect(container.querySelectorAll('li > span:first-child svg')).toHaveLength(4)
    expect(within(stepper).getByText('บริการ')).toHaveAttribute('aria-current', 'step')

    await goNext()
    expect(within(stepper).getByText('วันเวลา')).toHaveAttribute('aria-current', 'step')
    expect(within(stepper).getByText('บริการ')).not.toHaveAttribute('aria-current')
  })
})

describe('design-system consistency', () => {
  it('uses brand tokens rather than emerald for selected state', async () => {
    renderPage()
    await chooseService()

    const select = await screen.findByRole('combobox', { name: 'เลือกบริการ' })
    expect(select).toHaveValue('ปรึกษากฎหมาย')
    await goNext()

    const today = screen.getByRole('button', { name: /วันนี้/ })
    expect(today.className).toContain('border-brand-500')
    expect(today.className).not.toContain('emerald')
  })

  it('disables a full slot and labels it เต็ม', async () => {
    renderPage()
    await chooseService()
    await goNext()

    const fullSlot = await screen.findByRole('button', { name: /10:00/ })
    expect(fullSlot).toBeDisabled()
    expect(within(fullSlot).getByText('เต็ม')).toBeInTheDocument()
  })
})

describe('shared card rhythm', () => {
  it('shows one wizard step at a time as glass Cards', async () => {
    renderPage()
    await chooseService()

    const serviceHeading = screen.getByRole('heading', { name: 'เลือกบริการ' })
    expect(serviceHeading.tagName).toBe('H3')
    expect(serviceHeading.closest('.backdrop-blur-xl')).not.toBeNull()
    expect(screen.queryByRole('heading', { name: 'เลือกวันที่' })).not.toBeInTheDocument()

    await goNext()
    for (const title of ['เลือกวันที่', 'เลือกช่วงเวลา']) {
      const heading = screen.getByRole('heading', { name: title })
      expect(heading.closest('.backdrop-blur-xl')).not.toBeNull()
    }
    expect(screen.queryByRole('heading', { name: 'ข้อมูลผู้จอง' })).not.toBeInTheDocument()
  })

  it('lets the date card overflow so the calendar popup escapes instead of clipping', async () => {
    renderPage()
    await chooseService()
    await goNext()

    const toggle = await screen.findByRole('button', { name: 'เลือกจากปฏิทิน' })
    expect(toggle.closest('.overflow-visible')).not.toBeNull()
    expect(toggle.closest('.overflow-hidden')).toBeNull()
  })

  it('renders the confirmation as a Card with its title in the header', async () => {
    await bookToDone()

    const heading = screen.getByRole('heading', { name: 'จองคิวสำเร็จ' })
    expect(heading.tagName).toBe('H3')
    expect(heading.closest('.backdrop-blur-xl')).not.toBeNull()
  })

  it('keeps the Thai contact labels in the shared label style', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await goNext()
    await user.click(await screen.findByRole('button', { name: /09:30/ }))
    await goNext()

    for (const label of ['คำนำหน้า', 'ชื่อ', 'นามสกุล', 'เบอร์โทรศัพท์']) {
      const el = screen.getByText(label)
      expect(el.className).toContain('uppercase')
      expect(el.className).toContain('font-bold')
    }
  })
})

describe('picker-strip sync', () => {
  /** Accessible name of a picker day cell, mirroring the picker's own label. */
  function cellName(iso: string): string {
    const d = parseISODate(iso)
    return `${d.getDate()} ${THAI_MONTHS_LONG[d.getMonth()]} ${toBE(d.getFullYear())}`
  }

  /** Click through months until the cell is visible, then return it. */
  async function navToCell(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    name: string,
  ): Promise<HTMLElement> {
    for (let i = 0; i < 4; i++) {
      const cell = within(dialog).queryByLabelText(name)
      if (cell) return cell
      await user.click(within(dialog).getByLabelText('เดือนถัดไป'))
    }
    throw new Error(`day cell not found: ${name}`)
  }

  it('B1: tapping a strip chip updates the picker to the same date', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await goNext()
    await user.click(screen.getByRole('button', { name: 'เลือกจากปฏิทิน' }))

    const chips = (await dateStrip()).querySelectorAll('button')
    await user.click(chips[1])

    const dayInput = screen.getByLabelText('เลือกวันที่จอง') as HTMLInputElement
    expect(dayInput.value).toBe(String(parseISODate(isoFromToday(1)).getDate()).padStart(2, '0'))
  })

  it('B2: picking a day in the calendar presses the matching chip and loads its slots', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await goNext()
    await screen.findByText('ช่วงเช้า')

    const targetIso = isoFromToday(1)
    await openCalendar(user)
    const dialog = await screen.findByRole('dialog')
    await user.click(await navToCell(user, dialog, cellName(targetIso)))

    const pressed = (await dateStrip()).querySelector('button[aria-pressed="true"]')
    expect(pressed?.textContent).toContain(String(parseISODate(targetIso).getDate()))
    await waitFor(() => {
      const dayCall = fetchMock.mock.calls.find(
        ([url]) =>
          String(url).includes('/availability') &&
          !String(url).includes('/range') &&
          String(url).includes(`date=${targetIso}`),
      )
      expect(dayCall).toBeDefined()
    })
  })

  it('B3: disables blackout, closed, and full days in the picker; unknown days stay enabled', async () => {
    const closedIso = isoFromToday(1)
    const fullIso = isoFromToday(2)
    stubFetch({
      advanceDays: 99,
      maxRangeDays: 10,
      blackouts: [isoFromToday(3)],
      rangeDay: (d) =>
        d === closedIso
          ? { date: d, is_open: false, remaining: 0 }
          : d === fullIso
            ? { date: d, is_open: true, remaining: 0 }
            : { date: d, is_open: true, remaining: 5 },
    })
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await goNext()
    await openCalendar(user)
    const dialog = await screen.findByRole('dialog')

    for (const iso of [closedIso, fullIso, isoFromToday(3)]) {
      expect(await navToCell(user, dialog, cellName(iso))).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    }
    // Past the range-request clip the picker has no day info, so it stays open.
    const farIso = isoFromToday(50)
    expect(await navToCell(user, dialog, cellName(farIso))).not.toHaveAttribute('aria-disabled')
  })

  it('B4: keeps in-window picker days enabled when the range request fails', async () => {
    stubFetch({ rangeStatus: 500 })
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await goNext()
    expect((await dateStrip()).querySelectorAll('button[disabled]')).toHaveLength(0)
    await openCalendar(user)
    const dialog = await screen.findByRole('dialog')
    // Fail-open covers the window, not the whole month: days outside the
    // bookable window stay disabled while in-window days stay enabled.
    for (const iso of [isoFromToday(0), isoFromToday(1)]) {
      expect(await navToCell(user, dialog, cellName(iso))).not.toHaveAttribute('aria-disabled')
    }
  })

  it('B5: renders the picker unclamped and without crashing when every day is blacked out', async () => {
    stubFetch({
      advanceDays: 14,
      blackouts: Array.from({ length: 15 }, (_, i) => isoFromToday(i)),
    })
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await goNext()
    await openCalendar(user)

    const dialog = await screen.findByRole('dialog')
    const headerText = () => within(dialog).getByLabelText('เลือกเดือน').textContent
    const shown = headerText()
    await user.click(within(dialog).getByLabelText('เดือนก่อนหน้า'))
    expect(headerText()).not.toBe(shown)
    // The open dialog owns the only วันนี้ button, so close it before
    // asserting the strip itself holds no day chips.
    await user.keyboard('{Escape}')
    const card = screen
      .getByRole('heading', { name: 'เลือกวันที่' })
      .closest('.backdrop-blur-xl') as HTMLElement
    const strip = card.querySelector('.overflow-x-auto') as HTMLElement
    expect(strip.querySelectorAll('button')).toHaveLength(0)
  })

  it('B6: submits the picked day as a bare YYYY-MM-DD date', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await goNext()
    await screen.findByText('ช่วงเช้า')

    const targetIso = isoFromToday(1)
    await openCalendar(user)
    const dialog = await screen.findByRole('dialog')
    await user.click(await navToCell(user, dialog, cellName(targetIso)))

    await user.click(await screen.findByRole('button', { name: /09:30/ }))
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await user.click(screen.getByRole('button', { name: 'ยืนยันการจอง' }))
    await screen.findByText('จองคิวสำเร็จ')

    const post = fetchMock.mock.calls.find(
      ([url, init]) => init?.method === 'POST' && !String(url).endsWith('/cancel'),
    )
    const body = JSON.parse(String(post?.[1]?.body))
    expect(body.booking_date).toBe(targetIso)
    expect(body.booking_date).not.toContain('T')
  })
})

describe('note field placement', () => {
  it('asks for the optional note on the service step, not the contact step', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    const note = await screen.findByLabelText('รายละเอียดเพิ่มเติม (ถ้ามี)')
    await user.type(note, 'ขอเจ้าหน้าที่ผู้หญิง')
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await user.click(await screen.findByRole('button', { name: /09:30/ }))
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))

    await screen.findByRole('combobox', { name: 'คำนำหน้า' })
    expect(screen.queryByText('รายละเอียดเพิ่มเติม (ถ้ามี)')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'คำนำหน้า' }), 'นาย')
    await user.type(screen.getByPlaceholderText('ชื่อจริง'), 'สมชาย')
    await user.type(screen.getByPlaceholderText('นามสกุล'), 'ใจดี')
    await user.type(screen.getByPlaceholderText('0812345678'), '0812345678')
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    expect(await screen.findByText('ขอเจ้าหน้าที่ผู้หญิง')).toBeInTheDocument()
  })
})

describe('cancel the whole form (ยกเลิกรายการ)', () => {
  it('is offered on every wizard step, below back/next', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    expect(await screen.findByRole('button', { name: 'ยกเลิกรายการ' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    expect(await screen.findByRole('button', { name: 'ยกเลิกรายการ' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /09:30/ }))
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    expect(await screen.findByRole('button', { name: 'ยกเลิกรายการ' })).toBeInTheDocument()
  })

  it('asks for confirmation, drops the draft and closes the LIFF window', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await user.click(await screen.findByRole('button', { name: /09:30/ }))
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'คำนำหน้า' }), 'นาย')
    await user.type(screen.getByPlaceholderText('ชื่อจริง'), 'สมชาย')
    await user.type(screen.getByPlaceholderText('นามสกุล'), 'ใจดี')
    await user.type(screen.getByPlaceholderText('0812345678'), '0812345678')
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await screen.findByRole('heading', { name: 'ตรวจสอบและยืนยันการจอง' })

    await user.click(screen.getByRole('button', { name: 'ยกเลิกรายการ' }))
    expect(window.liff?.closeWindow).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'ยืนยัน' }))

    expect(window.liff?.closeWindow).toHaveBeenCalled()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('keeps the form when the citizen chooses to go back', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await user.click(await screen.findByRole('button', { name: 'ยกเลิกรายการ' }))
    await user.click(await screen.findByRole('button', { name: 'ไม่ใช่' }))
    expect(window.liff?.closeWindow).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'ถัดไป' })).toBeInTheDocument()
  })

  it('titles the leave dialog for the LINE client', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await user.click(await screen.findByRole('button', { name: 'ยกเลิกรายการ' }))
    expect(await screen.findByText('ปิดแบบฟอร์มนี้?')).toBeInTheDocument()
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
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'คำนำหน้า' }), 'นาย')
    const nameInput = screen.getByPlaceholderText('ชื่อจริง')
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

describe('service dropdown', () => {
  it('groups the unknown backend string under the Others optgroup', async () => {
    renderPage()
    const select = await screen.findByRole('combobox', { name: 'เลือกบริการ' })

    const option = within(select).getByRole('option', { name: 'ปรึกษากฎหมาย' })
    expect(option.parentElement?.tagName).toBe('OPTGROUP')
    expect(option.parentElement?.getAttribute('label')).toBe('อื่นๆ')
  })
})

describe('section clear', () => {
  it('clears the date section and toasts the service-request wording', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await goNext()
    await screen.findByText('ช่วงเช้า')

    const card = screen
      .getByRole('heading', { name: 'เลือกวันที่' })
      .closest('.backdrop-blur-xl') as HTMLElement
    await user.click(within(card).getByRole('button', { name: 'ล้างค่า' }))

    expect(await screen.findByText('ล้างข้อมูลแท็บนี้แล้ว')).toBeInTheDocument()
    expect(screen.queryByText('ช่วงเช้า')).not.toBeInTheDocument()
    expect((await dateStrip()).querySelector('button[aria-pressed="true"]')).toBeNull()
  })
})

describe('draft restore', () => {
  it('resumes a restored draft at the contact step without another tap', async () => {
    const target = isoFromToday(1)
    window.sessionStorage.setItem(
      'liff-booking-draft',
      JSON.stringify({
        version: 3,
        draft: {
          service: 'ปรึกษากฎหมาย',
          date: target,
          slotId: '09:30:00',
          prefix: '',
          firstname: '',
          lastname: '',
          phoneNumber: '',
          note: '',
          email: '',
          savedAt: Date.now(),
        },
      }),
    )
    renderPage()

    expect(await screen.findByPlaceholderText('ชื่อจริง')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'เลือกบริการ' })).not.toBeInTheDocument()

    await goBack()
    const pressed = (await dateStrip()).querySelector('button[aria-pressed="true"]')
    expect(pressed?.textContent).toContain(String(parseISODate(target).getDate()))
  })
})

describe('wizard navigation', () => {
  it('walks service → datetime → contact → summary and back again', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseService()

    expect(screen.getByRole('heading', { name: 'เลือกบริการ' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'เลือกวันที่' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'กลับ' })).not.toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByRole('heading', { name: 'เลือกวันที่' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'เลือกช่วงเวลา' })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: /09:30/ }))
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByRole('heading', { name: 'ข้อมูลผู้จอง' })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByRole('heading', { name: 'ตรวจสอบและยืนยันการจอง' })).toBeInTheDocument()
    expect(screen.getByText('ปรึกษากฎหมาย')).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'กลับ' }))
    expect(screen.getByRole('heading', { name: 'ข้อมูลผู้จอง' })).toBeInTheDocument()
  })

  it('asks for day and time when Next is tapped with no slot', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))

    await screen.findByText('ช่วงเช้า')
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByText('กรุณาเลือกวันและเวลา')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'เลือกวันที่' })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: /09:30/ }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByRole('heading', { name: 'ข้อมูลผู้จอง' })).toBeInTheDocument()
  })

  it('asks for a service when Next is tapped with none picked', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await user.click(screen.getByRole('button', { name: 'ล้างค่า' }))
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByText('กรุณาเลือกบริการ')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'เลือกบริการ' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'เลือกวันที่' })).not.toBeInTheDocument()
  })

  it('sends the citizen back to datetime when the slot fills during submit', async () => {
    stubFetch({ submitStatus: 409 })
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await user.click(await screen.findByRole('button', { name: /09:30/ }))
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await user.click(screen.getByRole('button', { name: 'ยืนยันการจอง' }))

    expect(await screen.findByRole('heading', { name: 'เลือกวันที่' })).toBeInTheDocument()
  })

  it('jumps back to the right step from each summary edit link', async () => {
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await user.click(await screen.findByRole('button', { name: /09:30/ }))
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByRole('heading', { name: 'ตรวจสอบและยืนยันการจอง' })).toBeInTheDocument()

    const edits = screen.getAllByRole('button', { name: 'แก้ไข' })
    expect(edits).toHaveLength(3)

    await user.click(edits[0])
    expect(screen.getByRole('heading', { name: 'เลือกบริการ' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'เลือกบริการ' })).toHaveValue('ปรึกษากฎหมาย')

    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByRole('heading', { name: 'ตรวจสอบและยืนยันการจอง' })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'แก้ไข' })[1])
    expect(screen.getByRole('heading', { name: 'เลือกวันที่' })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await user.click(screen.getAllByRole('button', { name: 'แก้ไข' })[2])
    expect(screen.getByRole('heading', { name: 'ข้อมูลผู้จอง' })).toBeInTheDocument()
  })
})

describe('contact validation', () => {
  async function walkToContact() {
    const user = userEvent.setup()
    renderPage()
    await chooseService()
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    await user.click(await screen.findByRole('button', { name: /09:30/ }))
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByRole('heading', { name: 'ข้อมูลผู้จอง' })).toBeInTheDocument()
    return user
  }

  it('stops Next and shows the shared wording for an undiallable phone', async () => {
    const user = await walkToContact()
    await user.type(screen.getByPlaceholderText('0812345678'), '123')
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByText('หมายเลขโทรศัพท์ไม่ถูกต้อง')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ข้อมูลผู้จอง' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'ตรวจสอบและยืนยันการจอง' })).not.toBeInTheDocument()
  })

  it('lets an empty phone through — contact stays optional', async () => {
    await walkToContact()
    await userEvent.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByRole('heading', { name: 'ตรวจสอบและยืนยันการจอง' })).toBeInTheDocument()
  })

  it('lets a diallable phone through to the summary', async () => {
    const user = await walkToContact()
    await user.type(screen.getByPlaceholderText('0812345678'), '0812345678')
    await user.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByRole('heading', { name: 'ตรวจสอบและยืนยันการจอง' })).toBeInTheDocument()
  })

  it('stops Next and shows the shared wording for a malformed email', async () => {
    const user = await walkToContact()
    await user.type(screen.getByPlaceholderText('name@example.com'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByText('อีเมลไม่ถูกต้อง')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ข้อมูลผู้จอง' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'ตรวจสอบและยืนยันการจอง' })).not.toBeInTheDocument()
  })

  it('lets an empty email through — email stays optional', async () => {
    await walkToContact()
    await userEvent.click(await screen.findByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByRole('heading', { name: 'ตรวจสอบและยืนยันการจอง' })).toBeInTheDocument()
  })

  it('carries a valid email to the summary', async () => {
    const user = await walkToContact()
    await user.type(screen.getByPlaceholderText('name@example.com'), 'citizen@example.com')
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByRole('heading', { name: 'ตรวจสอบและยืนยันการจอง' })).toBeInTheDocument()
    expect(screen.getByText('อีเมล')).toBeInTheDocument()
    expect(screen.getByText('citizen@example.com')).toBeInTheDocument()
  })

  it('strips a stored email when the channel is off — no unfixable 422', async () => {
    stubFetch({})
    window.sessionStorage.setItem(
      'liff-booking-draft',
      JSON.stringify({
        version: 3,
        draft: {
          service: 'ปรึกษากฎหมาย',
          date: isoFromToday(1),
          slotId: '09:30:00',
          prefix: 'นาย',
          firstname: 'สมชาย',
          lastname: 'ใจดี',
          phoneNumber: '0812345678',
          note: '',
          email: 'stale@example.com',
          savedAt: Date.now(),
        },
      }),
    )
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'ข้อมูลผู้จอง' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('name@example.com')).not.toBeInTheDocument()
    const nextName = 'ถัดไป'
    await waitFor(() =>
      expect(screen.getByRole('button', { name: nextName })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: nextName }))
    expect(screen.getByRole('heading', { name: 'ตรวจสอบและยืนยันการจอง' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ยืนยันการจอง' }))
    await screen.findByText('จองคิวสำเร็จ')
    const post = fetchMock.mock.calls.find(
      ([url, init]) => init?.method === 'POST' && !String(url).endsWith('/cancel'),
    )
    expect(JSON.parse(String(post?.[1]?.body)).email).toBe('')
  })

  it('asks for the missing trio parts before leaving the contact step', async () => {
    const user = await walkToContact()
    await user.type(screen.getByPlaceholderText('ชื่อจริง'), 'สมชาย')
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(screen.getByText('กรุณาเลือกคำนำหน้า')).toBeInTheDocument()
    expect(screen.getByText('กรุณาระบุนามสกุล')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ข้อมูลผู้จอง' })).toBeInTheDocument()
  })

  it('asks for a prefix when the stored name has none', async () => {
    const user = await bookToDone()

    await user.click(screen.getByRole('button', { name: 'แก้ไขข้อมูล' }))
    await user.click(screen.getByRole('button', { name: 'บันทึกการแก้ไข' }))
    expect(screen.getAllByText('กรุณาเลือกคำนำหน้า').length).toBeGreaterThanOrEqual(1)
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH'),
    ).toHaveLength(0)
  })

  it('blocks the edit-save with the same wording and no PATCH', async () => {
    const user = await bookToDone()
    await user.click(screen.getByRole('button', { name: 'แก้ไขข้อมูล' }))
    const phoneInput = screen.getByPlaceholderText('0812345678')
    await user.clear(phoneInput)
    await user.type(phoneInput, '123')
    await user.click(screen.getByRole('button', { name: 'บันทึกการแก้ไข' }))
    expect(screen.getAllByText('หมายเลขโทรศัพท์ไม่ถูกต้อง').length).toBeGreaterThanOrEqual(1)
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH'),
    ).toHaveLength(0)
  })
})
