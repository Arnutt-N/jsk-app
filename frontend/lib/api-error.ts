/**
 * Shared API error utilities.
 *
 * Centralises error-message extraction, HTTP-status mapping, and
 * network-error detection so every admin page handles errors consistently.
 *
 * @see Phase 1 of the undo-redo-help-errors plan.
 */

import logger from './logger'
import { API_BASE } from './constants/api'

// ── Error message extraction ─────────────────────────────────────────

/**
 * Extract a human-readable error message from a failed `Response`.
 *
 * Tries, in order:
 *   1. JSON body fields: `detail`, `message`, `error`
 *   2. Raw response body text
 *   3. The provided `fallbackMessage`
 *
 * Clones the response internally so callers can still read the body
 * afterwards if needed.
 */
export async function readErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      const payload = await response.clone().json()
      if (typeof payload?.detail === 'string' && payload.detail.trim()) return payload.detail
      if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message
      if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error
    } catch {
      // Fall through to text parsing and the default fallback.
    }
  }

  try {
    const text = (await response.text()).trim()
    if (text) return text
  } catch {
    // Ignore body parsing errors and use the fallback message.
  }

  return fallbackMessage
}

// ── HTTP status → Thai user message ──────────────────────────────────

const STATUS_MESSAGES: Record<number, string> = {
  400: 'คำขอไม่ถูกต้อง กรุณาตรวจสอบข้อมูลแล้วลองใหม่',
  401: 'กรุณาเข้าสู่ระบบใหม่',
  403: 'ไม่มีสิทธิ์ดำเนินการนี้',
  404: 'ไม่พบข้อมูลที่ต้องการ',
  408: 'คำขอใช้เวลานานเกินไป กรุณาลองใหม่',
  409: 'ข้อมูลขัดแย้งกับสถานะปัจจุบัน',
  413: 'ไฟล์มีขนาดใหญ่เกินไป',
  422: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่',
  429: 'กรุณารอสักครู่แล้วลองใหม่',
  500: 'เซิร์ฟเวอร์มีปัญหา กรุณาลองใหม่ภายหลัง',
  502: 'เซิร์ฟเวอร์ไม่ตอบสนอง กรุณาลองใหม่ภายหลัง',
  503: 'ระบบกำลังบำรุงรักษา กรุณาลองใหม่ภายหลัง',
}

/**
 * Return a Thai user-facing message for an HTTP status code.
 *
 * Falls back to a generic message for unmapped codes.
 */
export function getHttpStatusMessage(status: number): string {
  return (
    STATUS_MESSAGES[status] ??
    `เกิดข้อผิดพลาด (${status}) กรุณาลองใหม่`
  )
}

// ── Network error detection ──────────────────────────────────────────

/**
 * Check whether an error is a browser network failure
 * (TypeError "Failed to fetch" / "Load failed").
 */
export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    (error.message === 'Failed to fetch' || error.message === 'Load failed')
  )
}

// ── Combined fetch helper ────────────────────────────────────────────

type ApiFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string }

/**
 * Fetch wrapper that handles errors uniformly.
 *
 * Returns a discriminated union so callers can pattern-match:
 *
 *   const result = await apiFetch<UsersResponse>('/api/v1/admin/users')
 *   if (result.ok) {
 *     setUsers(result.data)
 *   } else {
 *     toast({ title: result.message, variant: 'error' })
 *   }
 */
export interface ApiFetchOptions extends RequestInit {
  /** Skip JSON parsing and return the raw Response (for blob downloads). */
  raw?: boolean
}

export async function apiFetch<T = unknown>(
  url: string,
  init?: ApiFetchOptions,
): Promise<ApiFetchResult<T>> {
  const fullUrl = url.startsWith('http') || url.startsWith(`${API_BASE}/`) ? url : `${API_BASE}${url}`

  const headers = new Headers(init?.headers)
  if (typeof init?.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  try {
    const res = await fetch(fullUrl, { ...init, headers })
    if (!res.ok) {
      const message = await readErrorMessage(res, getHttpStatusMessage(res.status))
      logger.error(`API ${res.status}: ${fullUrl}`, { status: res.status, url: fullUrl })
      return { ok: false, status: res.status, message }
    }
    if (init?.raw) {
      return { ok: true, data: res as unknown as T }
    }
    const data = (await res.json()) as T
    return { ok: true, data }
  } catch (err) {
    if (isNetworkError(err)) {
      logger.error('Network error', err, { url: fullUrl })
      return {
        ok: false,
        status: 0,
        message: 'ไม่สามารถเชื่อมต่อ Backend ได้ — กรุณาตรวจสอบว่า Backend เปิดอยู่',
      }
    }
    logger.error('Unexpected fetch error', err, { url: fullUrl })
    return {
      ok: false,
      status: 0,
      message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่',
    }
  }
}
