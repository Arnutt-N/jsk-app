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

  it('shows each step icon in its circle and numbers nowhere', () => {
    const { container } = render(<LiffStepper steps={STEPS} currentIndex={1} ariaLabel="ขั้นตอนการจอง" />)
    const stepper = screen.getByRole('list', { name: 'ขั้นตอนการจอง' })
    expect(within(stepper).getByText('วันที่')).toHaveAttribute('aria-current', 'step')
    expect(within(stepper).getByText('บริการ')).not.toHaveAttribute('aria-current')
    expect(within(stepper).getByText('เวลา')).not.toHaveAttribute('aria-current')
    expect(within(stepper).queryByText('2')).not.toBeInTheDocument()
    expect(within(stepper).queryByText('3')).not.toBeInTheDocument()
    expect(container.querySelectorAll('li > span:first-child svg')).toHaveLength(STEPS.length)
  })

  it('puts no icon in front of the step label (the circle already has one)', () => {
    const { container } = render(<LiffStepper steps={STEPS} currentIndex={1} ariaLabel="ขั้นตอนการจอง" />)
    expect(container.querySelectorAll('li > span:nth-child(2) svg')).toHaveLength(0)
  })

  it('draws one connector between each pair of steps', () => {
    const { container } = render(<LiffStepper steps={STEPS} currentIndex={0} ariaLabel="ขั้นตอนการจอง" />)
    const connectors = container.querySelectorAll('span[aria-hidden="true"].absolute')
    expect(connectors).toHaveLength(STEPS.length - 1)
  })
})
