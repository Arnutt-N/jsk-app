import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Image Resize',
}

/**
 * Placeholder route for the "Image Resize" utility (System and Utilities).
 *
 * Phase 2 ships only this stub so the new sidebar entry does not 404.
 * The real upload -> resize -> download tool (and its role-gating) lands in
 * Phase 5 (System & Utilities Features).
 */
export default function ImageResizePage() {
  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-text-primary">Image Resize</h1>
        <p className="text-text-secondary">ปรับขนาด/บีบอัดรูปภาพสำหรับใช้งานในระบบ</p>
      </header>
      <div className="rounded-2xl border border-dashed border-border-default bg-surface p-12 text-center">
        <p className="text-text-secondary">ฟีเจอร์นี้กำลังพัฒนา — จะเปิดใช้งานใน Phase 5</p>
      </div>
    </div>
  )
}
