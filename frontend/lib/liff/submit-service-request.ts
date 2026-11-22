import { SessionExpiredError } from './session-expired'

const SERVICE_REQUEST_ENDPOINT = '/api/v1/liff/service-requests'

/**
 * Posts a service request to the LIFF endpoint with the LIFF ID token attached
 * when present. An optional submission id is sent as x-submission-id so a
 * retry with the same id replays the original case instead of creating a
 * duplicate. Throws SessionExpiredError on 401; otherwise returns the raw
 * Response so each page keeps its own parsing/error formatting.
 */
export async function submitServiceRequest<T extends object>(
  payload: T,
  idToken: string | null,
  submissionId?: string
): Promise<Response> {
  const res = await fetch(SERVICE_REQUEST_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { 'x-liff-id-token': idToken } : {}),
      ...(submissionId ? { 'x-submission-id': submissionId } : {})
    },
    body: JSON.stringify(payload)
  })

  if (res.status === 401) {
    throw new SessionExpiredError()
  }

  return res
}
