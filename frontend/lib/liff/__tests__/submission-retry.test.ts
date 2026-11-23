import { describe, expect, it } from 'vitest'

import { nextSubmissionAttempt, parseSubmitError } from '../submission-retry'

const payload = {
  description: 'รายละเอียดคำร้องทดสอบ',
  attachments: [{ id: '1', url: '/api/v1/media/1', name: 'a.png' }],
  line_user_id: 'U1',
}

describe('nextSubmissionAttempt', () => {
  it('keeps one id when a retry sends the same payload', () => {
    const attempt = nextSubmissionAttempt(null, payload)
    const retry = nextSubmissionAttempt(attempt, { ...payload })
    expect(retry.submissionId).toBe(attempt.submissionId)
  })

  it('does not reuse the id when sent payload changes', () => {
    const attempt = nextSubmissionAttempt(null, payload)
    const edited = nextSubmissionAttempt(attempt, {
      ...payload,
      description: 'รายละเอียดที่แก้ไขแล้ว',
    })
    expect(edited.submissionId).not.toBe(attempt.submissionId)
  })

  it('does not reuse the id when an attachment url changes', () => {
    const attempt = nextSubmissionAttempt(null, payload)
    const reattached = nextSubmissionAttempt(attempt, {
      ...payload,
      attachments: [{ ...payload.attachments[0], url: 'https://cdn.example/a.png' }],
    })
    expect(reattached.submissionId).not.toBe(attempt.submissionId)
  })

  it('starts a fresh id when a new case is requested', () => {
    const attempt = nextSubmissionAttempt(null, payload)
    const fresh = nextSubmissionAttempt(null, payload)
    expect(fresh.submissionId).not.toBe(attempt.submissionId)
  })
})

describe('parseSubmitError', () => {
  it('recognizes the machine-readable submission conflict code', () => {
    const parsed = parseSubmitError({
      detail: { code: 'SUBMISSION_PAYLOAD_CONFLICT', message: 'ข้อมูลไม่ตรง' },
    })
    expect(parsed.isSubmissionConflict).toBe(true)
    expect(parsed.message).toBe('ข้อมูลไม่ตรง')
  })

  it('does not flag other 409 details as submission conflicts', () => {
    expect(parseSubmitError({ detail: 'รหัสการส่งล้มเหลว' }).isSubmissionConflict).toBe(false)
    expect(parseSubmitError({ detail: { code: 'OTHER' } }).isSubmissionConflict).toBe(false)
  })
})
