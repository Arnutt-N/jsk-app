// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LiffStepCard } from '../LiffStepCard'

describe('LiffStepCard', () => {
  it('renders icon, title, and children', () => {
    render(
      <LiffStepCard icon={<span data-testid="step-icon" />} title="ข้อมูลส่วนตัว">
        <p>เนื้อหา</p>
      </LiffStepCard>,
    )
    expect(screen.getByText('ข้อมูลส่วนตัว')).toBeInTheDocument()
    expect(screen.getByText('เนื้อหา')).toBeInTheDocument()
    expect(screen.getByTestId('step-icon')).toBeInTheDocument()
  })

  it('renders the header action and merges className', () => {
    const onClear = vi.fn()
    const { container } = render(
      <LiffStepCard icon={<span />} title="หัวข้อ" action={<button onClick={onClear}>ล้างค่า</button>} className="extra">
        <p>เนื้อหา</p>
      </LiffStepCard>,
    )
    screen.getByRole('button', { name: 'ล้างค่า' }).click()
    expect(onClear).toHaveBeenCalled()
    expect(container.querySelector('.extra')).not.toBeNull()
  })
})
