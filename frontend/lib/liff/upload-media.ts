import { SessionExpiredError } from './session-expired'

const LIFF_MEDIA_ENDPOINT = '/api/v1/liff/media'

// Uploads and the final service-request submission share one backend
// rate-limit bucket (liff-submit, 5 events / 300s). Capping attachments
// at 3 keeps 1 event of headroom so the submission itself cannot 429.
export const LIFF_MAX_ATTACHMENTS = 3

/**
 * Uploads a file to the LIFF media endpoint with the LIFF ID token attached
 * when present. Throws SessionExpiredError on 401; otherwise returns the raw
 * Response so each page keeps its own parsing/error handling.
 */
export async function uploadLiffMedia(file: File, idToken: string | null): Promise<Response> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(LIFF_MEDIA_ENDPOINT, {
    method: 'POST',
    headers: idToken ? { 'x-liff-id-token': idToken } : {},
    body: formData
  })

  if (res.status === 401) {
    throw new SessionExpiredError()
  }

  return res
}

/** Returns the Thai cap message when completed + in-flight uploads reached the limit, else null. */
export function attachmentCapMessage(completedCount: number, inflightCount = 0): string | null {
  return completedCount + inflightCount >= LIFF_MAX_ATTACHMENTS
    ? `แนบไฟล์ได้สูงสุด ${LIFF_MAX_ATTACHMENTS} ไฟล์`
    : null
}

/** Extracts a string `detail` field from an error response body; null when absent or non-JSON. */
export async function readErrorDetail(res: Response): Promise<string | null> {
  try {
    const body = await res.json()
    return typeof body?.detail === 'string' && body.detail ? body.detail : null
  } catch {
    return null
  }
}
