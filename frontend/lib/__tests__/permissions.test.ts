import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  capabilityOf,
  hasPermission,
  fetchMyPermissions,
  invalidatePermissionsCache,
  type MyPermissions,
} from '../permissions'

const baseFlags = {
  role: 'ADMIN',
  can_assign: true,
  can_self_assign: true,
  can_edit_permissions: true,
  can_revert_approval: true,
  can_edit_request_details: true,
}

function perms(capabilities?: Record<string, boolean>): MyPermissions {
  return { ...baseFlags, capabilities }
}

describe('capabilityOf', () => {
  it('returns false for null permissions', () => {
    expect(capabilityOf(null, 'manage_users')).toBe(false)
  })

  it('returns false when the capabilities map is absent', () => {
    expect(capabilityOf(perms(undefined), 'manage_users')).toBe(false)
  })

  it('reads a granted capability', () => {
    expect(capabilityOf(perms({ manage_users: true }), 'manage_users')).toBe(true)
  })

  it('reads a denied capability', () => {
    expect(capabilityOf(perms({ manage_users: false }), 'manage_users')).toBe(false)
  })

  it('unknown key falls back to false', () => {
    expect(capabilityOf(perms({ manage_users: true }), 'does_not_exist')).toBe(false)
  })
})

describe('hasPermission (session cache)', () => {
  beforeEach(() => invalidatePermissionsCache())
  afterEach(() => {
    invalidatePermissionsCache()
    vi.unstubAllGlobals()
  })

  it('returns false before any fetch populates the cache', () => {
    expect(hasPermission('manage_users')).toBe(false)
  })

  it('reflects the cached capability map after fetchMyPermissions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => perms({ manage_users: true, view_reports: false }),
      })),
    )

    await fetchMyPermissions(true)

    expect(hasPermission('manage_users')).toBe(true)
    expect(hasPermission('view_reports')).toBe(false)
    expect(hasPermission('unknown_key')).toBe(false)
  })

  it('clears once the cache is invalidated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => perms({ manage_users: true }) })),
    )

    await fetchMyPermissions(true)
    expect(hasPermission('manage_users')).toBe(true)

    invalidatePermissionsCache()
    expect(hasPermission('manage_users')).toBe(false)
  })
})
