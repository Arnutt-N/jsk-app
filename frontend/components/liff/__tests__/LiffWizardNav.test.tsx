// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LiffWizardNav } from '../LiffWizardNav'

describe('LiffWizardNav', () => {
  it('omits back when the slot is absent and always shows cancel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onNext = vi.fn()
    render(<LiffWizardNav onCancel={onCancel} next={{ label: 'ถัดไป', onClick: onNext }} />)
    expect(screen.queryByRole('button', { name: 'กลับ' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ยกเลิกรายการ' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(onNext).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'ยกเลิกรายการ' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('renders back and submit slots with handlers', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    const onSubmit = vi.fn()
    render(
      <LiffWizardNav
        onCancel={vi.fn()}
        back={{ label: 'กลับ', onClick: onBack }}
        submit={{ label: 'ยื่นคำขอ', onClick: onSubmit }}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'กลับ' }))
    expect(onBack).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'ยื่นคำขอ' }))
    expect(onSubmit).toHaveBeenCalled()
  })
})
