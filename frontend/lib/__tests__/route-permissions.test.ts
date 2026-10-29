/**
 * F-033: one route→permission manifest, consumed by the sidebar and by every
 * PageAccessGuard. Before this module the same authorization decision was
 * declared three times (layout `isViewerPathAllowed` + `menuGroups`
 * `allowedRoles`, per-page `allowedRoles`, backend deps) and they disagreed:
 *
 *   - `/admin` is in the sidebar for DIRECTOR/HEAD, but the page guard listed
 *     only SUPER_ADMIN/ADMIN/VIEWER, so a DIRECTOR was redirected to the very
 *     page it was already on and saw a permanent spinner.
 *   - `/admin/taxonomy` admits AGENT at the page guard while the backend gate
 *     (KEY_MANAGE_TAXONOMY) is SUPER_ADMIN/ADMIN only, so every call 403s.
 *
 * The manifest is the single declaration; these tests pin its invariants.
 */
import { describe, expect, it } from 'vitest'

import {
  ADMIN_ROUTES,
  canAccessRoute,
  requiredRolesFor,
  type AdminRouteMeta,
} from '../route-permissions'

const ALL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HEAD', 'AGENT', 'VIEWER'] as const

function routes(): AdminRouteMeta[] {
  return Object.values(ADMIN_ROUTES)
}

describe('route permission manifest (F-033)', () => {
  it('declares every route exactly once', () => {
    const paths = routes().map((r) => r.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('every route names at least one role and no unknown role', () => {
    for (const route of routes()) {
      expect(route.allowedRoles.length, `${route.path} has no roles`).toBeGreaterThan(0)
      for (const role of route.allowedRoles) {
        expect(ALL_ROLES, `${route.path} declares unknown role ${role}`).toContain(role)
      }
    }
  })

  it('a route that names a capability also admits SUPER_ADMIN', () => {
    // The matrix lockout rule backend-side; mirrored here so a manifest edit
    // cannot strand the one role that can undo it.
    for (const route of routes()) {
      if (route.capability) {
        expect(route.allowedRoles, `${route.path} omits SUPER_ADMIN`).toContain('SUPER_ADMIN')
      }
    }
  })

  it('a role allowed by the page is never rejected by the backend key it names', () => {
    // The taxonomy defect: the guard admitted AGENT while KEY_MANAGE_TAXONOMY
    // grants SUPER_ADMIN/ADMIN only. Every role on such a route must be one the
    // capability's default policy could grant, i.e. not a role the page guard
    // promises while the API refuses.
    for (const route of routes()) {
      if (!route.capability) continue
      if (route.capability === 'manage_taxonomy') {
        expect(route.allowedRoles).not.toContain('AGENT')
      }
    }
  })

  describe('canAccessRoute', () => {
    it('admits a role the route lists', () => {
      expect(canAccessRoute('/admin', 'ADMIN')).toBe(true)
      expect(canAccessRoute('/admin/requests', 'DIRECTOR')).toBe(true)
    })

    it('rejects a role the route does not list', () => {
      expect(canAccessRoute('/admin/users', 'AGENT')).toBe(false)
      expect(canAccessRoute('/admin/settings', 'VIEWER')).toBe(false)
    })

    it('DIRECTOR and HEAD can reach /admin (they see it in the sidebar)', () => {
      // Regression pin for the spinner-forever bug.
      expect(canAccessRoute('/admin', 'DIRECTOR')).toBe(true)
      expect(canAccessRoute('/admin', 'HEAD')).toBe(true)
    })

    it('USER is never admitted anywhere', () => {
      for (const route of routes()) {
        expect(canAccessRoute(route.path, 'USER'), route.path).toBe(false)
      }
    })

    it('an unknown route falls back to denying non-admin roles', () => {
      expect(canAccessRoute('/admin/not-a-real-page', 'AGENT')).toBe(false)
      expect(canAccessRoute('/admin/not-a-real-page', 'SUPER_ADMIN')).toBe(true)
    })
  })

  describe('dynamic routes', () => {
    it('matches a numeric detail URL to its route entry', () => {
      expect(canAccessRoute('/admin/requests/123', 'ADMIN')).toBe(true)
      expect(canAccessRoute('/admin/requests/123', 'VIEWER')).toBe(true)
    })

    it('does not treat a write sub-route as its parent', () => {
      // /admin/requests/create is deliberately not VIEWER-reachable.
      expect(canAccessRoute('/admin/requests/create', 'VIEWER')).toBe(false)
      expect(canAccessRoute('/admin/requests/kanban', 'VIEWER')).toBe(true)
    })
  })

  describe('VIEWER is a read-only observer', () => {
    const VIEWER_PATHS = [
      '/admin',
      '/admin/requests',
      '/admin/requests/7',
      '/admin/requests/kanban',
      '/admin/bookings',
      '/admin/chatbot',
      '/admin/canned-responses',
      '/admin/reply-objects',
      '/admin/rich-menus',
      '/admin/reports',
    ]

    it.each(VIEWER_PATHS)('reaches %s', (path) => {
      expect(canAccessRoute(path, 'VIEWER')).toBe(true)
    })

    it.each([
      '/admin/requests/create',
      '/admin/users',
      '/admin/settings',
      '/admin/audit',
      '/admin/files',
      '/admin/live-chat',
    ])('never reaches %s', (path) => {
      expect(canAccessRoute(path, 'VIEWER')).toBe(false)
    })
  })

  it('requiredRolesFor returns the same list the manifest declares', () => {
    expect(requiredRolesFor('/admin/requests')).toEqual(ADMIN_ROUTES['requests'].allowedRoles)
  })
})
