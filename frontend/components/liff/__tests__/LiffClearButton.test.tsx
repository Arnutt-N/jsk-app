// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LiffClearButton } from '../LiffClearButton'

describe('LiffClearButton', () => {
  it('renders the shared label', () => {
    render(<LiffClearButton onClear={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'ล้างค่า' })).toBeInTheDocument()
  })

  it('fires the action on click', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    render(<LiffClearButton onClear={onClear} />)
    await user.click(screen.getByRole('button', { name: 'ล้างค่า' }))
    expect(onClear).toHaveBeenCalled()
  })

  it('renders a custom label', () => {
    render(<LiffClearButton onClear={vi.fn()} label="ล้างข้อมูล" />)
    expect(screen.getByRole('button', { name: 'ล้างข้อมูล' })).toBeInTheDocument()
  })
})
