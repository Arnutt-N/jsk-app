import { describe, it, expect } from 'vitest';

import { isNavItemVisible } from '../nav-access';

// Role lists copied from app/admin/layout.tsx menuGroups so the test
// reflects the real nav config:
const SERVICE_REQUESTS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HEAD'];
const SYSTEM_ROLES = ['SUPER_ADMIN', 'ADMIN']; // System & Utilities stays admin-only in Phase 1

describe('isNavItemVisible', () => {
  it('shows items with no allowedRoles to everyone', () => {
    expect(isNavItemVisible('AGENT', undefined)).toBe(true);
    expect(isNavItemVisible(undefined, undefined)).toBe(true);
  });

  it('hides every gated item from the public USER role', () => {
    expect(isNavItemVisible('USER', SERVICE_REQUESTS_ROLES)).toBe(false);
    expect(isNavItemVisible('USER', SYSTEM_ROLES)).toBe(false);
  });

  it('hides gated items when there is no signed-in user', () => {
    expect(isNavItemVisible(undefined, SERVICE_REQUESTS_ROLES)).toBe(false);
    expect(isNavItemVisible(null, SYSTEM_ROLES)).toBe(false);
  });

  it('shows Service Requests to DIRECTOR and HEAD (Phase 1 fix)', () => {
    expect(isNavItemVisible('DIRECTOR', SERVICE_REQUESTS_ROLES)).toBe(true);
    expect(isNavItemVisible('HEAD', SERVICE_REQUESTS_ROLES)).toBe(true);
  });

  it('keeps System & Utilities hidden from DIRECTOR and HEAD', () => {
    expect(isNavItemVisible('DIRECTOR', SYSTEM_ROLES)).toBe(false);
    expect(isNavItemVisible('HEAD', SYSTEM_ROLES)).toBe(false);
  });

  it('shows both groups to ADMIN and SUPER_ADMIN', () => {
    for (const role of ['ADMIN', 'SUPER_ADMIN']) {
      expect(isNavItemVisible(role, SERVICE_REQUESTS_ROLES)).toBe(true);
      expect(isNavItemVisible(role, SYSTEM_ROLES)).toBe(true);
    }
  });

  it('hides Service Requests from AGENT (not in the allow-list)', () => {
    expect(isNavItemVisible('AGENT', SERVICE_REQUESTS_ROLES)).toBe(false);
  });
});
