import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MobileDrawer } from '../MobileDrawer'

describe('MobileDrawer', () => {
  it('renders dialog semantics', () => {
    render(
      <MobileDrawer open onClose={vi.fn()} titleId="t">
        <h2 id="t">Title</h2>
        <button>X</button>
      </MobileDrawer>
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 't')
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <MobileDrawer open onClose={onClose} titleId="t">
        <button>X</button>
      </MobileDrawer>
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus into the drawer on open', () => {
    render(
      <MobileDrawer open onClose={vi.fn()} titleId="t">
        <h2 id="t">Title</h2>
      </MobileDrawer>
    )
    const dialog = screen.getByRole('dialog')
    expect(document.activeElement).toBe(dialog)
  })

  it('renders nothing when closed', () => {
    render(
      <MobileDrawer open={false} onClose={vi.fn()} titleId="t">
        <button>X</button>
      </MobileDrawer>
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
