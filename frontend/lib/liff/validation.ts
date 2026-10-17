/** Shared LIFF form validation — one dialect, not one per page. */

const PHONE_DIGITS = /^\+?[0-9]{9,15}$/

export function normalizePhone(raw: string): string {
  return raw.trim().replace(/[-\s]/g, '')
}

/** Optional +, then 9–15 digits — mirrors backend debt `_PHONE_PATTERN`. */
export function isValidPhone(raw: string): boolean {
  return PHONE_DIGITS.test(normalizePhone(raw))
}

export interface BookingContactInput {
  contactName: string
  phoneNumber: string
}

export interface BookingContactErrors {
  phoneNumber?: string
}

/**
 * Booking contact stays optional (backend contract), but a filled phone
 * must be diallable. Formal wording shared by every LIFF form.
 */
export function validateBookingContact(input: BookingContactInput): BookingContactErrors {
  if (!input.phoneNumber.trim()) return {}
  if (!isValidPhone(input.phoneNumber)) return { phoneNumber: 'หมายเลขโทรศัพท์ไม่ถูกต้อง' }
  return {}
}
