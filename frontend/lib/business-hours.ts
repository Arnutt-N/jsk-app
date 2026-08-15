import { readErrorMessage } from '@/lib/api-error'
import { API_BASE } from '@/lib/constants/api'

export interface BusinessHoursDay {
  day_of_week: number
  is_open: boolean
  open_time: string
  close_time: string
}

const BASE = `${API_BASE}/admin/settings/business-hours`

export async function fetchBusinessHours(): Promise<BusinessHoursDay[]> {
  const res = await fetch(BASE)
  if (!res.ok) throw new Error(await readErrorMessage(res, 'ไม่สามารถโหลดเวลาทำการได้'))
  const data = await res.json()
  return data.days
}

export async function saveBusinessHours(
  days: BusinessHoursDay[],
): Promise<BusinessHoursDay[]> {
  const res = await fetch(BASE, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days }),
  })
  if (!res.ok) throw new Error(await readErrorMessage(res, 'บันทึกเวลาทำการไม่สำเร็จ'))
  const data = await res.json()
  return data.days
}
