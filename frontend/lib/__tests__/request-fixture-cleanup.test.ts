import { describe, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'

import { captureCsrf, cleanupRequestFixtures, createRequestFixture } from '../../e2e/utils/request-fixture'

function fakePage(id: number, deleteImpl?: (url: string) => Promise<{ ok: () => boolean }>) {
  const listeners: Array<(res: unknown) => void> = []
  const page = {
    on: (event: string, fn: (res: unknown) => void) => {
      if (event === 'response') listeners.push(fn)
    },
    request: {
      post: vi.fn(async () => ({
        ok: () => true,
        json: async () => ({ id }),
      })),
      delete: vi.fn(deleteImpl ?? (async () => ({ ok: () => true }))),
    },
  } as unknown as Page
  return { page, listeners }
}

async function login(page: Page, listeners: Array<(res: unknown) => void>) {
  captureCsrf(page)
  listeners[0]({
    url: () => 'https://example.com/api/v1/auth/login',
    json: async () => ({ csrf_token: 'token' }),
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('request fixture cleanup', () => {
  it('deletes only fixtures created by the page with the captured CSRF token', async () => {
    const { page, listeners } = fakePage(42)
    await login(page, listeners)

    expect(await createRequestFixture(page, 'AuditCleanup')).toBe(42)
    expect(await cleanupRequestFixtures(page)).toEqual([])

    const deleteMock = (page as unknown as { request: { delete: ReturnType<typeof vi.fn> } }).request.delete
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(deleteMock.mock.calls[0][0]).toBe('/api/v1/admin/requests/42')
    expect(deleteMock.mock.calls[0][1]).toEqual({ headers: { 'x-csrf-token': 'token' } })
    expect(await cleanupRequestFixtures(page)).toEqual([])
  })

  it('returns ids whose delete fails or throws', async () => {
    const first = fakePage(1, async () => ({ ok: () => false }))
    await login(first.page, first.listeners)
    await createRequestFixture(first.page, 'FailDelete')
    expect(await cleanupRequestFixtures(first.page)).toEqual([1])

    const second = fakePage(2, async () => { throw new Error('network') })
    await login(second.page, second.listeners)
    await createRequestFixture(second.page, 'ThrowDelete')
    expect(await cleanupRequestFixtures(second.page)).toEqual([2])
  })

  it('does not delete fixtures owned by another page', async () => {
    const a = fakePage(101)
    const b = fakePage(202)
    await login(a.page, a.listeners)
    await login(b.page, b.listeners)
    await createRequestFixture(a.page, 'PageA')
    await createRequestFixture(b.page, 'PageB')

    expect(await cleanupRequestFixtures(a.page)).toEqual([])
    const bDelete = (b.page as unknown as { request: { delete: ReturnType<typeof vi.fn> } }).request.delete
    expect(bDelete).not.toHaveBeenCalled()
    expect(await cleanupRequestFixtures(b.page)).toEqual([])
    expect(bDelete).toHaveBeenCalledTimes(1)
  })
})
