// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import LiffStatusBadge from '../LiffStatusBadge'

describe('LiffStatusBadge', () => {
  it('tells the citizen the shop is open once booking options arrive', () => {
    render(<LiffStatusBadge kind="business" state="open" />)
    expect(screen.getByText('เปิดรับจอง')).toBeInTheDocument()
  })

  it('tells the citizen the shop is still connecting while options load', () => {
    render(<LiffStatusBadge kind="business" state="loading" />)
    expect(screen.getByText('กำลังเชื่อมต่อ…')).toBeInTheDocument()
  })

  it('reports the network state for form pages, never the shop state', () => {
    const { rerender } = render(<LiffStatusBadge kind="connectivity" state="online" />)
    expect(screen.getByText('Online')).toBeInTheDocument()
    rerender(<LiffStatusBadge kind="connectivity" state="loading" />)
    expect(screen.getByText('Connecting...')).toBeInTheDocument()
    rerender(<LiffStatusBadge kind="connectivity" state="offline" />)
    expect(screen.getByText('โหลดไม่สำเร็จ')).toBeInTheDocument()
    expect(screen.queryByText('เปิดรับจอง')).not.toBeInTheDocument()
  })
})
