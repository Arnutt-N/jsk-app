/**
 * Frontend mirror of backend app.core.permissions.PERMISSION_REGISTRY.
 *
 * The matrix UI (admin/settings/permissions) groups permission keys into
 * modules and offers per-module level presets (None / View / Edit / Manage).
 * Storage + enforcement stay per-key on the backend; "level" is purely a
 * presentation projection here — selecting level L checks exactly the keys
 * whose own level is <= L (see `keysForLevel`, mirroring `keys_for_level`).
 *
 * SYNC CONTRACT: this static registry must match the backend registry. The
 * page prefers the live registry served by GET /permissions and falls back
 * to this constant only when the API omits it; an integrity test
 * (permission-modules.test.ts) asserts the key set, module grouping, and
 * level tags here stay aligned with the backend's 19 keys (16 original +
 * 3 P1.2a access-gate keys).
 */

export const MODULE = {
  SERVICE_REQUESTS: 'service_requests',
  CHATBOT: 'chatbot',
  SYSTEM: 'system',
} as const

export type Module = (typeof MODULE)[keyof typeof MODULE]

/** Render order for module sections — matches the backend registry order. */
export const MODULE_ORDER: readonly Module[] = [
  MODULE.SERVICE_REQUESTS,
  MODULE.CHATBOT,
  MODULE.SYSTEM,
]

interface ModuleMeta {
  /** Thai section heading shown above each module's matrix. */
  labelTh: string
  /** One-line Thai helper text describing the module's scope. */
  descriptionTh: string
}

export const MODULE_META: Record<Module, ModuleMeta> = {
  service_requests: {
    labelTh: 'คำร้องบริการ',
    descriptionTh: 'การมอบหมาย รับเรื่อง แก้ไข และยกเลิกการอนุมัติคำร้อง',
  },
  chatbot: {
    labelTh: 'แชตบอต',
    descriptionTh: 'Broadcast ข้อความตอบกลับอัตโนมัติ Rich Menu และการส่งออกแชต',
  },
  system: {
    labelTh: 'ระบบและเครื่องมือ',
    descriptionTh: 'ผู้ใช้ ไฟล์ รายงาน Audit Log การตั้งค่าระบบ และเครื่องมือ',
  },
}

/**
 * Permission levels. 0 (None) means "no key in this module granted"; it is a
 * UI-only sentinel and is never served by the backend (which only tags real
 * keys with 1/2/3).
 */
export const LEVEL = {
  NONE: 0,
  VIEW: 1,
  EDIT: 2,
  MANAGE: 3,
} as const

export type PermissionLevel = (typeof LEVEL)[keyof typeof LEVEL]

/** A non-None level a real key can carry (what the backend serves). */
export type KeyLevel = 1 | 2 | 3

interface LevelMeta {
  labelTh: string
  /** Tailwind text/accent class for the level chip. */
  accent: string
}

export const LEVEL_META: Record<PermissionLevel, LevelMeta> = {
  0: { labelTh: 'ไม่มีสิทธิ์', accent: 'text-text-tertiary' },
  1: { labelTh: 'ดู', accent: 'text-sky-600' },
  2: { labelTh: 'แก้ไข', accent: 'text-amber-600' },
  3: { labelTh: 'จัดการ', accent: 'text-emerald-600' },
}

/** Metadata for one permission key — mirrors GET /permissions registry rows. */
export interface PermissionKeyMeta {
  key: string
  /** Thai label shown in the matrix. */
  label: string
  module: Module
  level: KeyLevel
}

/**
 * Static mirror of the backend registry (order-sensitive). Used as the
 * integrity-test source of truth and as a fallback when the API response
 * omits `registry`.
 */
export const PERMISSION_REGISTRY: readonly PermissionKeyMeta[] = [
  // Service Requests
  { key: 'edit_request_details', label: 'แก้ไขข้อมูลคำร้อง (รายละเอียด/ผู้ติดต่อ)', module: 'service_requests', level: 2 },
  { key: 'revert_approval', label: 'ยกเลิกการอนุมัติ', module: 'service_requests', level: 2 },
  { key: 'assign_request', label: 'มอบหมายงานให้ผู้อื่น', module: 'service_requests', level: 3 },
  { key: 'self_assign_request', label: 'รับเรื่องเอง (self-assign)', module: 'service_requests', level: 3 },
  // Chatbot
  { key: 'export_chat', label: 'ส่งออกประวัติแชต (CSV/PDF)', module: 'chatbot', level: 2 },
  { key: 'manage_broadcast', label: 'จัดการ Broadcast (สร้าง/แก้/ส่ง/ตั้งเวลา)', module: 'chatbot', level: 3 },
  { key: 'manage_auto_replies', label: 'จัดการข้อความตอบกลับอัตโนมัติ (intents/keywords/responses)', module: 'chatbot', level: 3 },
  { key: 'manage_rich_menus', label: 'จัดการ Rich Menu', module: 'chatbot', level: 3 },
  { key: 'manage_reply_objects', label: 'จัดการ Reply Objects', module: 'chatbot', level: 3 },
  // System & Utilities
  { key: 'view_reports', label: 'ดูรายงานและสถิติ', module: 'system', level: 1 },
  { key: 'view_audit_log', label: 'ดู Audit Log', module: 'system', level: 1 },
  { key: 'edit_settings', label: 'แก้ไขการตั้งค่าระบบ (credentials/integrations)', module: 'system', level: 2 },
  { key: 'image_resize', label: 'ใช้เครื่องมือ Image Resize', module: 'system', level: 2 },
  { key: 'manage_users', label: 'จัดการผู้ใช้ (สร้าง/แก้/ลบ/รีเซ็ตรหัสผ่าน)', module: 'system', level: 3 },
  { key: 'manage_files', label: 'จัดการไฟล์ (อัปโหลด/ลบ/ลิงก์สาธารณะ)', module: 'system', level: 3 },
  { key: 'edit_permission_settings', label: 'แก้ไขการตั้งค่าสิทธิ์', module: 'system', level: 3 },
  // P1.2a: Configurable auth gates (deps.py). admin/manager gates are
  // manage-level (escalation-sensitive); staff is view-level (front-line
  // access surface). Grouped under 'system'.
  { key: 'access_admin_endpoints', label: 'เข้าใช้งาน admin endpoints (gate เข้า settings UI)', module: 'system', level: 3 },
  { key: 'access_manager_endpoints', label: 'เข้าใช้งาน manager-level endpoints (request workflow)', module: 'system', level: 3 },
  { key: 'access_staff_endpoints', label: 'เข้าใช้งาน staff-level endpoints (live-chat HTTP)', module: 'system', level: 1 },
]

/** Every key the frontend expects the backend to define (drift guard). */
export const EXPECTED_PERMISSION_KEYS: readonly string[] = PERMISSION_REGISTRY.map((m) => m.key)

/**
 * Group a registry (live or static) by module, preserving each entry's
 * incoming order. Modules with no keys are still present (empty array).
 */
export function groupByModule(
  registry: readonly PermissionKeyMeta[],
): Record<Module, PermissionKeyMeta[]> {
  const grouped: Record<Module, PermissionKeyMeta[]> = {
    service_requests: [],
    chatbot: [],
    system: [],
  }
  for (const meta of registry) {
    if (meta.module in grouped) grouped[meta.module].push(meta)
  }
  return grouped
}

/**
 * Keys in `module` whose level is <= `level` (the level-preset math, mirror
 * of backend `keys_for_level`). `level <= 0` (None) yields an empty list.
 */
export function keysForLevel(
  registry: readonly PermissionKeyMeta[],
  module: Module,
  level: PermissionLevel,
): string[] {
  if (level <= LEVEL.NONE) return []
  return registry.filter((m) => m.module === module && m.level <= level).map((m) => m.key)
}

/**
 * Distinct non-None levels actually present in `module`, ascending. Drives
 * which preset options a module's level selector offers (e.g. chatbot has no
 * View-level key, so it offers None / Edit / Manage only).
 */
export function availableLevels(
  registry: readonly PermissionKeyMeta[],
  module: Module,
): KeyLevel[] {
  const levels = new Set<KeyLevel>()
  for (const m of registry) {
    if (m.module === module) levels.add(m.level)
  }
  return [...levels].sort((a, b) => a - b)
}

/**
 * Reverse projection: given the keys currently granted to a role within a
 * module, return the matching preset level, or 'custom' when the set does
 * not correspond to any clean preset. Returns the LOWEST matching level, so
 * an empty set maps to None even for modules whose View preset is also empty.
 */
export function levelForKeys(
  registry: readonly PermissionKeyMeta[],
  module: Module,
  checkedKeys: readonly string[],
): PermissionLevel | 'custom' {
  const moduleKeys = new Set(registry.filter((m) => m.module === module).map((m) => m.key))
  const checkedInModule = new Set(checkedKeys.filter((k) => moduleKeys.has(k)))

  const candidates: PermissionLevel[] = [LEVEL.NONE, ...availableLevels(registry, module)]
  for (const lvl of candidates) {
    const target = keysForLevel(registry, module, lvl)
    if (target.length === checkedInModule.size && target.every((k) => checkedInModule.has(k))) {
      return lvl
    }
  }
  return 'custom'
}
