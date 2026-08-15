// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BusinessHoursSettingsPage from '../page'
import type { BusinessHoursDay } from '@/lib/business-hours'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function defaultWeek(): BusinessHoursDay[] {
  return Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    is_open: i < 5,
    open_time: '08:00',
    close_time: '17:00',
  }))
}

let fetchMock: ReturnType<typeof vi.fn>

function mockFetch(initial: BusinessHoursDay[]) {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return jsonResponse(JSON.parse(String(init.body)))
    }
    return jsonResponse({ days: initial })
  })
  vi.stubGlobal('fetch', fetchMock)
}

/** The saved payload from the last PUT. */
function savedPayload(): { days: BusinessHoursDay[] } {
  const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
  if (!put) throw new Error('no PUT request was made')
  return JSON.parse(String((put[1] as RequestInit).body))
}

async function renderLoaded(initial = defaultWeek()) {
  mockFetch(initial)
  render(<BusinessHoursSettingsPage />)
  await waitFor(() => expect(screen.getByText('เวลาทำการ')).toBeInTheDocument())
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('loading', () => {
  it('renders all seven weekdays', async () => {
    await renderLoaded()
    for (const name of [
      'วันจันทร์',
      'วันอังคาร',
      'วันพุธ',
      'วันพฤหัสบดี',
      'วันศุกร์',
      'วันเสาร์',
      'วันอาทิตย์',
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it('shows the stored times', async () => {
    await renderLoaded()
    expect(screen.getByLabelText('เวลาเปิดวันจันทร์')).toHaveValue('08:00')
    expect(screen.getByLabelText('เวลาปิดวันจันทร์')).toHaveValue('17:00')
  })

  it('marks closed days', async () => {
    await renderLoaded()
    expect(screen.getByLabelText('เปิดวันเสาร์')).not.toBeChecked()
    expect(screen.getAllByText('ปิดทำการ').length).toBe(2)
  })
})

describe('the 24-hour toggle', () => {
  it('sends 00:00-24:00 in the payload', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.click(screen.getByLabelText('เปิด 24 ชั่วโมงวันเสาร์'))
    await user.click(screen.getByRole('button', { name: /บันทึกเวลาทำการ/ }))

    await waitFor(() => {
      const saturday = savedPayload().days.find((d) => d.day_of_week === 5)
      expect(saturday).toMatchObject({
        is_open: true,
        open_time: '00:00',
        close_time: '24:00',
      })
    })
  })

  it('reverts a full day back to default times', async () => {
    const user = userEvent.setup()
    const week = defaultWeek()
    week[5] = { day_of_week: 5, is_open: true, open_time: '00:00', close_time: '24:00' }
    await renderLoaded(week)

    await user.click(screen.getByLabelText('เปิด 24 ชั่วโมงวันเสาร์'))
    await user.click(screen.getByRole('button', { name: /บันทึกเวลาทำการ/ }))

    await waitFor(() => {
      const saturday = savedPayload().days.find((d) => d.day_of_week === 5)
      expect(saturday).toMatchObject({ open_time: '08:00', close_time: '17:00' })
    })
  })
})

describe('open/close toggle', () => {
  it('persists a closed day', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.click(screen.getByLabelText('เปิดวันจันทร์'))
    await user.click(screen.getByRole('button', { name: /บันทึกเวลาทำการ/ }))

    await waitFor(() => {
      const monday = savedPayload().days.find((d) => d.day_of_week === 0)
      expect(monday?.is_open).toBe(false)
    })
  })

  it('saves all seven days', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.click(screen.getByRole('button', { name: /บันทึกเวลาทำการ/ }))

    await waitFor(() => expect(savedPayload().days).toHaveLength(7))
  })
})

describe('validation and failure handling', () => {
  it('blocks saving when an open day has open >= close', async () => {
    const user = userEvent.setup()
    const week = defaultWeek()
    week[0] = { day_of_week: 0, is_open: true, open_time: '17:00', close_time: '08:00' }
    await renderLoaded(week)

    await user.click(screen.getByRole('button', { name: /บันทึกเวลาทำการ/ }))

    await waitFor(() =>
      expect(screen.getByText('เวลาเปิดของวันจันทร์ต้องมาก่อนเวลาปิด')).toBeInTheDocument(),
    )
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('surfaces a save error instead of pretending it worked', async () => {
    const user = userEvent.setup()
    mockFetch(defaultWeek())
    render(<BusinessHoursSettingsPage />)
    await waitFor(() => expect(screen.getByText('เวลาทำการ')).toBeInTheDocument())

    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ detail: 'บันทึกเวลาทำการไม่สำเร็จ' }, 400),
    )
    await user.click(screen.getByRole('button', { name: /บันทึกเวลาทำการ/ }))

    await waitFor(() =>
      expect(screen.getByText('บันทึกเวลาทำการไม่สำเร็จ')).toBeInTheDocument(),
    )
    expect(screen.queryByText('บันทึกเวลาทำการเรียบร้อยแล้ว')).not.toBeInTheDocument()
  })

  it('shows an alert when loading fails', async () => {
    fetchMock = vi.fn(async () => jsonResponse({ detail: 'เซิร์ฟเวอร์ผิดพลาด' }, 500))
    vi.stubGlobal('fetch', fetchMock)
    render(<BusinessHoursSettingsPage />)

    await waitFor(() => expect(screen.getByText('เซิร์ฟเวอร์ผิดพลาด')).toBeInTheDocument())
  })
})
