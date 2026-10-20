// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import BookingMonthCalendar, { buildMonthCells } from '../BookingMonthCalendar'
import type { DayAvailability } from '@/lib/booking'

function range(entries: [string, DayAvailability][]): Map<string, DayAvailability> {
  return new Map(entries)
}

const baseProps = {
  selectedDate: '',
  rangeByDate: range([]),
  loadingRange: false,
  rangeServiceLabel: null as string | null,
  onSelectDay: () => {},
  onVisibleMonthChange: () => {},
}

describe('buildMonthCells', () => {
  it('pads Monday-first and covers every day of the month', () => {
    const cells = buildMonthCells(2026, 9)
    expect(cells.slice(0, 3)).toEqual([null, null, null])
    expect(cells[3]).toBe('2026-10-01')
    expect(cells[cells.length - 1]).toBe('2026-10-31')
    expect(cells.filter(Boolean)).toHaveLength(31)
  })

  it('starts a Monday month with no pads', () => {
    const cells = buildMonthCells(2026, 5)
    expect(cells[0]).toBe('2026-06-01')
    expect(cells.filter(Boolean)).toHaveLength(30)
  })
})

describe('BookingMonthCalendar', () => {
  it('renders the Thai month header with the Buddhist year', () => {
    render(<BookingMonthCalendar {...baseProps} initialMonth="2026-10-15" />)
    expect(screen.getByText(/ตุลาคม/)).toBeInTheDocument()
    expect(screen.getByText('2569')).toBeInTheDocument()
  })

  it('paints open, full, and closed days differently', () => {
    const days = range([
      ['2026-10-05', { date: '2026-10-05', is_open: true, remaining: 4 }],
      ['2026-10-06', { date: '2026-10-06', is_open: true, remaining: 0 }],
      ['2026-10-07', { date: '2026-10-07', is_open: false, remaining: 0 }],
    ])
    render(
      <BookingMonthCalendar
        {...baseProps}
        initialMonth="2026-10-15"
        rangeByDate={days}
        rangeServiceLabel="ปรึกษากฎหมาย"
      />,
    )
    expect(screen.getByRole('button', { name: '5 ตุลาคม 2569 (ว่าง)' })).toBeInTheDocument()
    expect(screen.getByText('ว่าง 4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '6 ตุลาคม 2569 (เต็ม)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7 ตุลาคม 2569 (ปิด)' })).toBeInTheDocument()
  })

  it('clicking a day reports its ISO date', async () => {
    const user = userEvent.setup()
    const onSelectDay = vi.fn()
    render(
      <BookingMonthCalendar {...baseProps} initialMonth="2026-10-15" onSelectDay={onSelectDay} />,
    )
    await user.click(screen.getByRole('button', { name: '12 ตุลาคม 2569' }))
    expect(onSelectDay).toHaveBeenCalledWith('2026-10-12')
  })

  it('month navigation notifies the parent of the visible month', async () => {
    const user = userEvent.setup()
    const onVisibleMonthChange = vi.fn()
    render(
      <BookingMonthCalendar
        {...baseProps}
        initialMonth="2026-10-15"
        onVisibleMonthChange={onVisibleMonthChange}
      />,
    )
    expect(onVisibleMonthChange).toHaveBeenCalledWith(2026, 9)
    await user.click(screen.getByRole('button', { name: 'เดือนถัดไป' }))
    expect(onVisibleMonthChange).toHaveBeenLastCalledWith(2026, 10)
    expect(screen.getByText(/พฤศจิกายน/)).toBeInTheDocument()
  })

  it('shows a legend and a no-service hint when no fullness data applies', () => {
    render(<BookingMonthCalendar {...baseProps} initialMonth="2026-10-15" />)
    const legend = screen.getByRole('list', { name: 'คำอธิบายสี' })
    expect(within(legend).getByText('ว่าง')).toBeInTheDocument()
    expect(within(legend).getByText('เต็ม')).toBeInTheDocument()
    expect(within(legend).getByText('ปิด')).toBeInTheDocument()
    expect(screen.getByText('เลือกบริการเพื่อดูความเต็มของแต่ละวัน')).toBeInTheDocument()
  })
})
