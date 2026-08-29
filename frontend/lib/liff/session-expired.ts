export const SESSION_EXPIRED_MESSAGE =
  'เซสชัน LINE หมดอายุ กรุณาปิดหน้าต่างนี้แล้วเปิดฟอร์มใหม่จากเมนู LINE'

export class SessionExpiredError extends Error {
  constructor() {
    super(SESSION_EXPIRED_MESSAGE)
    this.name = 'SessionExpiredError'
  }
}

export function isSessionExpired(err: unknown): boolean {
  return err instanceof SessionExpiredError
}
