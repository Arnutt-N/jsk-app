'use client'

import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

type LiffStatusBadgeProps =
  | { kind: 'business'; state: 'open' | 'loading'; className?: string }
  | { kind: 'connectivity'; state: 'online' | 'offline' | 'loading'; className?: string }

const BUSINESS_COPY = {
  open: { variant: 'success', text: 'เปิดรับจอง' },
  loading: { variant: 'warning', text: 'กำลังเชื่อมต่อ…' },
} as const

const CONNECTIVITY_COPY = {
  online: { variant: 'success', text: 'Online' },
  offline: { variant: 'danger', text: 'โหลดไม่สำเร็จ' },
  loading: { variant: 'warning', text: 'Connecting...' },
} as const

/** Shared LIFF header status. Business and connectivity never share one boolean. */
export default function LiffStatusBadge(props: LiffStatusBadgeProps) {
  const copy = props.kind === 'business' ? BUSINESS_COPY[props.state] : CONNECTIVITY_COPY[props.state]
  return (
    <Badge variant={copy.variant} className={cn('h-6', props.className)}>
      {copy.text}
    </Badge>
  )
}
