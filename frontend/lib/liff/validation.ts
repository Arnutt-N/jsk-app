import { isNamePrefix } from '@/lib/constants/prefixes'

const PHONE_DIGITS = /^\+?[0-9]{9,15}$/

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export function isValidEmail(raw: string): boolean {
  const cleaned = raw.trim()
  return cleaned.length > 0 && cleaned.length <= 254 && EMAIL_PATTERN.test(cleaned)
}

export function normalizePhone(raw: string): string {
  return raw.trim().replace(/[-\s]/g, '')
}

export function isValidPhone(raw: string): boolean {
  return PHONE_DIGITS.test(normalizePhone(raw))
}

export interface BookingContactInput {
  prefix: string
  firstname: string
  lastname: string
  phoneNumber: string
  email: string
}

export interface BookingContactErrors {
  prefix?: string
  firstname?: string
  lastname?: string
  phoneNumber?: string
  email?: string
}

export function composeContactName(parts: {
  prefix: string
  firstname: string
  lastname: string
}): string {
  return [parts.prefix.trim(), parts.firstname.trim(), parts.lastname.trim()]
    .filter(Boolean)
    .join(' ')
}

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

export function validateBookingContact(input: BookingContactInput): BookingContactErrors {
  const errors: BookingContactErrors = {}
  const prefix = input.prefix.trim()
  const firstname = input.firstname.trim()
  const lastname = input.lastname.trim()
  const phoneNumber = input.phoneNumber.trim()
  const email = input.email.trim()
  if (prefix || firstname || lastname) {
    if (!prefix) errors.prefix = 'กรุณาเลือกคำนำหน้า'
    if (!firstname) errors.firstname = 'กรุณาระบุชื่อ'
    if (!lastname) errors.lastname = 'กรุณาระบุนามสกุล'
  }
  if (phoneNumber && !isValidPhone(phoneNumber))
    errors.phoneNumber = 'หมายเลขโทรศัพท์ไม่ถูกต้อง'
  if (email && !isValidEmail(email))
    errors.email = 'อีเมลไม่ถูกต้อง'
  return errors
}
