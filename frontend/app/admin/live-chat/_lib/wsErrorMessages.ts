/**
 * Thai translations for backend live-chat WebSocket error strings.
 *
 * The backend emits fixed English error texts (see ws_live_chat.py and
 * live_chat_service.py transfer constants); the operator UI is Thai. Keys must
 * match the backend strings exactly — unknown strings fall back to a generic
 * Thai message while the original is preserved in the console by callers.
 */
const EXACT_MESSAGES: Record<string, string> = {
  'No active session found': 'ไม่พบสายที่กำลังสนทนาอยู่',
  'Only the current operator can transfer the session':
    'เฉพาะเจ้าหน้าที่ที่ถือสายอยู่เท่านั้นที่โอนสายได้',
  'Cannot transfer to yourself': 'ไม่สามารถโอนสายให้ตัวเองได้',
  'Invalid target operator': 'เจ้าหน้าที่ปลายทางไม่ถูกต้อง',
  'Authentication required': 'ยังไม่ได้ยืนยันตัวตน กรุณาเข้าสู่ระบบใหม่',
  'Not in a room': 'ยังไม่ได้เลือกห้องสนทนา',
  'Message text required': 'กรุณาพิมพ์ข้อความก่อนส่ง',
  'Failed to send message': 'ส่งข้อความไม่สำเร็จ',
  'Message sent but confirmation failed — refresh instead of resending':
    'ข้อความถูกส่งถึงลูกค้าแล้ว แต่การยืนยันล้มเหลว — กรุณารีเฟรชหน้า อย่ากดส่งซ้ำ',
};

const FALLBACK_MESSAGE = 'การดำเนินการไลฟ์แชทไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

export function mapWsErrorToThai(message: string | null | undefined): string {
  if (!message) return FALLBACK_MESSAGE;
  return EXACT_MESSAGES[message] ?? FALLBACK_MESSAGE;
}
