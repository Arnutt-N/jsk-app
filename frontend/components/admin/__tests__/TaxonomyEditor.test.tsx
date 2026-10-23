// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, 409))
    fireEvent.click(screen.getAllByRole('button', { name: 'บันทึก' })[0] as HTMLElement)

    await waitFor(() =>
      expect(screen.getByText(/เปิดใช้งานรายการเดิมแทนการสร้างใหม่/)).toBeInTheDocument(),
    )
  })

  it('states a non-empty category cannot be deactivated and points at the toggle', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(CATEGORIES_PAYLOAD))
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('กองทุนยุติธรรม')).toBeInTheDocument())

    fireEvent.click(screen.getAllByRole('button', { name: 'ปิดใช้งาน' })[0] as HTMLElement)

    await waitFor(() => expect(screen.getByText('ปิดใช้งานหมวดหมู่นี้?')).toBeInTheDocument())
    expect(screen.getByText(/ไม่สามารถปิดใช้งานได้/)).toBeInTheDocument()
    expect(screen.queryByText(/จะถูกลบถาวร/)).not.toBeInTheDocument()
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('delete modal says hide-restorable, not permanent', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(CATEGORIES_PAYLOAD))
    renderEditor()
    await waitFor(() => expect(screen.getByDisplayValue('ค่าจ้างทนายความ')).toBeInTheDocument())

    fireEvent.click(screen.getAllByRole('button', { name: 'ปิดใช้งาน' })[1] as HTMLElement)

    await waitFor(() => expect(screen.getByText('ปิดใช้งานหัวข้อนี้?')).toBeInTheDocument())
    expect(screen.getByText(/ซ่อนไว้/)).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'ปิดใช้งาน' })).toBeInTheDocument();
    expect(screen.queryByText(/จะถูกลบถาวร/)).not.toBeInTheDocument()
  })
})
