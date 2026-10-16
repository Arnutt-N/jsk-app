import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

import { getHttpStatusMessage } from '@/lib/api-error'
import {
  useTaxonomyAdmin,
  DUPLICATE_CATEGORY_MESSAGE,
  DUPLICATE_TOPIC_MESSAGE,
} from '../useTaxonomyAdmin'

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

function mockFetchSequence(responses: Response[]): void {
  const stub = vi.fn()
  for (const response of responses) stub.mockResolvedValueOnce(response)
  vi.stubGlobal('fetch', stub)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useTaxonomyAdmin — loading', () => {
  it('loads the admin category list on mount', async () => {
    mockFetchSequence([jsonResponse(CATEGORIES_PAYLOAD)])
    const { result } = renderHook(() => useTaxonomyAdmin())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.categories).toHaveLength(1)
    expect(result.current.categories[0]?.topics).toHaveLength(1)
    expect(result.current.loadError).toBeNull()
  })

  it('surfaces a permission message on 403', async () => {
    mockFetchSequence([jsonResponse({ detail: 'forbidden' }, 403)])
    const { result } = renderHook(() => useTaxonomyAdmin())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.categories).toEqual([])
    expect(result.current.loadError).toContain('manage_taxonomy')
  })

  it('drops malformed rows instead of crashing', async () => {
    mockFetchSequence([jsonResponse({ categories: [{ id: 'x' }, null, 42] })])
    const { result } = renderHook(() => useTaxonomyAdmin())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.categories).toEqual([])
  })
})

describe('useTaxonomyAdmin — mutations', () => {
  it('suggests reactivation on duplicate category (409)', async () => {
    mockFetchSequence([
      jsonResponse(CATEGORIES_PAYLOAD),
      jsonResponse({ detail: 'exists' }, 409),
    ])
    const { result } = renderHook(() => useTaxonomyAdmin())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let failure: string | null = null
    await act(async () => {
      failure = await result.current.createCategory({ name: 'กองทุนยุติธรรม', sort_order: 1 })
    })
    expect(failure).toBe(DUPLICATE_CATEGORY_MESSAGE)
  })

  it('suggests reactivation on duplicate topic (409)', async () => {
    mockFetchSequence([
      jsonResponse(CATEGORIES_PAYLOAD),
      jsonResponse({ detail: 'exists' }, 409),
    ])
    const { result } = renderHook(() => useTaxonomyAdmin())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let failure: string | null = null
    await act(async () => {
      failure = await result.current.createTopic({ category_id: 1, name: 'ค่าจ้างทนายความ', sort_order: 1 })
    })
    expect(failure).toBe(DUPLICATE_TOPIC_MESSAGE)
  })

  it('trims names before sending', async () => {
    mockFetchSequence([jsonResponse(CATEGORIES_PAYLOAD), jsonResponse({}), jsonResponse(CATEGORIES_PAYLOAD)])
    const { result } = renderHook(() => useTaxonomyAdmin())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.createCategory({ name: '  ใหม่  ', sort_order: 2 })
    })
    const fetchMock = vi.mocked(fetch)
    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST')
    expect(postCall).toBeDefined()
    expect(JSON.parse(postCall?.[1]?.body as string).name).toBe('ใหม่')
  })

  it('refreshes the list after a successful delete', async () => {
    mockFetchSequence([
      jsonResponse(CATEGORIES_PAYLOAD),
      jsonResponse({ status: 'deleted' }),
      jsonResponse({ categories: [] }),
    ])
    const { result } = renderHook(() => useTaxonomyAdmin())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let failure: string | null = 'unset'
    await act(async () => {
      failure = await result.current.deleteTopic(11)
    })
    expect(failure).toBeNull()
    await waitFor(() => expect(result.current.categories).toEqual([]))
  })

  it('maps a network failure to a Thai retry message', async () => {
    mockFetchSequence([jsonResponse(CATEGORIES_PAYLOAD)])
    const { result } = renderHook(() => useTaxonomyAdmin())
    await waitFor(() => expect(result.current.loading).toBe(false))

    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Load failed'))
    let failure: string | null = null
    await act(async () => {
      failure = await result.current.deleteCategory(1)
    })
    expect(failure).toBe(getHttpStatusMessage(0))
  })
})
