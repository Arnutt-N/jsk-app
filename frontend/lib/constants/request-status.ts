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
  IN_PROGRESS:       { label: 'กำลังดำเนินการ', variant: 'info',    icon: 'Eye' },
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
  COMPLETED:         [],
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
