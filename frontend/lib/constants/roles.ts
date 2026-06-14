/**
 * Source of truth for user-role identity across the admin UI.
 *
 * Backend enum (backend/app/models/user.py:UserRole) — DO NOT rename values:
 *   SUPER_ADMIN, ADMIN, DIRECTOR, HEAD, AGENT, USER
 *
 * Display policy (Phase 2 rename):
 *   - AGENT's English label is "Operator" (it was mislabeled "Staff").
 *   - "Staff" is a COLLECTIVE term for all internal (non-USER) roles, never
 *     the label of one role. Use STAFF_ROLES / isStaffRole for that concept.
 *   - Thai job titles are preserved (เจ้าหน้าที่, ผู้อำนวยการ, หัวหน้าฝ่าย).
 */

export const ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  DIRECTOR: 'DIRECTOR',
  HEAD: 'HEAD',
  AGENT: 'AGENT',
  USER: 'USER',
} as const

export type Role = typeof ROLE[keyof typeof ROLE]
export type RoleBadgeVariant = 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'gray'

interface RoleMeta {
  /** Canonical display name. AGENT = "Operator". */
  label: string
  /** Thai job title for Thai-context surfaces. */
  labelTh: string
  /** Badge color variant (mirrors the users-page Badge variants). */
  badge: RoleBadgeVariant
}

export const ROLE_META: Record<Role, RoleMeta> = {
  SUPER_ADMIN: { label: 'Super Admin', labelTh: 'ผู้ดูแลระบบสูงสุด', badge: 'primary' },
  ADMIN:       { label: 'Admin',       labelTh: 'แอดมิน',            badge: 'info'    },
  DIRECTOR:    { label: 'Director',    labelTh: 'ผู้อำนวยการ',        badge: 'danger'  },
  HEAD:        { label: 'Head',        labelTh: 'หัวหน้าฝ่าย',        badge: 'warning' },
  AGENT:       { label: 'Operator',    labelTh: 'เจ้าหน้าที่',         badge: 'success' },
  USER:        { label: 'User',        labelTh: 'ผู้ใช้ทั่วไป',        badge: 'gray'    },
}

/** Internal (non-public) roles — the collective "Staff". USER excluded. */
export const STAFF_ROLES: readonly Role[] = [
  ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.DIRECTOR, ROLE.HEAD, ROLE.AGENT,
]

function normalizeRole(role: string | null | undefined): Role | undefined {
  if (!role) return undefined
  const upper = role.toUpperCase()
  return upper in ROLE_META ? (upper as Role) : undefined
}

/** Display/English label. AGENT -> "Operator". Falls back to the raw value. */
export function getRoleLabel(role: string | null | undefined): string {
  const r = normalizeRole(role)
  return r ? ROLE_META[r].label : (role || '-')
}

/** Thai job-title label for Thai-context surfaces. */
export function getRoleLabelTh(role: string | null | undefined): string {
  const r = normalizeRole(role)
  return r ? ROLE_META[r].labelTh : (role || '-')
}

/** Combined "Operator (เจ้าหน้าที่)" form for option/select lists. */
export function getRoleOptionLabel(role: string | null | undefined): string {
  const r = normalizeRole(role)
  if (!r) return role || '-'
  return `${ROLE_META[r].label} (${ROLE_META[r].labelTh})`
}

export function getRoleBadgeVariant(role: string | null | undefined): RoleBadgeVariant {
  const r = normalizeRole(role)
  return r ? ROLE_META[r].badge : 'gray'
}

export function isStaffRole(role: string | null | undefined): boolean {
  const r = normalizeRole(role)
  return r ? STAFF_ROLES.includes(r) : false
}
