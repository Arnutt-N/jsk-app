import { describe, it, expect } from 'vitest';

import { isNavItemVisible } from '../nav-access';

// Role lists copied from app/admin/layout.tsx menuGroups so the test
// reflects the real nav config. VIEWER (read-only observer) is listed
// on the 6 allowed menus only:
//   1. Dashboard, 2. Chatbot Overview, 3. Reports,
//   4. Manage Requests + Appointments, 5. Reply Objects + Rich Menus,
//   6. Canned Responses (view-only).
const DASHBOARD_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HEAD', 'VIEWER'];
const BOOKINGS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HEAD', 'AGENT', 'VIEWER'];
const CHATBOT_OVERVIEW_ROLES = ['SUPER_ADMIN', 'ADMIN', 'VIEWER'];
const REPORTS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'VIEWER'];
const REPLY_OBJECTS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'VIEWER'];
const RICH_MENUS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'VIEWER'];
const CANNED_ROLES = ['SUPER_ADMIN', 'ADMIN', 'VIEWER'];
const CLOSED_ROLES = ['SUPER_ADMIN', 'ADMIN']; // Broadcast, Live Chat, Users, Access Requests, Settings, Health, Design System, ...

const VIEWER_ALLOWED = [
  DASHBOARD_ROLES,
  BOOKINGS_ROLES,
  CHATBOT_OVERVIEW_ROLES,
  REPORTS_ROLES,
  REPLY_OBJECTS_ROLES,
  RICH_MENUS_ROLES,
  CANNED_ROLES,
];

describe('isNavItemVisible', () => {
  it('shows items with no allowedRoles to everyone', () => {
    expect(isNavItemVisible('AGENT', undefined)).toBe(true);
    expect(isNavItemVisible(undefined, undefined)).toBe(true);
  });

  it('hides every gated item from the public USER role', () => {
    expect(isNavItemVisible('USER', DASHBOARD_ROLES)).toBe(false);
    expect(isNavItemVisible('USER', CLOSED_ROLES)).toBe(false);
    expect(isNavItemVisible('USER', RICH_MENUS_ROLES)).toBe(false);
  });

  it('hides gated items when there is no signed-in user', () => {
    expect(isNavItemVisible(undefined, DASHBOARD_ROLES)).toBe(false);
    expect(isNavItemVisible(null, CLOSED_ROLES)).toBe(false);
  });

  it('shows Service Requests to DIRECTOR and HEAD (Phase 1 fix)', () => {
    expect(isNavItemVisible('DIRECTOR', DASHBOARD_ROLES)).toBe(true);
    expect(isNavItemVisible('HEAD', DASHBOARD_ROLES)).toBe(true);
  });

  it('keeps closed modules hidden from DIRECTOR and HEAD', () => {
    expect(isNavItemVisible('DIRECTOR', CLOSED_ROLES)).toBe(false);
    expect(isNavItemVisible('HEAD', CLOSED_ROLES)).toBe(false);
  });

  it('shows both groups to ADMIN and SUPER_ADMIN', () => {
    for (const role of ['ADMIN', 'SUPER_ADMIN']) {
      expect(isNavItemVisible(role, DASHBOARD_ROLES)).toBe(true);
      expect(isNavItemVisible(role, CLOSED_ROLES)).toBe(true);
    }
  });

  it('hides Service Requests from AGENT (not in the allow-list)', () => {
    expect(isNavItemVisible('AGENT', DASHBOARD_ROLES)).toBe(false);
  });

  it('shows VIEWER exactly the 6 allowed menus', () => {
    for (const roles of VIEWER_ALLOWED) {
      expect(isNavItemVisible('VIEWER', roles)).toBe(true);
    }
  });

  it('hides closed modules from VIEWER', () => {
    expect(isNavItemVisible('VIEWER', CLOSED_ROLES)).toBe(false);
  });
});
