// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { isValidPhone, normalizePhone, validateBookingContact } from '../validation'

describe('shared phone validation', () => {
  it('normalizes dashes and spaces before checking', () => {
    expect(normalizePhone('081-234-5678')).toBe('0812345678')
    expect(normalizePhone(' 081 234 5678 ')).toBe('0812345678')
  })

  it('accepts Thai mobiles and +66 forms, rejects fragments', () => {
    expect(isValidPhone('0812345678')).toBe(true)
    expect(isValidPhone('+66812345678')).toBe(true)
    expect(isValidPhone('081-234-5678')).toBe(true)
    expect(isValidPhone('123')).toBe(false)
    expect(isValidPhone('')).toBe(false)
  })
})

describe('validateBookingContact', () => {
  it('allows an empty phone — booking contact stays optional', () => {
    expect(validateBookingContact({ contactName: '', phoneNumber: '' })).toEqual({})
  })

  it('rejects a filled-but-undiallable phone in the debt form wording', () => {
    expect(validateBookingContact({ contactName: 'ก', phoneNumber: '123' })).toEqual({
      phoneNumber: 'เบอร์โทรไม่ถูกต้อง',
    })
  })

  it('accepts a diallable phone', () => {
    expect(validateBookingContact({ contactName: 'ก', phoneNumber: '0812345678' })).toEqual({})
  })
})
