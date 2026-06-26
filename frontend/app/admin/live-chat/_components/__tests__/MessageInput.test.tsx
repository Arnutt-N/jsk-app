import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MessageInput } from '../MessageInput'

// Default props that satisfy the full MessageInputProps interface.
// vi.fn() stubs are used for all callbacks; booleans default to their
// least-interactive state so no child picker mounts.
const defaultProps = {
  inputText: '',
  sending: false,
  isHumanMode: true,
  showCannedPicker: false,
  soundEnabled: true,
  onInputChange: vi.fn(),
  onSend: vi.fn(),
  onSendFile: vi.fn(),
  onToggleCannedPicker: vi.fn(),
  onSelectCanned: vi.fn(),
  onCloseCanned: vi.fn(),
  onToggleSound: vi.fn(),
  onTyping: vi.fn(),
}

describe('MessageInput accessibility', () => {
  describe('exposes accessible names for all composer buttons', () => {
    it('finds every toolbar button by its Thai aria-label', () => {
      // Arrange
      render(<MessageInput {...defaultProps} />)

      // Act + Assert — each getByRole throws if the button is absent
      expect(screen.getByRole('button', { name: 'แทรกอิโมจิ' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'แทรกสติกเกอร์' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'อัปโหลดรูปภาพ' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'แนบไฟล์' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'ข้อความด่วน' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'ข้อความสำเร็จรูป' })).toBeInTheDocument()
      // soundEnabled=true → aria-label is "ปิดเสียงแจ้งเตือน"
      expect(screen.getByRole('button', { name: 'ปิดเสียงแจ้งเตือน' })).toBeInTheDocument()
      // inputExpanded=false (store default) → aria-label is "ขยายกล่องข้อความ"
      expect(screen.getByRole('button', { name: 'ขยายกล่องข้อความ' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'ส่งข้อความ' })).toBeInTheDocument()
    })
  })

  describe('marks toggle buttons with aria-pressed', () => {
    it('emoji button has aria-pressed reflecting closed state', () => {
      // Arrange
      render(<MessageInput {...defaultProps} />)

      // Act
      const emojiBtn = screen.getByRole('button', { name: 'แทรกอิโมจิ' })

      // Assert — store default is false so aria-pressed="false"
      expect(emojiBtn).toHaveAttribute('aria-pressed', 'false')
    })

    it('sticker button has aria-pressed', () => {
      render(<MessageInput {...defaultProps} />)
      const stickerBtn = screen.getByRole('button', { name: 'แทรกสติกเกอร์' })
      expect(stickerBtn).toHaveAttribute('aria-pressed')
    })

    it('quick replies button has aria-pressed', () => {
      render(<MessageInput {...defaultProps} />)
      const quickBtn = screen.getByRole('button', { name: 'ข้อความด่วน' })
      expect(quickBtn).toHaveAttribute('aria-pressed')
    })

    it('canned picker button has aria-pressed reflecting showCannedPicker prop', () => {
      render(<MessageInput {...defaultProps} />)
      const cannedBtn = screen.getByRole('button', { name: 'ข้อความสำเร็จรูป' })
      expect(cannedBtn).toHaveAttribute('aria-pressed', 'false')
    })

    it('upload buttons do NOT carry aria-pressed', () => {
      render(<MessageInput {...defaultProps} />)
      const imageBtn = screen.getByRole('button', { name: 'อัปโหลดรูปภาพ' })
      const fileBtn = screen.getByRole('button', { name: 'แนบไฟล์' })
      expect(imageBtn).not.toHaveAttribute('aria-pressed')
      expect(fileBtn).not.toHaveAttribute('aria-pressed')
    })

    it('expand button uses aria-expanded (not aria-pressed)', () => {
      render(<MessageInput {...defaultProps} />)
      const expandBtn = screen.getByRole('button', { name: 'ขยายกล่องข้อความ' })
      // aria-expanded must be present; aria-pressed must be absent
      expect(expandBtn).toHaveAttribute('aria-expanded', 'false')
      expect(expandBtn).not.toHaveAttribute('aria-pressed')
    })
  })

  describe('hides decorative icons from the a11y tree', () => {
    it('SVG inside the send button is aria-hidden', () => {
      // Arrange
      render(<MessageInput {...defaultProps} />)

      // Act
      const sendBtn = screen.getByRole('button', { name: 'ส่งข้อความ' })
      const svg = sendBtn.querySelector('svg')

      // Assert
      expect(svg).not.toBeNull()
      expect(svg).toHaveAttribute('aria-hidden', 'true')
    })

    it('SVG inside the emoji button is aria-hidden', () => {
      render(<MessageInput {...defaultProps} />)
      const emojiBtn = screen.getByRole('button', { name: 'แทรกอิโมจิ' })
      const svg = emojiBtn.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg).toHaveAttribute('aria-hidden', 'true')
    })

    it('SVG inside the expand button is aria-hidden', () => {
      render(<MessageInput {...defaultProps} />)
      const expandBtn = screen.getByRole('button', { name: 'ขยายกล่องข้อความ' })
      const svg = expandBtn.querySelector('svg')
      expect(svg).not.toBeNull()
      expect(svg).toHaveAttribute('aria-hidden', 'true')
    })
  })
})
