import { SessionExpiredError } from './session-expired'

const DEBT_MEDIATION_ENDPOINT = '/api/v1/liff/debt-mediation'

/** Optional +, then 9–15 digits — matches backend `_PHONE_PATTERN`. */
const PHONE_DIGITS = /^\+?\d{9,15}$/

const GENERIC_SUBMIT_ERROR = 'ไม่สามารถส่งคำขอได้ กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง'

export function normalizePhone(raw: string): string {
  return raw.trim().replace(/[-\s]/g, '')
}

export function isValidPhone(raw: string): boolean {
  return PHONE_DIGITS.test(normalizePhone(raw))
}

/** Surface a string `detail`; never dump FastAPI 422 arrays as JSON. */
export function formatLiffSubmitError(body: unknown): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string' && detail.trim()) {
      return detail
    }
  }
  return GENERIC_SUBMIT_ERROR
}

/** Mirrors the backend `DebtMediationCreate` schema. */
export interface DebtMediationPayload {
  submitter_type: 'DEBTOR' | 'CREDITOR'
  full_name: string
  phone_number: string
  province: string
  sub_district: string | null
  debt_amount: string
  debt_type: 'INFORMAL' | 'FORMAL'
  counterparty_name: string
  interest_rate: string | null
  issue_category: string
  issue_other: string | null
  line_user_id: string | null
}

/**
 * Posts a debt-mediation registration (ขอแก้หนี้) to the LIFF endpoint with
 * the LIFF ID token attached when present. Throws SessionExpiredError on 401;
 * otherwise returns the raw Response — same contract as submit-service-request.
 */
export async function submitDebtMediation(
  payload: DebtMediationPayload,
  idToken: string | null
): Promise<Response> {
  const res = await fetch(DEBT_MEDIATION_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { 'x-liff-id-token': idToken } : {})
    },
    body: JSON.stringify(payload)
  })

  if (res.status === 401) {
    throw new SessionExpiredError()
  }

  return res
}