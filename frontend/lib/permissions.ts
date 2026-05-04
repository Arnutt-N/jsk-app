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

const API_BASE = '/api/v1'

export interface MyPermissions {
  role: string
  can_assign: boolean
  can_self_assign: boolean
  can_edit_permissions: boolean
}

export interface PermissionSummary {
  assign_allowed_roles: string[]
  self_assign_allowed_roles: string[]
  permission_settings_editor_roles: string[]
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

/** Force a fresh fetch -- call after a permission settings change is saved. */
export function invalidatePermissionsCache(): void {
  cachedMyPermissions = null
  inflight = null
}
