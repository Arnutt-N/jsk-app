/**
 * Bind a submission id to the exact payload that was sent.
 *
 * A lost first response can leave a saved case behind while the citizen edits
 * the form. Comparing the current form to the payload stored at send time
 * keeps an edited retry from reusing that id. An explicit new case clears both.
 */
export interface SubmissionAttempt<T> {
  submissionId: string
  payload: T
}

export function nextSubmissionAttempt<T extends object>(
  attempt: SubmissionAttempt<T> | null,
  payload: T
): SubmissionAttempt<T> {
  if (attempt && stableStringify(attempt.payload) === stableStringify(payload)) return attempt
  return { submissionId: crypto.randomUUID(), payload }
}


export function parseSubmitError(data: unknown): { message: string; isSubmissionConflict: boolean } {
  const detail = (data as { detail?: unknown } | null)?.detail
  const code =
    detail && typeof detail === 'object' && !Array.isArray(detail)
      ? (detail as { code?: unknown }).code
      : undefined
  const message =
    detail && typeof detail === 'object' && !Array.isArray(detail) && 'message' in detail
      ? String((detail as { message?: unknown }).message ?? 'Failed to submit')
      : typeof detail === 'string'
        ? detail
        : 'Failed to submit'
  return { message, isSubmissionConflict: code === 'SUBMISSION_PAYLOAD_CONFLICT' }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
