import type { Metadata } from 'next'

import PageAccessGuard from '@/components/admin/PageAccessGuard'
import TaxonomyEditor from '@/components/admin/TaxonomyEditor'

export const metadata: Metadata = {
  title: 'หมวดหมู่บริการ',
  description: 'จัดการหมวดหมู่และหัวข้อย่อยที่ LIFF และงานจองใช้อ้างอิงร่วมกัน',
}

export default function TaxonomyAdminPage() {
  return (
    <PageAccessGuard>
      <TaxonomyEditor />
    </PageAccessGuard>
  )
}
