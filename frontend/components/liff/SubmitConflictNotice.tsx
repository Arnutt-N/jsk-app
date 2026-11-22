'use client'

import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'

interface SubmitConflictNoticeProps {
  message: string
  onRecover: () => void
  onNewCase: () => void
}

export default function SubmitConflictNotice({
  message,
  onRecover,
  onNewCase,
}: SubmitConflictNoticeProps) {
  return (
    <Alert variant="warning" title="พบคำร้องที่ส่งไปแล้ว">
      <p>{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="soft" onClick={onRecover}>
          ตรวจสอบคำร้องเดิม
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onNewCase}>
          ส่งคำร้องใหม่
        </Button>
      </div>
    </Alert>
  )
}
