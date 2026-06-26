import { describe, it, expect } from 'vitest'
import { AVATAR_FALLBACK_BG, getAvatarFallbackUrl } from '../live-chat-avatar'

describe('AVATAR_FALLBACK_BG', () => {
  it('ใช้สีแบรนด์ blue (3b82f6) ไม่ใช่ indigo เดิม (6366f1)', () => {
    // Arrange / Act — ค่าคงที่
    // Assert
    expect(AVATAR_FALLBACK_BG).toBe('3b82f6')
    expect(AVATAR_FALLBACK_BG).not.toBe('6366f1')
  })
})

describe('getAvatarFallbackUrl', () => {
  it('URL มี background=3b82f6', () => {
    // Arrange
    const name = 'Somchai'

    // Act
    const url = getAvatarFallbackUrl(name)

    // Assert
    expect(url).toContain('background=3b82f6')
  })

  it('URL ของชื่อภาษาไทยต้อง encode ถูกต้องและไม่มีช่องว่างดิบ', () => {
    // Arrange
    const name = 'นาย ก'

    // Act
    const url = getAvatarFallbackUrl(name)

    // Assert
    expect(url).toContain(encodeURIComponent(name))
    expect(url).not.toContain(' ')  // ไม่มี space ดิบใน URL
  })

  it('URL มี size ตามที่ส่งเข้ามา', () => {
    // Arrange
    const size = 32

    // Act
    const url = getAvatarFallbackUrl('A', size)

    // Assert
    expect(url).toContain('size=32')
  })
})
