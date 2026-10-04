export function maskLineUserId(id: string | null | undefined): string {
  if (!id) return '-'
  if (id.length <= 6) return '＊'.repeat(6)
  return `${id[0]}${'＊'.repeat(id.length - 5)}${id.slice(-4)}`
}

// Roles entitled to full PII — mirrors the server policy
// (backend/app/core/pii_masking.py _FULL_PII_ROLES).
const FULL_PII_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

export function maskLineUserIdForRole(id: string | null | undefined, role: string | undefined): string {
  if (!id) return maskLineUserId(id)
  if (role && FULL_PII_ROLES.has(role)) return id
  return maskLineUserId(id)
}
