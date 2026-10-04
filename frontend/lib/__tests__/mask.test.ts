import { describe, expect, it } from 'vitest'
import { maskLineUserId, maskLineUserIdForRole } from '../mask'

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

describe('maskLineUserIdForRole (D1)', () => {
  const id = 'U4af4980abcdef1234567890abcdef98ab'

  it.each(['SUPER_ADMIN', 'ADMIN'])('returns the full id for %s', (role) => {
    expect(maskLineUserIdForRole(id, role)).toBe(id)
    expect(maskLineUserIdForRole('U1234a', role)).toBe('U1234a')
  })

  it.each(['DIRECTOR', 'HEAD', 'AGENT', 'USER', undefined])('masks the id for %s', (role) => {
    expect(maskLineUserIdForRole(id, role)).toBe(maskLineUserId(id))
  })

  it('fail-closes empty ids to the mask output for every role', () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'AGENT', undefined]) {
      expect(maskLineUserIdForRole(null, role)).toBe('-')
      expect(maskLineUserIdForRole(undefined, role)).toBe('-')
      expect(maskLineUserIdForRole('', role)).toBe('-')
    }
  })
})
