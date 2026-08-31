import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionExpiredError, isSessionExpired } from '../session-expired'
import {
  formatLiffSubmitError,
  isValidPhone,
  normalizePhone,
  submitDebtMediation,
} from '../submit-debt-mediation'

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const payload = {
  submitter_type: 'DEBTOR' as const,
  full_name: 'สมชาย ใจดี',
  phone_number: '0812345678',
  province: 'สกลนคร',
  sub_district: null,
  debt_amount: '20000',
  debt_type: 'INFORMAL' as const,
  counterparty_name: 'นายทุน',
  interest_rate: 'ร้อยละ 5',
  issue_category: 'รายได้ไม่เพียงพอจะชำระหนี้',
  issue_other: null,
  line_user_id: 'U1',
}

describe('submitDebtMediation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('POSTs JSON to /api/v1/liff/debt-mediation with the id token header', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 1 }))

    await submitDebtMediation(payload, 'tok-123')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/liff/debt-mediation')
    expect(init?.method).toBe('POST')
    const headers = new Headers(init?.headers as HeadersInit)
    expect(headers.get('x-liff-id-token')).toBe('tok-123')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('omits the id token header when the token is null', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 1 }))

    await submitDebtMediation(payload, null)

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers as HeadersInit)
    expect(headers.get('x-liff-id-token')).toBeNull()
  })

  it('rejects with SessionExpiredError on 401', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(401))

    const err = await submitDebtMediation(payload, 'tok').then(
      () => null,
      (e: unknown) => e
    )
    expect(err).toBeInstanceOf(SessionExpiredError)
    expect(isSessionExpired(err)).toBe(true)
  })
})

describe('phone helpers', () => {
  it('strips dashes and spaces', () => {
    expect(normalizePhone('081-234-5678')).toBe('0812345678')
    expect(normalizePhone(' 081 234 5678 ')).toBe('0812345678')
  })

  it('accepts 9–15 digits with optional plus', () => {
    expect(isValidPhone('0812345678')).toBe(true)
    expect(isValidPhone('+66812345678')).toBe(true)
    expect(isValidPhone('081-234-5678')).toBe(true)
  })

  it('rejects letters and too-short values', () => {
    expect(isValidPhone('abcdefghij')).toBe(false)
    expect(isValidPhone('09123456')).toBe(false)
  })
})

describe('formatLiffSubmitError', () => {
  it('surfaces a string detail', () => {
    expect(formatLiffSubmitError({ detail: 'ข้อมูลไม่ถูกต้อง' })).toBe('ข้อมูลไม่ถูกต้อง')
  })

  it('does not dump FastAPI 422 arrays as JSON', () => {
    expect(
      formatLiffSubmitError({
        detail: [{ loc: ['body', 'phone_number'], msg: 'Value error', type: 'value_error' }],
      })
    ).toBe('ไม่สามารถส่งคำขอได้ กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง')
  })
})
