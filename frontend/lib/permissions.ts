/**
 * Frontend permission state.
 *
 * Wraps GET /api/v1/admin/settings/permissions/me so any component can
 * decide which workflow buttons to render. The result is cached for the
 * session (permissions only change when an admin edits Settings, which
 * is rare) -- consumers receive `null` until the first fetch resolves.
 *
 * Stage 2 will add a refresh mechanism after the Settings UI saves
 * permission changes; for now, page reload is sufficient.
 */
'use client'

import { useEffect, useState } from 'react'
import type { PermissionKeyMeta } from '@/lib/constants/permission-modules'

const API_BASE = '/api/v1'

export type { PermissionKeyMeta }

export interface MyPermissions {
  role: string
  can_assign: boolean
  can_self_assign: boolean
  can_edit_permissions: boolean
  can_revert_approval: boolean
  can_edit_request_details: boolean
  /**
   * Phase 3: effective capability map {key: bool} covering every registered
   * permission key. Optional so a pre-Phase-3 backend (no field) degrades to
   * `hasPermission` -> false rather than throwing.
   */
  capabilities?: Record<string, boolean>
}

/** A single editable permission rule, matches backend PermissionRule schema. */
export interface PermissionRule {
  key: string
  allowed_roles: string[]
  description: string | null
}

export interface PermissionSummary {
  assign_allowed_roles: string[]
  self_assign_allowed_roles: string[]
  permission_settings_editor_roles: string[]
  revert_approval_allowed_roles: string[]
  edit_request_details_allowed_roles: string[]
  /** Stage 2: full editable rule set; empty if backend pre-Stage-2. */
  rules?: PermissionRule[]
  /**
   * Phase 3: module/level metadata for the grouped matrix UI. Empty when the
   * backend predates Phase 3 — callers fall back to the static registry.
   */
  registry?: PermissionKeyMeta[]
}

let cachedMyPermissions: MyPermissions | null = null
let inflight: Promise<MyPermissions | null> | null = null

export async function fetchMyPermissions(force = false): Promise<MyPermissions | null> {
  if (cachedMyPermissions && !force) return cachedMyPermissions
  if (inflight && !force) return inflight

  inflight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/settings/permissions/me`)
      if (!res.ok) return null
      const data = (await res.json()) as MyPermissions
      cachedMyPermissions = data
      return data
    } catch {
      return null
    } finally {
      inflight = null
    }
  })()

  return inflight
}

export async function fetchPermissionSummary(): Promise<PermissionSummary | null> {
  try {
    const res = await fetch(`${API_BASE}/admin/settings/permissions`)
    if (!res.ok) return null
    return (await res.json()) as PermissionSummary
  } catch {
    return null
  }
}

export interface UpdatePermissionsResult {
  ok: boolean
  summary?: PermissionSummary
  error?: string
}

/**
 * PATCH the editable permission rules. Auto-invalidates the local
 * cache so the next usePermissions() read reflects the new policy.
 *
 * Backend rejects with 403 if the caller lacks `can_edit_permissions`,
 * 400 if any rule contains an unknown key/role, or if any rule's
 * allowed_roles omits SUPER_ADMIN (generalized lockout — every key).
 */
export async function updatePermissions(
  rules: PermissionRule[],
): Promise<UpdatePermissionsResult> {
  try {
    const res = await fetch(`${API_BASE}/admin/settings/permissions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: rules }),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      return { ok: false, error: errBody?.detail || `HTTP ${res.status}` }
    }
    const summary = (await res.json()) as PermissionSummary
    invalidatePermissionsCache()
    return { ok: true, summary }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

/**
 * React hook returning the current user's effective permissions.
 * Returns `null` while loading and on fetch error -- callers should
 * treat that as "no permissions" (hide privileged buttons).
 */
export function usePermissions(): MyPermissions | null {
  const [perms, setPerms] = useState<MyPermissions | null>(cachedMyPermissions)

  useEffect(() => {
    let cancelled = false
    fetchMyPermissions().then((p) => {
      if (!cancelled) setPerms(p)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return perms
}

/**
 * Resolve a capability from a permissions object. Missing/undefined map →
 * false (fail closed), so callers never accidentally render a privileged
 * control while permissions are still loading or absent.
 */
export function capabilityOf(perms: MyPermissions | null, key: string): boolean {
  return perms?.capabilities?.[key] ?? false
}

/**
 * Synchronous capability check against the session cache. Returns false until
 * the first fetchMyPermissions() resolves (or if the key is unknown) — use the
 * useHasPermission hook inside components so they re-render once it loads.
 */
export function hasPermission(key: string): boolean {
  return capabilityOf(cachedMyPermissions, key)
}

/**
 * React hook: whether the current user holds `key`. Re-renders when the
 * permissions fetch resolves. Returns false while loading / on error.
 */
export function useHasPermission(key: string): boolean {
  const perms = usePermissions()
  return capabilityOf(perms, key)
}

/** Force a fresh fetch -- call after a permission settings change is saved. */
export function invalidatePermissionsCache(): void {
  cachedMyPermissions = null
  inflight = null
}
