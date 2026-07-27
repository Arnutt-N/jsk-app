import { describe, expect, it } from 'vitest'
import { maskLineUserId } from '../mask'

describe('maskLineUserId', () => {
  it('returns dash for null/undefined/empty', () => {
    expect(maskLineUserId(null)).toBe('-')
    expect(maskLineUserId(undefined)).toBe('-')
    expect(maskLineUserId('')).toBe('-')
  })

  it('masks short IDs entirely', () => {
    expect(maskLineUserId('U1234a')).toBe('＊＊＊＊＊＊')
  })

  it('masks a real LINE user ID keeping first char and last 4', () => {
    const id = 'U4af4980abcdef1234567890abcdef98ab'
    const result = maskLineUserId(id)
    expect(result).toBe('U' + '＊'.repeat(id.length - 5) + '98ab')
    expect(result).not.toContain('4af4980')
  })

  it('preserves output length equal to input length', () => {
    const id = 'U4af4980abcdef1234567890abcdef98ab'
    expect(maskLineUserId(id).length).toBe(id.length)
  })
})
