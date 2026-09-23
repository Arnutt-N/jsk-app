import { expect, it, vi } from 'vitest'
import { installAdminAuthFetchInterceptor } from '@/lib/authFetch'
import { setCsrfToken } from '@/lib/csrfStore'

declare global {
  interface Window {
    // eslint-disable-next-line no-var -- test-local global flag from authFetch
    var __JSK_ADMIN_AUTH_FETCH_INSTALLED__: boolean | undefined
  }
}

it('uses the installed cookie/CSRF transport for a resize upload', async () => {
  const oldFetch = window.fetch
  const oldInstalled = window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__
  const native = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response('{}', { status: 200 }))
  try {
    window.fetch = native as typeof window.fetch
    window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = false
    setCsrfToken('server-token')
    installAdminAuthFetchInterceptor()
    await window.fetch('/api/v1/admin/media/resize-ticket')
    const form = new FormData()
    form.append('ticket', 'test-ticket')
    form.append('file', new File(['x'], 'test.png', { type: 'image/png' }))
    await window.fetch('/api/v1/admin/media/resize', { method: 'POST', body: form })
    const [ticketUrl, ticketInit] = native.mock.calls[0]
    const [uploadUrl, uploadInit] = native.mock.calls[1]
    expect(ticketUrl).toBe('/api/v1/admin/media/resize-ticket')
    expect(ticketInit?.credentials).toBe('include')
    expect(uploadUrl).toBe('/api/v1/admin/media/resize')
    expect(uploadInit?.credentials).toBe('include')
    expect(new Headers(uploadInit?.headers).get('X-CSRF-Token')).toBe('server-token')
    expect(uploadInit?.body).toBe(form)
    expect(form.get('ticket')).toBe('test-ticket')
    expect(new Headers(uploadInit?.headers).has('Content-Type')).toBe(false)
    expect(native).toHaveBeenCalledTimes(2)
  } finally {
    setCsrfToken(null)
    window.fetch = oldFetch
    window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = oldInstalled
  }
})

it('uploadToMedia goes ticket → resize route, never the generic media route', async () => {
  // Hook-level routing test: drive the existing selectFile → resize flow with
  // mocked decoders, then uploadToMedia must call resize-ticket then resize.
  const oldFetch = window.fetch
  const oldInstalled = window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__
  const oldCreateObjectURL = URL.createObjectURL
  const oldRevokeObjectURL = URL.revokeObjectURL
  const calls: string[] = []
  const native = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(url)
    if (url.endsWith('/resize-ticket')) {
      return new Response(JSON.stringify({ ticket: 't-1', expires_in: 300 }), { status: 200 })
    }
    if (init?.body instanceof FormData) {
      // mirror the real backend: no generic media call should ever land here
      return new Response(JSON.stringify({ id: 'm-1' }), { status: 200 })
    }
    return new Response('{}', { status: 200 })
  })
  try {
    window.fetch = native as typeof window.fetch
    window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = false
    setCsrfToken('server-token')
    installAdminAuthFetchInterceptor()
    URL.createObjectURL = (() => 'blob:mock') as typeof URL.createObjectURL
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL

    vi.doMock('../image-utils', async () => {
      const actual = await vi.importActual<typeof import('../image-utils')>('../image-utils')
      return {
        ...actual,
        decodeDimensions: async () => ({ width: 100, height: 100 }),
        resizeImage: async () => new Blob(['img'], { type: 'image/png' }),
      }
    })

    const { renderHook, act } = await import('@testing-library/react')
    const { useImageResize } = await import('../use-image-resize')
    const toast = vi.fn()

    const { result } = renderHook(() => useImageResize({ toast }))
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'in.png', { type: 'image/png' })
    await act(async () => {
      await result.current.selectFile(png)
    })
    // let the debounced resize effect run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400))
    })
    await act(async () => {
      await result.current.uploadToMedia()
    })

    expect(calls).toContain('/api/v1/admin/media/resize-ticket')
    expect(calls.some((u) => u.endsWith('/api/v1/admin/media/resize'))).toBe(true)
    expect(calls.some((u) => u === '/api/v1/admin/media' || u.endsWith('/api/v1/admin/media?'))).toBe(false)
  } finally {
    vi.doUnmock('../image-utils')
    vi.resetModules()
    setCsrfToken(null)
    // jsdom lacks object-URL APIs — restore only what existed before
    if (oldCreateObjectURL) URL.createObjectURL = oldCreateObjectURL
    if (oldRevokeObjectURL) URL.revokeObjectURL = oldRevokeObjectURL
    window.fetch = oldFetch
    window.__JSK_ADMIN_AUTH_FETCH_INSTALLED__ = oldInstalled
  }
})