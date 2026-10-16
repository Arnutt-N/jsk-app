// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import TaxonomyEditor from '../TaxonomyEditor'
import { ToastProvider } from '@/components/ui/Toast'

const CATEGORIES_PAYLOAD = {
  categories: [
    {
      id: 1,
      name: 'กองทุนยุติธรรม',
      sort_order: 0,
      is_active: true,
      topics: [
        { id: 11, category_id: 1, name: 'ค่าจ้างทนายความ', sort_order: 0, is_active: true },
      ],
    },
  ],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderEditor(): void {
  render(
    <ToastProvider>
      <TaxonomyEditor />
    </ToastProvider>,
  )
}

describe('TaxonomyEditor', () => {
  it('renders categories and topics from the admin API', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(CATEGORIES_PAYLOAD))
    renderEditor()

    await waitFor(() => expect(screen.getByDisplayValue('กองทุนยุติธรรม')).toBeInTheDocument())
    expect(screen.getByDisplayValue('ค่าจ้างทนายความ')).toBeInTheDocument()
  })

  it('sends numeric sort_order on save', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(CATEGORIES_PAYLOAD))
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('กองทุนยุติธรรม')).toBeInTheDocument())

    const orderInput = screen.getByLabelText('ลำดับหมวดหมู่')
    fireEvent.change(orderInput, { target: { value: '3' } })

    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ id: 1 }))
      .mockResolvedValueOnce(jsonResponse(CATEGORIES_PAYLOAD))
    fireEvent.click(screen.getAllByRole('button', { name: 'บันทึก' })[0] as HTMLElement)

    await waitFor(() => {
      const patchCall = vi
        .mocked(fetch)
        .mock.calls.find((call) => call[1]?.method === 'PATCH')
      expect(patchCall?.[0]).toContain('/admin/taxonomy/categories/1')
      expect(JSON.parse(patchCall?.[1]?.body as string).sort_order).toBe(3)
    })
  })

  it('shows the reactivate hint on 409', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(CATEGORIES_PAYLOAD))
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('กองทุนยุติธรรม')).toBeInTheDocument())

    fireEvent.change(screen.getByDisplayValue('กองทุนยุติธรรม'), {
      target: { value: 'ชื่อซ้ำ' },
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: 'exists' }, 409))
    fireEvent.click(screen.getAllByRole('button', { name: 'บันทึก' })[0] as HTMLElement)

    await waitFor(() =>
      expect(screen.getByText(/เปิดใช้งานรายการเดิมแทนการสร้างใหม่/)).toBeInTheDocument(),
    )
  })

  it('asks for confirmation with the cascade warning before deleting a category', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(CATEGORIES_PAYLOAD))
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('กองทุนยุติธรรม')).toBeInTheDocument())

    fireEvent.click(screen.getAllByRole('button', { name: 'ลบ' })[0] as HTMLElement)

    await waitFor(() => expect(screen.getByText('ลบหมวดหมู่นี้?')).toBeInTheDocument())
    expect(screen.getByText(/หัวข้อย่อยทั้งหมดในหมวดหมู่นี้จะถูกลบถาวร/)).toBeInTheDocument()
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })
})
