import { describe, expect, test } from 'vitest'
import {
  BOOKING_STATUS_LABELS,
  buildDateOptions,
  clipRangeWindow,
  describeReminder,
  formatThaiDate,
  formatThaiWeekday,
  formatTime,
  groupSlotsByPeriod,
  parseISODate,
  toISODate,
  type Slot,
} from '@/lib/booking'

function slot(time: string, overrides: Partial<Slot> = {}): Slot {
  return { time, capacity: 3, booked: 0, remaining: 3, is_full: false, ...overrides }
}

describe('date parsing', () => {
  test('parses an ISO date as local time, not UTC', () => {
    // `new Date('2026-08-19')` is UTC midnight, which renders as the 18th in
    // any timezone behind UTC — Bangkok is ahead, but the bug is real elsewhere.
    const parsed = parseISODate('2026-08-19')
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(7)
    expect(parsed.getDate()).toBe(19)
  })

  test('round-trips through toISODate', () => {
    expect(toISODate(parseISODate('2026-08-19'))).toBe('2026-08-19')
  })

  test('pads single-digit months and days', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('formatThaiDate', () => {
  test('renders the Buddhist era', () => {
    expect(formatThaiDate('2026-08-19')).toBe('19 ส.ค. 2569')
  })

  test('handles the first and last month', () => {
    expect(formatThaiDate('2026-01-01')).toBe('1 ม.ค. 2569')
    expect(formatThaiDate('2026-12-31')).toBe('31 ธ.ค. 2569')
  })

  test('returns a dash for an empty value rather than "NaN"', () => {
    expect(formatThaiDate('')).toBe('-')
  })

  test('gives the Thai weekday abbreviation', () => {
    expect(formatThaiWeekday('2026-08-19')).toBe('พ.') // a Wednesday
  })
})

describe('formatTime', () => {
  test('trims seconds off the API value', () => {
    expect(formatTime('09:30:00')).toBe('09:30')
  })

  test('leaves an already-trimmed value alone', () => {
    expect(formatTime('09:30')).toBe('09:30')
  })

  test('returns a dash when missing', () => {
    expect(formatTime('')).toBe('-')
  })
})

describe('buildDateOptions', () => {
  const today = new Date(2026, 7, 12) // 12 Aug 2026

  test('includes today and spans the full advance window', () => {
    const options = buildDateOptions(today, 3)
    expect(options).toEqual(['2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15'])
  })

  test('removes blackout dates', () => {
    const options = buildDateOptions(today, 3, ['2026-08-13', '2026-08-15'])
    expect(options).toEqual(['2026-08-12', '2026-08-14'])
  })

  test('crosses a month boundary correctly', () => {
    const options = buildDateOptions(new Date(2026, 7, 30), 2)
    expect(options).toEqual(['2026-08-30', '2026-08-31', '2026-09-01'])
  })

  test('an advance window of zero still offers today', () => {
    expect(buildDateOptions(today, 0)).toEqual(['2026-08-12'])
  })
})

describe('groupSlotsByPeriod', () => {
  test('splits at noon, with 12:00 counting as afternoon', () => {
    const { morning, afternoon } = groupSlotsByPeriod([
      slot('08:00:00'),
      slot('11:30:00'),
      slot('12:00:00'),
      slot('15:00:00'),
    ])
    expect(morning.map((s) => s.time)).toEqual(['08:00:00', '11:30:00'])
    expect(afternoon.map((s) => s.time)).toEqual(['12:00:00', '15:00:00'])
  })

  test('handles an empty list', () => {
    expect(groupSlotsByPeriod([])).toEqual({ morning: [], afternoon: [] })
  })
})

describe('describeReminder', () => {
  test('describes a day-based lead time', () => {
    expect(
      describeReminder({ reminder_enabled: true, reminder_lead_value: 1, reminder_lead_unit: 'DAY' }),
    ).toBe('แจ้งเตือนล่วงหน้า 1 วัน ก่อนถึงเวลานัด')
  })

  test('describes an hour-based lead time', () => {
    expect(
      describeReminder({ reminder_enabled: true, reminder_lead_value: 3, reminder_lead_unit: 'HOUR' }),
    ).toBe('แจ้งเตือนล่วงหน้า 3 ชั่วโมง ก่อนถึงเวลานัด')
  })

  test('says so plainly when reminders are off', () => {
    expect(
      describeReminder({ reminder_enabled: false, reminder_lead_value: 1, reminder_lead_unit: 'DAY' }),
    ).toBe('ปิดการแจ้งเตือนล่วงหน้า')
  })
})

describe('status labels', () => {
  test('every status has a Thai label', () => {
    expect(Object.keys(BOOKING_STATUS_LABELS).sort()).toEqual(
      ['CANCELLED', 'COMPLETED', 'CONFIRMED', 'NOSHOW'],
    )
    for (const label of Object.values(BOOKING_STATUS_LABELS)) {
      expect(label.length).toBeGreaterThan(0)
    }
  })
})

describe('clipRangeWindow', () => {
  test('keeps a window whose calendar span fits the backend cap', () => {
    // 63 entries spanning exactly 62 calendar days — nothing to clip.
    const options = buildDateOptions(new Date(2026, 7, 1), 62)
    expect(clipRangeWindow(options)).toEqual(options)
  })

  test('clips by calendar span, not entry count, when blackouts thin the window', () => {
    const blackouts = [
      '2026-08-05', '2026-08-08', '2026-08-11', '2026-08-14', '2026-08-17',
      '2026-08-20', '2026-08-23', '2026-08-26', '2026-08-29', '2026-09-01',
    ]
    const options = buildDateOptions(new Date(2026, 7, 1), 99, blackouts)
    const clipped = clipRangeWindow(options)

    // 62 calendar days out from 2026-08-01 is 2026-10-02, and it is not a
    // blackout, so it is the last day kept.
    expect(clipped[clipped.length - 1]).toBe('2026-10-02')
    // 63 calendar days in the kept span minus the 10 blackouts inside it.
    // The count-based clip this replaces kept 63 entries, ending 2026-10-12 —
    // a 72-day span the backend rejects with 422.
    expect(clipped).toHaveLength(53)
    expect(clipped.length).toBeLessThan(options.length)
  })

  test('returns an empty window unchanged', () => {
    expect(clipRangeWindow([])).toEqual([])
  })

  test('keeps a single day', () => {
    expect(clipRangeWindow(['2026-08-01'])).toEqual(['2026-08-01'])
  })

  test('clips by the cap the backend advertises, not the local fallback', () => {
    // 31 entries (no blackouts); the backend says the cap is 10, so the clip
    // must follow that value rather than the local 62.
    const options = buildDateOptions(new Date(2026, 7, 1), 30)
    expect(clipRangeWindow(options, 10)).toHaveLength(11) // offsets 0..10
  })

  test('falls back to the local cap when the advertised one is missing or invalid', () => {
    const options = buildDateOptions(new Date(2026, 7, 1), 99)
    // 2026-08-01 through 2026-10-02 — exactly 63 entries under the local cap.
    expect(clipRangeWindow(options, undefined)).toHaveLength(63)
    expect(clipRangeWindow(options, 0)).toHaveLength(63)
    expect(clipRangeWindow(options, Number.NaN)).toHaveLength(63)
  })
})
