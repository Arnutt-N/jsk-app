// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { CalendarDays } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import LiffStepper from '../LiffStepper'

const STEPS = [
  { label: 'บริการ', icon: <CalendarDays className="h-3 w-3" aria-hidden="true" /> },
  { label: 'วันที่', icon: <CalendarDays className="h-3 w-3" aria-hidden="true" /> },
  { label: 'เวลา', icon: <CalendarDays className="h-3 w-3" aria-hidden="true" /> },
]

describe('LiffStepper', () => {
  it('exposes a named list so screen readers find the wizard progress', () => {
    render(<LiffStepper steps={STEPS} currentIndex={0} ariaLabel="ขั้นตอนการจอง" />)
    expect(screen.getByRole('list', { name: 'ขั้นตอนการจอง' })).toBeInTheDocument()
  })

  it('marks only the current label with aria-current and numbers unfinished steps', () => {
    render(<LiffStepper steps={STEPS} currentIndex={1} ariaLabel="ขั้นตอนการจอง" />)
    const stepper = screen.getByRole('list', { name: 'ขั้นตอนการจอง' })
    expect(within(stepper).getByText('วันที่')).toHaveAttribute('aria-current', 'step')
    expect(within(stepper).getByText('บริการ')).not.toHaveAttribute('aria-current')
    expect(within(stepper).getByText('เวลา')).not.toHaveAttribute('aria-current')
    expect(within(stepper).getByText('2')).toBeInTheDocument()
    expect(within(stepper).getByText('3')).toBeInTheDocument()
  })

  it('draws one connector between each pair of steps', () => {
    const { container } = render(<LiffStepper steps={STEPS} currentIndex={0} ariaLabel="ขั้นตอนการจอง" />)
    const connectors = container.querySelectorAll('span[aria-hidden="true"].absolute')
    expect(connectors).toHaveLength(STEPS.length - 1)
  })
})
