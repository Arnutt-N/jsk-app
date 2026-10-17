/** Shared LIFF form validation — one dialect, not one per page. */
import { isNamePrefix } from '@/lib/constants/prefixes'

const PHONE_DIGITS = /^\+?[0-9]{9,15}$/

export function normalizePhone(raw: string): string {
  return raw.trim().replace(/[-\s]/g, '')
}

/** Optional +, then 9–15 digits — mirrors backend debt `_PHONE_PATTERN`. */
export function isValidPhone(raw: string): boolean {
  return PHONE_DIGITS.test(normalizePhone(raw))
}

export interface BookingContactInput {
  prefix: string
  firstname: string
  lastname: string
  phoneNumber: string
}

export interface BookingContactErrors {
  prefix?: string
  firstname?: string
  lastname?: string
  phoneNumber?: string
}

/** Join the trio the way every stored string is composed. */
export function composeContactName(parts: {
  prefix: string
  firstname: string
  lastname: string
}): string {
  return [parts.prefix.trim(), parts.firstname.trim(), parts.lastname.trim()]
    .filter(Boolean)
    .join(' ')
}

/** Best-effort split for prefilling the edit form from a stored string. */
export function splitContactName(composed: string | null | undefined): {
  prefix: string
  firstname: string
  lastname: string
} {
  const tokens = (composed ?? '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { prefix: '', firstname: '', lastname: '' }
  const [first, ...rest] = tokens
  const prefix = isNamePrefix(first) ? first : ''
  const nameTokens = isNamePrefix(first) ? rest : tokens
  if (nameTokens.length === 0) return { prefix, firstname: '', lastname: '' }
  if (nameTokens.length === 1) return { prefix, firstname: nameTokens[0], lastname: '' }
  return {
    prefix,
    firstname: nameTokens.slice(0, -1).join(' '),
    lastname: nameTokens[nameTokens.length - 1],
  }
}

/**
 * Booking contact stays optional (backend contract), but a filled phone
 * must be diallable, and a half-filled name must be completed — the same
 * all-or-nothing rule the backend enforces. Formal wording shared by
 * every LIFF form.
 */
export function validateBookingContact(input: BookingContactInput): BookingContactErrors {
  const errors: BookingContactErrors = {}
  const prefix = input.prefix.trim()
  const firstname = input.firstname.trim()
  const lastname = input.lastname.trim()
  const phoneNumber = input.phoneNumber.trim()
  if (prefix || firstname || lastname) {
    if (!prefix) errors.prefix = 'กรุณาเลือกคำนำหน้า'
    if (!firstname) errors.firstname = 'กรุณาระบุชื่อ'
    if (!lastname) errors.lastname = 'กรุณาระบุนามสกุล'
  }
  if (phoneNumber && !isValidPhone(phoneNumber))
    errors.phoneNumber = 'หมายเลขโทรศัพท์ไม่ถูกต้อง'
  return errors
}
