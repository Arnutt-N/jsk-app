export type CategoryReadiness = 'ready' | 'incomplete' | 'inactive';

export interface ReadinessInput {
  is_active: boolean;
  active_response_count: number;
}

/** เกณฑ์ serviceable ตรงกับ backend webhook.py:249 (is_active AND active_response_count > 0). */
export function getCategoryReadiness(cat: ReadinessInput): CategoryReadiness {
  if (!cat.is_active) return 'inactive';
  return cat.active_response_count > 0 ? 'ready' : 'incomplete';
}

/** คลาส Tailwind ของจุดสถานะ (dot). */
export function readinessDotClass(readiness: CategoryReadiness): string {
  switch (readiness) {
    case 'ready':
      return 'bg-success';
    case 'incomplete':
      return 'bg-warning';
    case 'inactive':
      return 'bg-border-hover';
  }
}

/** ป้ายกำกับสถานะ (ไทย) สำหรับ title/aria-label. */
export function readinessLabel(readiness: CategoryReadiness): string {
  switch (readiness) {
    case 'ready':
      return 'พร้อมใช้งาน';
    case 'incomplete':
      return 'เปิดอยู่แต่ยังไม่มีการตอบกลับที่เปิดใช้งาน';
    case 'inactive':
      return 'ปิดใช้งาน';
  }
}
