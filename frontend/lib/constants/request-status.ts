/**
 * Source of truth for request lifecycle states across the admin UI.
 *
 * Backend enum (backend/app/models/service_request.py:RequestStatus):
 *   PENDING -> ACKNOWLEDGED -> IN_PROGRESS -> AWAITING_APPROVAL -> COMPLETED|REJECTED
 *
 * UI splits PENDING into two display labels based on assignment:
 *   PENDING + no assignee:  "รอมอบหมาย"   (awaiting supervisor assignment)
 *   PENDING + has assignee: "รอรับเรื่อง" (assigned, awaiting acknowledgement)
 *
 * Use `getStatusLabelForRequest(req)` to render the correct label for a row.
 * Use `getStatusLabel(status)` only when you do not have the full request
 * object (it returns the generic label and cannot disambiguate PENDING).
 */

export const REQUEST_STATUS = {
  PENDING: 'PENDING',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
} as const

export type RequestStatus = typeof REQUEST_STATUS[keyof typeof REQUEST_STATUS]

export type StatusVariant = 'warning' | 'info' | 'success' | 'danger' | 'gray' | 'primary'

interface StatusConfig {
  label: string
  variant: StatusVariant
  icon: string
}

/**
 * Display config keyed by enum value. PENDING uses "รอรับเรื่อง" as the
 * default label (covers the "assigned, awaiting ack" case which is the
 * most common). For unassigned PENDING use `getStatusLabelForRequest`.
 */
export const STATUS_CONFIG: Record<RequestStatus, StatusConfig> = {
  PENDING:           { label: 'รอรับเรื่อง',    variant: 'warning', icon: 'Clock' },
  ACKNOWLEDGED:      { label: 'รอดำเนินการ',   variant: 'warning', icon: 'Inbox' },
  IN_PROGRESS:       { label: 'กำลังดำเนินการ', variant: 'info',    icon: 'Play' },
  AWAITING_APPROVAL: { label: 'รออนุมัติ',      variant: 'primary', icon: 'ShieldCheck' },
  COMPLETED:         { label: 'เสร็จสิ้น',      variant: 'success', icon: 'CheckCircle2' },
  REJECTED:          { label: 'ปฏิเสธ',         variant: 'danger',  icon: 'AlertCircle' },
}

/**
 * Filter dropdown options. Includes the synthetic "AWAITING_ASSIGNMENT"
 * pseudo-status which maps to PENDING+no assignee on the backend (handled
 * by the list page when constructing query params).
 */
export const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '',                   label: 'ทุกสถานะ' },
  { value: 'AWAITING_ASSIGNMENT', label: 'รอมอบหมาย' },
  { value: 'PENDING',            label: 'รอรับเรื่อง' },
  { value: 'ACKNOWLEDGED',       label: 'รอดำเนินการ' },
  { value: 'IN_PROGRESS',        label: 'กำลังดำเนินการ' },
  { value: 'AWAITING_APPROVAL',  label: 'รออนุมัติ' },
  { value: 'COMPLETED',          label: 'เสร็จสิ้น' },
  { value: 'REJECTED',           label: 'ปฏิเสธ' },
]

/**
 * State machine: from each status, which transitions are allowed.
 * Used to disable workflow buttons that would create an invalid state.
 * (Backend should also validate, but frontend visually guides users.)
 */
export const STATUS_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  PENDING:           ['ACKNOWLEDGED', 'REJECTED'],
  ACKNOWLEDGED:      ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS:       ['AWAITING_APPROVAL', 'REJECTED', 'COMPLETED'],
  AWAITING_APPROVAL: ['COMPLETED', 'REJECTED', 'IN_PROGRESS'],
  // PRD B: revert-from-COMPLETED via the kebab "การจัดการพิเศษ" menu
  // (supervisor only, audit-logged in the backend update_request handler).
  COMPLETED:         ['AWAITING_APPROVAL', 'IN_PROGRESS'],
  REJECTED:          ['PENDING'],
}

export function canTransition(from: RequestStatus | null | undefined, to: RequestStatus): boolean {
  if (!from) return to === 'PENDING'
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

export function normalizeStatus(status: string | null | undefined): RequestStatus | undefined {
  if (!status) return undefined
  const upper = status.toUpperCase().replace(/ /g, '_') as RequestStatus
  return upper in REQUEST_STATUS ? upper : undefined
}

/**
 * Generic label lookup. Returns "รอรับเรื่อง" for PENDING (the assigned-
 * but-not-yet-acknowledged case). For the more accurate display that
 * differentiates "รอมอบหมาย" vs "รอรับเรื่อง", call `getStatusLabelForRequest`.
 */
export function getStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeStatus(status)
  return normalized ? STATUS_CONFIG[normalized].label : (status || '-')
}

export function getStatusVariant(status: string | null | undefined): StatusVariant {
  const normalized = normalizeStatus(status)
  return normalized ? STATUS_CONFIG[normalized].variant : 'gray'
}

export function getStatusIcon(status: string | null | undefined): string {
  const normalized = normalizeStatus(status)
  return normalized ? STATUS_CONFIG[normalized].icon : 'HelpCircle'
}

/**
 * Preferred label resolver -- splits PENDING into "รอมอบหมาย" vs
 * "รอรับเรื่อง" based on whether someone has been assigned yet.
 */
export interface RequestLike {
  status?: string | null
  assigned_agent_id?: number | null
}

export function getStatusLabelForRequest(req: RequestLike): string {
  const normalized = normalizeStatus(req.status)
  if (!normalized) {
    // null/empty status -- treat as freshly arrived, awaiting assignment
    return req.assigned_agent_id ? 'รอรับเรื่อง' : 'รอมอบหมาย'
  }
  if (normalized === 'PENDING') {
    return req.assigned_agent_id ? 'รอรับเรื่อง' : 'รอมอบหมาย'
  }
  return STATUS_CONFIG[normalized].label
}

export function getStatusVariantForRequest(req: RequestLike): StatusVariant {
  const normalized = normalizeStatus(req.status)
  if (!normalized) return 'gray'
  if (normalized === 'PENDING') {
    // Awaiting assignment is gray (not actionable); awaiting ack is warning
    return req.assigned_agent_id ? 'warning' : 'gray'
  }
  return STATUS_CONFIG[normalized].variant
}

export function getStatusIconForRequest(req: RequestLike): string {
  const normalized = normalizeStatus(req.status)
  if (!normalized) return req.assigned_agent_id ? 'Clock' : 'Hourglass'
  if (normalized === 'PENDING') {
    return req.assigned_agent_id ? 'Clock' : 'Hourglass'
  }
  return STATUS_CONFIG[normalized].icon
}

/**
 * Tailwind color classes for status badges/chips — includes dark mode variants.
 * Centralized here so the page doesn't scatter hardcoded bg-{color}-50 strings.
 */
export interface StatusColorSet {
  bg: string
  text: string
  ring: string
  dot: string
  border: string
}

export const STATUS_CHIP_COLORS: Record<RequestStatus, StatusColorSet> = {
  PENDING: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-200 dark:ring-amber-800',
    dot: 'bg-amber-500 dark:bg-amber-400',
    border: 'border-amber-400 dark:border-amber-700',
  },
  ACKNOWLEDGED: {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    text: 'text-orange-700 dark:text-orange-300',
    ring: 'ring-orange-200 dark:ring-orange-800',
    dot: 'bg-orange-500 dark:bg-orange-400',
    border: 'border-orange-400 dark:border-orange-700',
  },
  IN_PROGRESS: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    text: 'text-blue-700 dark:text-blue-300',
    ring: 'ring-blue-200 dark:ring-blue-800',
    dot: 'bg-blue-500 dark:bg-blue-400',
    border: 'border-blue-400 dark:border-blue-700',
  },
  AWAITING_APPROVAL: {
    bg: 'bg-violet-50 dark:bg-violet-950/30',
    text: 'text-violet-700 dark:text-violet-300',
    ring: 'ring-violet-200 dark:ring-violet-800',
    dot: 'bg-violet-500 dark:bg-violet-400',
    border: 'border-violet-400 dark:border-violet-700',
  },
  COMPLETED: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-200 dark:ring-emerald-800',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    border: 'border-emerald-400 dark:border-emerald-700',
  },
  REJECTED: {
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    text: 'text-rose-700 dark:text-rose-300',
    ring: 'ring-rose-200 dark:ring-rose-800',
    dot: 'bg-rose-500 dark:bg-rose-400',
    border: 'border-rose-400 dark:border-rose-700',
  },
}

export const PRIORITY_CHIP_COLORS: Record<string, StatusColorSet> = {
  URGENT: {
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    text: 'text-rose-700 dark:text-rose-300',
    ring: 'ring-rose-200 dark:ring-rose-800',
    dot: 'bg-rose-500 dark:bg-rose-400',
    border: 'border-rose-400 dark:border-rose-700',
  },
  HIGH: {
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    text: 'text-orange-700 dark:text-orange-300',
    ring: 'ring-orange-200 dark:ring-orange-800',
    dot: 'bg-orange-500 dark:bg-orange-400',
    border: 'border-orange-400 dark:border-orange-700',
  },
  MEDIUM: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    text: 'text-yellow-700 dark:text-yellow-300',
    ring: 'ring-yellow-200 dark:ring-yellow-800',
    dot: 'bg-yellow-500 dark:bg-yellow-400',
    border: 'border-yellow-400 dark:border-yellow-700',
  },
  LOW: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-200 dark:ring-emerald-800',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    border: 'border-emerald-400 dark:border-emerald-700',
  },
}
