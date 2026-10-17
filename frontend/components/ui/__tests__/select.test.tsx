// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Select } from '../Select'

describe('Select', () => {
  it('renders flat options with a placeholder', () => {
    render(
      <Select
        aria-label="จังหวัด"
        options={[
          { value: 'a', label: 'ก' },
          { value: 'b', label: 'ข' },
        ]}
        placeholder="-- เลือก --"
        value=""
        onChange={() => undefined}
      />,
    )
    const box = screen.getByRole('combobox', { name: 'จังหวัด' })
    expect(box).toHaveDisplayValue('-- เลือก --')
    expect(screen.getByRole('option', { name: 'ก' })).toBeInTheDocument()
  })

  it('renders grouped options without losing the groups', () => {
    render(
      <Select
        aria-label="บริการ"
        groups={[
          { label: 'กฎหมาย', options: [{ value: 'x', label: 'ปรึกษา' }] },
          { label: 'อื่นๆ', options: [{ value: 'y', label: 'ทั่วไป' }] },
        ]}
        value=""
        onChange={() => undefined}
      />,
    )
    const box = screen.getByRole('combobox', { name: 'บริการ' })
    expect(box).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'ปรึกษา' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'ทั่วไป' })).toBeInTheDocument()
  })
})
