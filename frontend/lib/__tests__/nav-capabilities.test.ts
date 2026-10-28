/**
 * F-031: navigation and page guards must follow the served permission matrix.
 *
 * The sidebar used to hardcode per-item role arrays while the real gates are
 * DB-configurable permission keys, so an admin editing Settings could not move
 * a menu. This pins the resolution rule the layout and PageAccessGuard share:
 *
 *   1. the role list still has to admit the caller (unchanged behaviour, and
 *      it is what decides while the capability map is still loading),
 *   2. when the item names a key, the capability map must grant it.
 */
import { describe, expect, it } from 'vitest';

import { capabilityOf, type MyPermissions } from '../permissions';
import { isNavItemVisible } from '../nav-access';

const viewPerms: MyPermissions = {
  role: 'VIEWER',
  can_assign: false,
  can_self_assign: false,
  can_edit_permissions: false,
  can_revert_approval: false,
  can_edit_request_details: false,
  capabilities: { manage_rich_menus: true, view_reports: false },
};

/** Mirrors isViewerPathAllowed in app/admin/layout.tsx. */
function viewerPathAllowed(pathname: string): boolean {
  if (
    [
      '/admin',
      '/admin/chatbot',
      '/admin/reports',
      '/admin/bookings',
      '/admin/reply-objects',
      '/admin/rich-menus',
      '/admin/canned-responses',
    ].includes(pathname)
  ) {
    return true;
  }
  if (pathname === '/admin/requests' || pathname === '/admin/requests/kanban') return true;
  return /^\/admin\/requests\/\d+$/.test(pathname);
}

/** The composed rule both the sidebar and PageAccessGuard apply. */
function itemVisible(
  role: string | undefined,
  allowedRoles: readonly string[] | undefined,
  capability: string | undefined,
  perms: MyPermissions | null,
  href?: string,
): boolean {
  if (!isNavItemVisible(role, allowedRoles)) return false;
  // VIEWER: path allow-list wins over the write-gating capability keys.
  if (role === 'VIEWER' && href) return viewerPathAllowed(href);
  if (!capability || !perms) return true;
  return capabilityOf(perms, capability);
}

describe('capability-driven navigation (F-031)', () => {
  it('hides an item the matrix does not grant, even when the role is allowed', () => {
    // VIEWER is in allowedRoles, but view_reports is false in the map.
    expect(itemVisible('VIEWER', ['SUPER_ADMIN', 'ADMIN', 'VIEWER'], 'view_reports', viewPerms)).toBe(false);
  });

  it('shows an item the matrix grants', () => {
    expect(
      itemVisible('VIEWER', ['SUPER_ADMIN', 'ADMIN', 'VIEWER'], 'manage_rich_menus', viewPerms),
    ).toBe(true);
  });

  it('falls back to the role list while the map is still loading', () => {
    // An unresolved map must not blank the sidebar on first paint.
    expect(itemVisible('ADMIN', ['SUPER_ADMIN', 'ADMIN'], 'manage_users', null)).toBe(true);
  });

  it('role gate still wins: a role outside the list never sees the item', () => {
    expect(itemVisible('AGENT', ['SUPER_ADMIN', 'ADMIN'], 'manage_users', null)).toBe(false);
  });

  it('items without a key keep the old role-only behaviour', () => {
    expect(itemVisible('VIEWER', ['SUPER_ADMIN', 'ADMIN', 'VIEWER'], undefined, viewPerms)).toBe(true);
    expect(itemVisible('AGENT', ['SUPER_ADMIN', 'ADMIN'], undefined, viewPerms)).toBe(false);
  });

  it('a capability granted but absent from the map is treated as denied (fail closed)', () => {
    expect(itemVisible('ADMIN', ['ADMIN'], 'manage_files', viewPerms)).toBe(false);
  });

  it('USER is never an admin surface', () => {
    expect(itemVisible('USER', ['USER'], undefined, viewPerms)).toBe(false);
  });

  it('the ADMIN baseline used by the existing nav stays visible', () => {
    // Guard against a refactor that silently hides menus admins had before.
    expect(itemVisible('ADMIN', ['SUPER_ADMIN', 'ADMIN'], 'manage_users', null)).toBe(true);
  });

  describe('VIEWER is a read-only observer', () => {
    const VIEWER_MENUS = [
      ['/admin', undefined],
      ['/admin/requests', undefined],
      ['/admin/bookings', undefined],
      ['/admin/chatbot', undefined],
      ['/admin/reply-objects', 'manage_reply_objects'],
      ['/admin/canned-responses', undefined],
      ['/admin/rich-menus', 'manage_rich_menus'],
      ['/admin/reports', 'view_reports'],
    ] as const;

    it.each(VIEWER_MENUS)('shows %s even when the write key is absent', (href, capability) => {
      // The backend opens these GETs via *_or_viewer and the path guard allows
      // the page, so hiding the menu would leave a reachable page with no way
      // in. The capability keys gate writes, not reads.
      const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'VIEWER'];
      expect(itemVisible('VIEWER', allowedRoles, capability, viewPerms, href)).toBe(true);
    });

    it('sees exactly eight menus', () => {
      const all = [
        '/admin', '/admin/requests', '/admin/bookings', '/admin/chatbot',
        '/admin/live-chat', '/admin/chat-histories', '/admin/chatbot/broadcast',
        '/admin/auto-replies', '/admin/reply-objects', '/admin/canned-responses',
        '/admin/rich-menus', '/admin/friends', '/admin/users', '/admin/access-requests',
        '/admin/files', '/admin/image-resize', '/admin/reports', '/admin/audit',
        '/admin/health', '/admin/settings', '/admin/design-system',
      ];
      const roles = ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HEAD', 'AGENT', 'VIEWER'];
      const visible = all.filter((href) => itemVisible('VIEWER', roles, undefined, viewPerms, href));
      expect(visible).toHaveLength(8);
    });

    it('never reaches a write sub-route', () => {
      for (const href of ['/admin/requests/create', '/admin/reply-objects/new', '/admin/rich-menus/new']) {
        expect(viewerPathAllowed(href)).toBe(false);
      }
    });

    it('a non-VIEWER role is unaffected by the viewer path list', () => {
      // ADMIN holding manage_rich_menus keeps the menu even though the path
      // rule is viewer-specific.
      const perms: MyPermissions = { ...viewPerms, role: 'ADMIN', capabilities: { manage_rich_menus: true } };
      expect(itemVisible('ADMIN', ['ADMIN'], 'manage_rich_menus', perms, '/admin/rich-menus')).toBe(true);
    });
  });
});
