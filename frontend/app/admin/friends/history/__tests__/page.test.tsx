// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import FriendHistoryPage from '../page'
import { isoToYMD } from '@/lib/utils'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'ADMIN' } }),
}))

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

function friendEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    line_user_id: 'U123',
    event_type: 'FOLLOW',
    source: 'line',
    refollow_count: 0,
    event_data: null,
    created_at: '2026-09-02T10:00:00+07:00',
    display_name: 'สมชาย',
    picture_url: null,
    ...overrides,
  }
}

let fetchMock: ReturnType<typeof vi.fn>

function mockFetch(events: unknown[] = [friendEvent()]) {
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/admin/friends/stats')) {
      return jsonResponse({
        total_followers: 1,
        total_blocked: 0,
        total_unfollowed: 0,
        total_refollows: 0,
        refollow_rate: 0,
        refollow_breakdown: [],
      })
    }
    return jsonResponse({ events, total: events.length, total_pages: 1 })
  })
  vi.stubGlobal('fetch', fetchMock)
}

async function renderLoaded(events: unknown[] = [friendEvent()]) {
  mockFetch(events)
  render(<FriendHistoryPage />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('friend history date filtering', () => {
  it('renders the shared preset buttons and custom range inputs', async () => {
    await renderLoaded()
    for (const label of ['7 วัน', '30 วัน', '90 วัน', 'ปีนี้']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByLabelText('จากวันที่')).toBeInTheDocument()
    expect(screen.getByLabelText('ถึงวันที่')).toBeInTheDocument()
  })

  it('requests the selected range when custom dates are chosen', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.type(screen.getByLabelText('จากวันที่'), '2026-09-01')
    await user.type(screen.getByLabelText('ถึงวันที่'), '2026-09-03')

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url]) => String(url).includes('/admin/friends/history')
          && String(url).includes('start_date=2026-09-01')
          && String(url).includes('end_date=2026-09-03'),
      )
      expect(call).toBeTruthy()
    })
  })

  it('shows a Thai error and never fetches the reversed pair', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.type(screen.getByLabelText('จากวันที่'), '2026-09-05')
    await user.type(screen.getByLabelText('ถึงวันที่'), '2026-09-01')

    expect(await screen.findByText('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด')).toBeInTheDocument()
    const reversedCall = fetchMock.mock.calls.find(
      ([url]) => String(url).includes('/admin/friends/history')
        && String(url).includes('start_date=2026-09-05')
        && String(url).includes('end_date=2026-09-01'),
    )
    expect(reversedCall).toBeUndefined()
  })

  it('clears date filter and refetches from the shared clear button', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await user.type(screen.getByLabelText('จากวันที่'), '2026-09-01')
    await user.type(screen.getByLabelText('ถึงวันที่'), '2026-09-03')
    const clearButton = await screen.findByRole('button', { name: 'ล้างตัวกรอง' })
    await user.click(clearButton)

    await waitFor(() => {
      const historyCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('/admin/friends/history'),
      )
      const lastCall = historyCalls[historyCalls.length - 1]
      expect(String(lastCall[0])).not.toContain('start_date=')
    })
  })
})
