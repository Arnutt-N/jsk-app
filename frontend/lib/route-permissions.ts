/**
 * F-033: the single route→permission declaration for the admin area.
 *
 * Before this module the same authorization answer was written down three
 * times — `isViewerPathAllowed` plus `menuGroups[].allowedRoles` in
 * `app/admin/layout.tsx`, the `allowedRoles` prop on each `PageAccessGuard`,
 * and the backend gate — and they could disagree:
 *
 *   - `/admin` appeared in the sidebar for DIRECTOR/HEAD while its page guard
 *     listed only SUPER_ADMIN/ADMIN/VIEWER, so those two roles were redirected
 *     to the page they were already on and sat on a spinner forever.
 *   - `/admin/taxonomy` admitted AGENT at the page guard while its backend gate
 *     (KEY_MANAGE_TAXONOMY) grants SUPER_ADMIN/ADMIN only, so every call 403'd.
 *
 * The sidebar, `PageAccessGuard`, and the viewer allow-list all read this file
 * now. `capability` names a backend permission key from
 * `backend/app/core/permissions.py`; when present the served matrix must also
 * grant it (F-031), and the role list stays as the pre-load fallback.
 *
 * Pure data + pure functions: safe to import from client or server code.
 */

export type AdminRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'DIRECTOR'
  | 'HEAD'
  | 'AGENT'
  | 'VIEWER'

export const ALL_ADMIN_ROLES: readonly AdminRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'DIRECTOR',
  'HEAD',
  'AGENT',
  'VIEWER',
]

export interface AdminRouteMeta {
  /**
   * The route as written, or a `:param` pattern for a route family. Patterns
   * are matched after every literal path, so `/admin/requests/create` wins
   * over `/admin/requests/:id`.
   */
  path: string
  allowedRoles: readonly AdminRole[]
  /** Backend permission key that additionally gates this page (F-031). */
  capability?: string
  /**
   * Whether the sidebar renders this route. `false` for routes that exist but
   * are reached some other way (a link from another page, a detail URL).
   * Defaults to `true`.
   */
  nav?: boolean
}

// The workflow surfaces DIRECTOR/HEAD share with agents of the request pipeline.
const WORKFLOW_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'HEAD'] as const
const WORKFLOW_AND_VIEWER = [...WORKFLOW_ROLES, 'VIEWER'] as const
const ADMIN_ONLY = ['SUPER_ADMIN', 'ADMIN'] as const
const ADMIN_AND_VIEWER = ['SUPER_ADMIN', 'ADMIN', 'VIEWER'] as const

export const ADMIN_ROUTES = {
  dashboard: {
    path: '/admin',
    allowedRoles: WORKFLOW_AND_VIEWER,
  },
  requests: {
    path: '/admin/requests',
    allowedRoles: WORKFLOW_AND_VIEWER,
  },
  requestsKanban: {
    path: '/admin/requests/kanban',
    allowedRoles: WORKFLOW_AND_VIEWER,
    nav: false,
  },
  requestsDetail: {
    path: '/admin/requests/:id',
    allowedRoles: WORKFLOW_AND_VIEWER,
    nav: false,
  },
  requestsCreate: {
    // A form whose submit would 403 for VIEWER — never reachable by URL.
    path: '/admin/requests/create',
    allowedRoles: WORKFLOW_ROLES,
    nav: false,
  },
  bookings: {
    path: '/admin/bookings',
    allowedRoles: WORKFLOW_AND_VIEWER,
  },
  chatbot: {
    path: '/admin/chatbot',
    allowedRoles: ADMIN_AND_VIEWER,
  },
  liveChat: {
    path: '/admin/live-chat',
    allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'AGENT'],
    capability: 'access_live_chat',
  },
  chatHistories: {
    path: '/admin/chat-histories',
    allowedRoles: ADMIN_ONLY,
  },
  broadcast: {
    path: '/admin/chatbot/broadcast',
    allowedRoles: ADMIN_ONLY,
    capability: 'manage_broadcast',
  },
  autoReplies: {
    path: '/admin/auto-replies',
    allowedRoles: ADMIN_ONLY,
    capability: 'manage_auto_replies',
  },
  replyObjects: {
    path: '/admin/reply-objects',
    allowedRoles: ADMIN_AND_VIEWER,
    capability: 'manage_reply_objects',
  },
  cannedResponses: {
    path: '/admin/canned-responses',
    allowedRoles: ADMIN_AND_VIEWER,
  },
  richMenus: {
    path: '/admin/rich-menus',
    allowedRoles: ADMIN_AND_VIEWER,
    capability: 'manage_rich_menus',
  },
  friends: {
    path: '/admin/friends',
    allowedRoles: ADMIN_ONLY,
  },
  users: {
    path: '/admin/users',
    allowedRoles: ADMIN_ONLY,
    capability: 'manage_users',
  },
  accessRequests: {
    path: '/admin/access-requests',
    allowedRoles: ADMIN_ONLY,
  },
  files: {
    path: '/admin/files',
    allowedRoles: ADMIN_ONLY,
    capability: 'manage_files',
  },
  imageResize: {
    path: '/admin/image-resize',
    allowedRoles: ADMIN_ONLY,
    capability: 'image_resize',
  },
  reports: {
    path: '/admin/reports',
    allowedRoles: ADMIN_AND_VIEWER,
    capability: 'view_reports',
  },
  audit: {
    path: '/admin/audit',
    allowedRoles: ADMIN_ONLY,
    capability: 'view_audit_log',
  },
  health: {
    path: '/admin/health',
    allowedRoles: ADMIN_ONLY,
  },
  settings: {
    path: '/admin/settings',
    // The matrix editor is what opens this hub, so it follows that key (the
    // menu used the same key before this module existed — behaviour unchanged).
    allowedRoles: ADMIN_ONLY,
    capability: 'edit_permission_settings',
  },
  designSystem: {
    path: '/admin/design-system',
    allowedRoles: ADMIN_ONLY,
  },
  taxonomy: {
    // Reachable by URL only — no sidebar item. The backend gate
    // (KEY_MANAGE_TAXONOMY) is SUPER_ADMIN/ADMIN, so the page guard must not
    // promise AGENT a screen whose every call 403s.
    path: '/admin/taxonomy',
    allowedRoles: ADMIN_ONLY,
    capability: 'manage_taxonomy',
    nav: false,
  },
} as const satisfies Record<string, AdminRouteMeta>

export type AdminRouteKey = keyof typeof ADMIN_ROUTES

const ROUTE_LIST: readonly AdminRouteMeta[] = Object.values(ADMIN_ROUTES)

/** Literal routes, longest first, so `/admin` cannot shadow `/admin/requests`. */
const LITERAL_ROUTES = ROUTE_LIST.filter((r) => !r.path.includes('/:')).sort(
  (a, b) => b.path.length - a.path.length,
)

const DYNAMIC_ROUTES = ROUTE_LIST.filter((r) => r.path.includes('/:')).sort(
  (a, b) => b.path.length - a.path.length,
)

/**
 * Shape a named `:param` must match. Without this, `:id` accepted any segment,
 * so VIEWER reached `/admin/requests/<anything>` while the guard it replaced
 * required digits. A name with no entry accepts any non-empty segment, which
 * fails closed for a future route whose id is not numeric.
 */
const PARAM_SHAPES: Record<string, RegExp> = { id: /^\d+$/ }

function matchesDynamic(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split('/')
  const pathParts = pathname.split('/')
  if (patternParts.length !== pathParts.length) return false
  return patternParts.every((part, i) => {
    if (!part.startsWith(':')) return part === pathParts[i]
    const shape = PARAM_SHAPES[part.slice(1)]
    return shape ? shape.test(pathParts[i]) : pathParts[i] !== ''
  })
}

/** The manifest entry that owns `pathname`, or `undefined` when unlisted. */
export function routeFor(pathname: string): AdminRouteMeta | undefined {
  const exact = LITERAL_ROUTES.find((r) => r.path === pathname)
  if (exact) return exact
  return DYNAMIC_ROUTES.find((r) => matchesDynamic(r.path, pathname))
}

/**
 * Whether `role` may render `pathname`.
 *
 * Unlisted admin routes default to SUPER_ADMIN/ADMIN: a new page that nobody
 * has added to the manifest stays closed to the narrower roles rather than
 * silently opening to them.
 */
export function canAccessRoute(pathname: string, role: string | null | undefined): boolean {
  if (!role || role === 'USER') return false
  const route = routeFor(pathname)
  if (!route) return role === 'SUPER_ADMIN' || role === 'ADMIN'
  return (route.allowedRoles as readonly string[]).includes(role)
}

/** The role list that gates `pathname` (unlisted routes: SUPER_ADMIN/ADMIN). */
export function requiredRolesFor(pathname: string): readonly AdminRole[] {
  return routeFor(pathname)?.allowedRoles ?? ADMIN_ONLY
}

/** The backend permission key gating `pathname`, if it names one. */
export function capabilityFor(pathname: string): string | undefined {
  return routeFor(pathname)?.capability
}

/**
 * Whether the served capability map must also be consulted for `pathname`.
 *
 * The manifest's keys name backend gates that guard WRITES (`manage_rich_menus`
 * guards POST/PUT on `/admin/rich-menus`), while VIEWER is a read-only observer
 * whose reads those same pages serve through `*_or_viewer`. Consulting the key
 * for VIEWER would hide a page the backend and the path allow-list both open,
 * so the check is skipped for that one role. Keeping the rule here means the
 * sidebar and `PageAccessGuard` cannot disagree about it.
 */
export function capabilityAppliesTo(pathname: string, role: string | null | undefined): boolean {
  if (!capabilityFor(pathname)) return false
  return role !== 'VIEWER'
}