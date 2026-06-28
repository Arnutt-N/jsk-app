import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { TransferDialog } from '../TransferDialog'
import type { OperatorOption } from '../../_types'

const operators: OperatorOption[] = [
  { id: 1, display_name: 'Alice', status: 'online', active_chats: 2, online: true },
  { id: 2, display_name: 'Bob', status: 'offline', active_chats: 0, online: false },
]

describe('TransferDialog a11y', () => {
  it('exposes role="dialog" on the panel (not the backdrop) with modal semantics', () => {
    render(
      <TransferDialog open onClose={vi.fn()} onTransfer={vi.fn()} operators={operators} />
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Transfer session')
    // The role lives on the surface panel, never on the full-screen backdrop.
    expect(dialog.className).toContain('bg-surface')
    expect(dialog.className).not.toContain('inset-0')
  })

  it('restores focus to the triggering element when closed (WCAG 2.4.3)', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const { rerender } = render(
      <TransferDialog open onClose={vi.fn()} onTransfer={vi.fn()} operators={operators} />
    )
    // Opening moves focus into the dialog, away from the trigger.
    expect(document.activeElement).not.toBe(trigger)

    // Closing returns focus to where it came from.
    rerender(
      <TransferDialog open={false} onClose={vi.fn()} onTransfer={vi.fn()} operators={operators} />
    )
    expect(document.activeElement).toBe(trigger)

    trigger.remove()
  })

  it('renders nothing when closed', () => {
    render(
      <TransferDialog open={false} onClose={vi.fn()} onTransfer={vi.fn()} operators={operators} />
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
