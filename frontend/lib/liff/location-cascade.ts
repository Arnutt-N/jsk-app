import type { District, SubDistrict } from '@/types/location'

/** Fetches the district list of a province via the Next.js rewrite proxy. */
export async function fetchDistricts(provinceId: number): Promise<District[]> {
  const res = await fetch(`/api/v1/locations/provinces/${provinceId}/districts`)
  if (!res.ok) {
    throw new Error(`ไม่สามารถโหลดรายชื่ออำเภอได้ (${res.status})`)
  }
  return res.json()
}

/** Fetches the sub-district list of a district via the Next.js rewrite proxy. */
export async function fetchSubDistricts(districtId: number): Promise<SubDistrict[]> {
  const res = await fetch(`/api/v1/locations/districts/${districtId}/sub-districts`)
  if (!res.ok) {
    throw new Error(`ไม่สามารถโหลดรายชื่อตำบลได้ (${res.status})`)
  }
  return res.json()
}
