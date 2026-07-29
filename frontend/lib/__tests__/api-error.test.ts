import { describe, it, expect, vi, afterEach } from 'vitest'
import { readErrorMessage, getHttpStatusMessage, isNetworkError, apiFetch } from '../api-error'

// Mock logger to avoid console output during tests
vi.mock('../logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('api-error utilities', () => {
  describe('readErrorMessage', () => {
    it('should extract detail from JSON response', async () => {
      const response = new Response(JSON.stringify({ detail: 'Custom error detail' }), {
        headers: { 'content-type': 'application/json' },
      })
      const message = await readErrorMessage(response, 'Fallback message')
      expect(message).toBe('Custom error detail')
    })

    it('should extract message from JSON response if detail is missing', async () => {
      const response = new Response(JSON.stringify({ message: 'Error message' }), {
        headers: { 'content-type': 'application/json' },
      })
      const message = await readErrorMessage(response, 'Fallback message')
      expect(message).toBe('Error message')
    })

    it('should extract error from JSON response if detail and message are missing', async () => {
      const response = new Response(JSON.stringify({ error: 'Error field' }), {
        headers: { 'content-type': 'application/json' },
      })
      const message = await readErrorMessage(response, 'Fallback message')
      expect(message).toBe('Error field')
    })

    it('should return plain text if content-type is not JSON', async () => {
      const response = new Response('Plain text error', {
        headers: { 'content-type': 'text/plain' },
      })
      const message = await readErrorMessage(response, 'Fallback message')
      expect(message).toBe('Plain text error')
    })

    it('should return fallback message if response body is empty', async () => {
      const response = new Response('', {
        headers: { 'content-type': 'application/json' },
      })
      const message = await readErrorMessage(response, 'Fallback message')
      expect(message).toBe('Fallback message')
    })
  })

  describe('getHttpStatusMessage', () => {
    it('should return correct Thai message for known status codes', () => {
      expect(getHttpStatusMessage(400)).toBe('คำขอไม่ถูกต้อง กรุณาตรวจสอบข้อมูลแล้วลองใหม่')
      expect(getHttpStatusMessage(401)).toBe('กรุณาเข้าสู่ระบบใหม่')
      expect(getHttpStatusMessage(403)).toBe('ไม่มีสิทธิ์ดำเนินการนี้')
      expect(getHttpStatusMessage(404)).toBe('ไม่พบข้อมูลที่ต้องการ')
      expect(getHttpStatusMessage(500)).toBe('เซิร์ฟเวอร์มีปัญหา กรุณาลองใหม่ภายหลัง')
    })

    it('should return generic message for unknown status codes', () => {
      expect(getHttpStatusMessage(418)).toBe('เกิดข้อผิดพลาด (418) กรุณาลองใหม่')
    })
  })

  describe('isNetworkError', () => {
    it('should return true for "Failed to fetch" TypeError', () => {
      const error = new TypeError('Failed to fetch')
      expect(isNetworkError(error)).toBe(true)
    })

    it('should return true for "Load failed" TypeError', () => {
      const error = new TypeError('Load failed')
      expect(isNetworkError(error)).toBe(true)
    })

    it('should return false for other TypeErrors', () => {
      const error = new TypeError('Something else went wrong')
      expect(isNetworkError(error)).toBe(false)
    })

    it('should return false for non-TypeError objects', () => {
      expect(isNetworkError(new Error('Failed to fetch'))).toBe(false)
      expect(isNetworkError('Failed to fetch')).toBe(false)
      expect(isNetworkError(null)).toBe(false)
    })
  })

  describe('apiFetch', () => {
    const originalFetch = global.fetch

    afterEach(() => {
      global.fetch = originalFetch
    })

    it('should return ok: true with data on successful response', async () => {
      const mockData = { id: 1, name: 'Test' }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
      })

      const result = await apiFetch<typeof mockData>('/api/test')
      expect(result).toEqual({ ok: true, data: mockData })
    })

    it('should return ok: false with status and message on failed response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        clone: () => ({
          json: async () => ({ detail: 'Not found' }),
        }),
        text: async () => 'Not found',
      })

      const result = await apiFetch('/api/test')
      expect(result).toEqual({
        ok: false,
        status: 404,
        message: 'Not found',
      })
    })

    it('should return network error message on "Failed to fetch"', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

      const result = await apiFetch('/api/test')
      expect(result).toEqual({
        ok: false,
        status: 0,
        message: 'ไม่สามารถเชื่อมต่อ Backend ได้ — กรุณาตรวจสอบว่า Backend เปิดอยู่',
      })
    })

    it('should return generic error message on unexpected error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Unexpected error'))

      const result = await apiFetch('/api/test')
      expect(result).toEqual({
        ok: false,
        status: 0,
        message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่',
      })
    })

    it('should prefix relative URLs with API_BASE', async () => {
      const mockData = { ok: true }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
      })

      await apiFetch('/admin/users')
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/admin/users',
        expect.anything(),
      )
    })

    it('should not prefix absolute URLs', async () => {
      const mockData = { ok: true }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
      })

      await apiFetch('https://example.com/api')
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.anything(),
      )
    })

    it('should auto-set Content-Type for string bodies', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      })

      await apiFetch('/test', { method: 'POST', body: JSON.stringify({ a: 1 }) })
      const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const headers = init.headers as Headers
      expect(headers.get('Content-Type')).toBe('application/json')
    })

    it('should not set Content-Type for FormData bodies', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      })

      const form = new FormData()
      form.append('file', 'x')
      await apiFetch('/test', { method: 'POST', body: form })
      const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const headers = init.headers as Headers
      expect(headers.get('Content-Type')).toBeNull()
    })

    it('should return raw Response when raw option is set', async () => {
      const mockResponse = { ok: true, blob: async () => new Blob() }
      global.fetch = vi.fn().mockResolvedValue(mockResponse)

      const result = await apiFetch<Response>('/test', { raw: true })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toBe(mockResponse)
      }
    })
  })
})