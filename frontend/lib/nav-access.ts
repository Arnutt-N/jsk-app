/**
 * Pure visibility check for an admin sidebar nav item.
 *
 * Extracted from app/admin/layout.tsx so the role-gating rule can be
 * unit-tested without rendering the whole AdminShell. Behaviour mirrors
 * the original inline logic exactly:
 *   - No `allowedRoles` on the item => visible to everyone.
 *   - No user, or the public USER role => hidden (USER is never staff).
 *   - Otherwise visible iff the user's role is listed in `allowedRoles`.
 */
export function isNavItemVisible(
  userRole: string | undefined | null,
  allowedRoles?: readonly string[],
): boolean {
  if (!allowedRoles) {
    return true;
  }

  if (!userRole || userRole === 'USER') {
    return false;
  }

  return allowedRoles.includes(userRole);
}
