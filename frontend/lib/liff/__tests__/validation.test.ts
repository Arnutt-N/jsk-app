// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { composeContactName, isValidPhone, normalizePhone, splitContactName, validateBookingContact } from '../validation'

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
  it('allows a fully empty contact — booking contact stays optional', () => {
    expect(
      validateBookingContact({ prefix: '', firstname: '', lastname: '', phoneNumber: '', email: '' }),
    ).toEqual({})
  })

  it('requires the whole trio once any name part is filled', () => {
    expect(
      validateBookingContact({ prefix: '', firstname: 'สมชาย', lastname: '', phoneNumber: '', email: '' }),
    ).toEqual({ prefix: 'กรุณาเลือกคำนำหน้า', lastname: 'กรุณาระบุนามสกุล' })
  })

  it('rejects a filled-but-undiallable phone in the shared wording', () => {
    expect(
      validateBookingContact({ prefix: 'นาย', firstname: 'สมชาย', lastname: 'ใจดี', phoneNumber: '123', email: '' }),
    ).toEqual({
      phoneNumber: 'หมายเลขโทรศัพท์ไม่ถูกต้อง',
    })
  })

  it('accepts a complete contact', () => {
    expect(
      validateBookingContact({ prefix: 'นาย', firstname: 'สมชาย', lastname: 'ใจดี', phoneNumber: '0812345678', email: '' }),
    ).toEqual({})
  })

  it('accepts a well-formed optional email and rejects a bad one', () => {
    const base = { prefix: 'นาย', firstname: 'สมชาย', lastname: 'ใจดี', phoneNumber: '0812345678' }
    expect(validateBookingContact({ ...base, email: 'citizen@example.com' })).toEqual({})
    expect(validateBookingContact({ ...base, email: 'not-an-email' })).toEqual({
      email: 'อีเมลไม่ถูกต้อง',
    })
  })
})

describe('composeContactName', () => {
  it('joins the filled parts with single spaces', () => {
    expect(composeContactName({ prefix: 'นาย', firstname: 'สมชาย', lastname: 'ใจดี' })).toBe(
      'นาย สมชาย ใจดี',
    )
    expect(composeContactName({ prefix: '', firstname: '', lastname: '' })).toBe('')
  })
})

describe('splitContactName', () => {
  it('splits a standard stored string back into the trio', () => {
    expect(splitContactName('นาย สมชาย ใจดี')).toEqual({
      prefix: 'นาย',
      firstname: 'สมชาย',
      lastname: 'ใจดี',
    })
  })

  it('keeps multi-word firstnames together and tolerates missing prefix', () => {
    expect(splitContactName('สมชาย ใจ ใจดี')).toEqual({
      prefix: '',
      firstname: 'สมชาย ใจ',
      lastname: 'ใจดี',
    })
    expect(splitContactName('สมชาย')).toEqual({ prefix: '', firstname: 'สมชาย', lastname: '' })
    expect(splitContactName(null)).toEqual({ prefix: '', firstname: '', lastname: '' })
  })
})
