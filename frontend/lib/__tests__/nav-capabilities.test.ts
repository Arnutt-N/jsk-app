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

/** The composed rule both the sidebar and PageAccessGuard apply. */
function itemVisible(
  role: string | undefined,
  allowedRoles: readonly string[] | undefined,
  capability: string | undefined,
  perms: MyPermissions | null,
): boolean {
  if (!isNavItemVisible(role, allowedRoles)) return false;
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
});
