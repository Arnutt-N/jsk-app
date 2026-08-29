import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  SESSION_EXPIRED_MESSAGE,
  SessionExpiredError,
  isSessionExpired
} from '../session-expired'
import { submitServiceRequest } from '../submit-service-request'
import { LIFF_MAX_ATTACHMENTS, attachmentCapMessage, readErrorDetail, uploadLiffMedia } from '../upload-media'

function jsonResponse(status: number): Response {
  return new Response(JSON.stringify({}), { status })
}

function jpegFile(): File {
  return new File(['fake-jpeg'], 'photo.jpg', { type: 'image/jpeg' })
}

describe('uploadLiffMedia', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('F1: POSTs multipart form data to /api/v1/liff/media with the id token header', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(200))
    const file = jpegFile()

    await uploadLiffMedia(file, 'tok-123')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/liff/media')
    expect(init?.method).toBe('POST')

    const headers = new Headers(init?.headers as HeadersInit)
    expect(headers.get('x-liff-id-token')).toBe('tok-123')
    // Browser must set the multipart boundary itself — a manual
    // Content-Type would corrupt the upload.
    expect(headers.get('Content-Type')).toBeNull()

    expect(init?.body).toBeInstanceOf(FormData)
    expect((init?.body as FormData).get('file')).toBe(file)
  })

  it('F1: omits the id token header when the token is null', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(200))

    await uploadLiffMedia(jpegFile(), null)

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers as HeadersInit)
    expect(headers.get('x-liff-id-token')).toBeNull()
  })

  it('F2: rejects with SessionExpiredError on 401', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(401))

    const err = await uploadLiffMedia(jpegFile(), 'tok').then(
      () => null,
      (e: unknown) => e
    )
    expect(err).toBeInstanceOf(SessionExpiredError)
    expect(isSessionExpired(err)).toBe(true)
    expect((err as Error).message).toBe(SESSION_EXPIRED_MESSAGE)
  })

  it('F2: both LIFF helpers reject with the same SessionExpiredError contract', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(jsonResponse(401))
    const uploadError = await uploadLiffMedia(jpegFile(), 'tok').then(
      () => null,
      (err: unknown) => err
    )

    fetchMock.mockResolvedValueOnce(jsonResponse(401))
    const submitError = await submitServiceRequest({ description: 'x' }, 'tok').then(
      () => null,
      (err: unknown) => err
    )

    expect(uploadError).toBeInstanceOf(SessionExpiredError)
    expect(submitError).toBeInstanceOf(SessionExpiredError)
    expect((uploadError as Error).message).toBe(SESSION_EXPIRED_MESSAGE)
    expect((submitError as Error).message).toBe(SESSION_EXPIRED_MESSAGE)
  })

  it('F4: attachment cap stays inside the shared liff-submit rate budget', () => {
    // Backend bucket: 5 events/300s shared by uploads and the final
    // submission. 3 uploads + 1 submission = 4 leaves headroom.
    expect(LIFF_MAX_ATTACHMENTS).toBe(3)
  })

  it('F3: resolves the raw Response on 200 so callers parse it themselves', async () => {
    const fetchMock = vi.mocked(fetch)
    const res = jsonResponse(200)
    fetchMock.mockResolvedValueOnce(res)

    await expect(uploadLiffMedia(jpegFile(), 'tok')).resolves.toBe(res)
  })
})

describe('attachmentCapMessage', () => {
  const expected = `แนบไฟล์ได้สูงสุด ${LIFF_MAX_ATTACHMENTS} ไฟล์`

  it('returns null while completed plus in-flight is below the cap', () => {
    expect(attachmentCapMessage(0)).toBeNull()
    expect(attachmentCapMessage(LIFF_MAX_ATTACHMENTS - 1, 0)).toBeNull()
    expect(attachmentCapMessage(0, LIFF_MAX_ATTACHMENTS - 1)).toBeNull()
    expect(attachmentCapMessage(1, 1)).toBeNull()
  })

  it('counts in-flight uploads toward the cap', () => {
    expect(attachmentCapMessage(LIFF_MAX_ATTACHMENTS - 1, 1)).toBe(expected)
    expect(attachmentCapMessage(1, LIFF_MAX_ATTACHMENTS - 1)).toBe(expected)
    expect(attachmentCapMessage(0, LIFF_MAX_ATTACHMENTS)).toBe(expected)
    expect(attachmentCapMessage(2, 2)).toBe(expected)
  })

  it('returns the Thai cap message when completed uploads alone hit the cap', () => {
    expect(attachmentCapMessage(LIFF_MAX_ATTACHMENTS)).toBe(expected)
    expect(attachmentCapMessage(LIFF_MAX_ATTACHMENTS + 1)).toBe(expected)
  })
})

describe('readErrorDetail', () => {
  it('returns the detail string from a JSON error body', async () => {
    const res = new Response(JSON.stringify({ detail: 'mime-not-allowed' }), { status: 400 })
    await expect(readErrorDetail(res)).resolves.toBe('mime-not-allowed')
  })

  it('returns null when detail is missing, non-string, or empty', async () => {
    await expect(readErrorDetail(new Response(JSON.stringify({}), { status: 400 }))).resolves.toBeNull()
    await expect(readErrorDetail(new Response(JSON.stringify({ detail: 42 }), { status: 400 }))).resolves.toBeNull()
    await expect(readErrorDetail(new Response(JSON.stringify({ detail: '' }), { status: 400 }))).resolves.toBeNull()
  })

  it('returns null for a non-JSON body instead of throwing', async () => {
    await expect(readErrorDetail(new Response('not-json', { status: 500 }))).resolves.toBeNull()
  })
})
