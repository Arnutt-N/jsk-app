'use client'

import { useState } from 'react'

import PageHeader from '@/app/admin/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useToast } from '@/components/ui/Toast'
import {
  useTaxonomyAdmin,
  type AdminCategory,
  type AdminTopic,
} from '@/hooks/useTaxonomyAdmin'
import { cn } from '@/lib/utils'

const NAME_REQUIRED_MESSAGE = 'กรุณากรอกชื่อ'
const ORDER_INVALID_MESSAGE = 'ลำดับต้องเป็นตัวเลข 0 ขึ้นไป'

function parseOrder(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isInteger(parsed) || parsed < 0) return null
  return parsed
}

interface PendingDelete {
  kind: 'category' | 'topic'
  id: number
  name: string
}

function TopicRow({
  topic,
  onUpdate,
  onAskDelete,
}: {
  topic: AdminTopic
  onUpdate: (id: number, patch: { name?: string; sort_order?: number; is_active?: boolean }) => Promise<string | null>
  onAskDelete: (target: PendingDelete) => void
}) {
  const [name, setName] = useState(topic.name)
  const [order, setOrder] = useState(String(topic.sort_order))
  const [active, setActive] = useState(topic.is_active)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const dirty =
    name.trim() !== topic.name ||
    order.trim() !== String(topic.sort_order) ||
    active !== topic.is_active

  const handleSave = async () => {
    if (!name.trim()) {
      setError(NAME_REQUIRED_MESSAGE)
      return
    }
    const sortOrder = parseOrder(order)
    if (sortOrder === null) {
      setError(ORDER_INVALID_MESSAGE)
      return
    }
    setSaving(true)
    setError(null)
    const failure = await onUpdate(topic.id, { name: name.trim(), sort_order: sortOrder, is_active: active })
    setSaving(false)
    if (failure) {
      setError(failure)
      return
    }
    toast({ title: 'บันทึกหัวข้อแล้ว', variant: 'success' })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="ชื่อหัวข้อ"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-w-40 flex-1"
        />
        <label className="flex items-center gap-1 text-xs text-text-secondary">
          ลำดับ
          <Input
            aria-label="ลำดับหัวข้อ"
            type="number"
            min={0}
            step={1}
            value={order}
            onChange={(event) => setOrder(event.target.value)}
            className="w-20"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-1 text-xs text-text-secondary">
          <input
            type="checkbox"
            aria-label="แสดงหัวข้อใน LIFF"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          แสดงใน LIFF
        </label>
        {!topic.is_active && <Badge variant="secondary">ปิดใช้งาน</Badge>}
        <Button size="sm" disabled={!dirty || saving} onClick={() => void handleSave()}>
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAskDelete({ kind: 'topic', id: topic.id, name: topic.name })}
        >
          ลบ
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

function AddTopicForm({ categoryId, onCreate }: { categoryId: number; onCreate: (input: { category_id: number; name: string; sort_order: number }) => Promise<string | null> }) {
  const [name, setName] = useState('')
  const [order, setOrder] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const handleAdd = async () => {
    if (!name.trim()) {
      setError(NAME_REQUIRED_MESSAGE)
      return
    }
    const sortOrder = parseOrder(order)
    if (sortOrder === null) {
      setError(ORDER_INVALID_MESSAGE)
      return
    }
    setSaving(true)
    setError(null)
    const failure = await onCreate({ category_id: categoryId, name: name.trim(), sort_order: sortOrder })
    setSaving(false)
    if (failure) {
      setError(failure)
      return
    }
    setName('')
    setOrder('0')
    toast({ title: 'เพิ่มหัวข้อแล้ว', variant: 'success' })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="ชื่อหัวข้อใหม่"
          placeholder="เพิ่มหัวข้อย่อย…"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-w-40 flex-1"
        />
        <Input
          aria-label="ลำดับหัวข้อใหม่"
          type="number"
          min={0}
          step={1}
          value={order}
          onChange={(event) => setOrder(event.target.value)}
          className="w-20"
        />
        <Button size="sm" variant="secondary" disabled={saving} onClick={() => void handleAdd()}>
          {saving ? 'กำลังเพิ่ม…' : 'เพิ่มหัวข้อ'}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

function CategoryCard({
  category,
  onUpdate,
  onUpdateTopic,
  onCreateTopic,
  onAskDelete,
}: {
  category: AdminCategory
  onUpdate: (id: number, patch: { name?: string; sort_order?: number; is_active?: boolean }) => Promise<string | null>
  onUpdateTopic: (id: number, patch: { name?: string; sort_order?: number; is_active?: boolean }) => Promise<string | null>
  onCreateTopic: (input: { category_id: number; name: string; sort_order: number }) => Promise<string | null>
  onAskDelete: (target: PendingDelete) => void
}) {
  const [name, setName] = useState(category.name)
  const [order, setOrder] = useState(String(category.sort_order))
  const [active, setActive] = useState(category.is_active)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const dirty =
    name.trim() !== category.name ||
    order.trim() !== String(category.sort_order) ||
    active !== category.is_active

  const handleSave = async () => {
    if (!name.trim()) {
      setError(NAME_REQUIRED_MESSAGE)
      return
    }
    const sortOrder = parseOrder(order)
    if (sortOrder === null) {
      setError(ORDER_INVALID_MESSAGE)
      return
    }
    setSaving(true)
    setError(null)
    const failure = await onUpdate(category.id, { name: name.trim(), sort_order: sortOrder, is_active: active })
    setSaving(false)
    if (failure) {
      setError(failure)
      return
    }
    toast({ title: 'บันทึกหมวดหมู่แล้ว', variant: 'success' })
  }

  return (
    <section className={cn('rounded-xl border border-border bg-card p-4', !category.is_active && 'opacity-80')}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="ชื่อหมวดหมู่"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-w-48 flex-1 font-semibold"
        />
        <label className="flex items-center gap-1 text-xs text-text-secondary">
          ลำดับ
          <Input
            aria-label="ลำดับหมวดหมู่"
            type="number"
            min={0}
            step={1}
            value={order}
            onChange={(event) => setOrder(event.target.value)}
            className="w-20"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-1 text-xs text-text-secondary">
          <input
            type="checkbox"
            aria-label="แสดงหมวดหมู่ใน LIFF"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          แสดงใน LIFF
        </label>
        {!category.is_active && <Badge variant="secondary">ปิดใช้งาน</Badge>}
        <Button size="sm" disabled={!dirty || saving} onClick={() => void handleSave()}>
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAskDelete({ kind: 'category', id: category.id, name: category.name })}
        >
          ลบ
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-3 flex flex-col gap-2">
        {category.topics.map((topic) => (
          <TopicRow
            key={`${topic.id}-${topic.name}-${topic.sort_order}-${topic.is_active}`}
            topic={topic}
            onUpdate={onUpdateTopic}
            onAskDelete={onAskDelete}
          />
        ))}
        <AddTopicForm categoryId={category.id} onCreate={onCreateTopic} />
      </div>
    </section>
  )
}

function AddCategoryForm({ onCreate }: { onCreate: (input: { name: string; sort_order: number }) => Promise<string | null> }) {
  const [name, setName] = useState('')
  const [order, setOrder] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const handleAdd = async () => {
    if (!name.trim()) {
      setError(NAME_REQUIRED_MESSAGE)
      return
    }
    const sortOrder = parseOrder(order)
    if (sortOrder === null) {
      setError(ORDER_INVALID_MESSAGE)
      return
    }
    setSaving(true)
    setError(null)
    const failure = await onCreate({ name: name.trim(), sort_order: sortOrder })
    setSaving(false)
    if (failure) {
      setError(failure)
      return
    }
    setName('')
    setOrder('0')
    toast({ title: 'เพิ่มหมวดหมู่แล้ว', variant: 'success' })
  }

  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="ชื่อหมวดหมู่ใหม่"
          placeholder="ชื่อหมวดหมู่ใหม่…"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-w-48 flex-1"
        />
        <label className="flex items-center gap-1 text-xs text-text-secondary">
          ลำดับ
          <Input
            aria-label="ลำดับหมวดหมู่ใหม่"
            type="number"
            min={0}
            step={1}
            value={order}
            onChange={(event) => setOrder(event.target.value)}
            className="w-20"
          />
        </label>
        <Button disabled={saving} onClick={() => void handleAdd()}>
          {saving ? 'กำลังเพิ่ม…' : 'เพิ่มหมวดหมู่'}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  )
}

export default function TaxonomyEditor() {
  const {
    categories,
    loading,
    loadError,
    refresh,
    createCategory,
    updateCategory,
    deleteCategory,
    createTopic,
    updateTopic,
    deleteTopic,
  } = useTaxonomyAdmin()
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    const failure =
      pendingDelete.kind === 'category'
        ? await deleteCategory(pendingDelete.id)
        : await deleteTopic(pendingDelete.id)
    setDeleting(false)
    if (failure) {
      toast({ title: 'ลบไม่สำเร็จ', description: failure, variant: 'error' })
      return
    }
    setPendingDelete(null)
    toast({ title: 'ลบแล้ว', variant: 'success' })
  }

  return (
    <div className="space-y-6 thai-text">
      <PageHeader
        title="หมวดหมู่บริการ"
        subtitle="จัดการหมวดหมู่และหัวข้อย่อยที่ LIFF และงานจองใช้อ้างอิงร่วมกัน — ลำดับกำหนดด้วยตัวเลข ยิ่งน้อยยิ่งขึ้นก่อน"
      />
      {loading ? (
        <div className="flex min-h-64 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-danger/40 bg-card p-6 text-center">
          <p className="text-sm text-text-primary">{loadError}</p>
          <Button variant="secondary" className="mt-4" onClick={() => void refresh()}>
            ลองใหม่
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <AddCategoryForm onCreate={createCategory} />
          {categories.length === 0 && (
            <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-text-secondary">
              ยังไม่มีหมวดหมู่ — เพิ่มหมวดหมู่แรกด้วยแบบฟอร์มด้านบน
            </p>
          )}
          {categories.map((category) => (
            <CategoryCard
              key={`${category.id}-${category.name}-${category.sort_order}-${category.is_active}-${category.topics.length}`}
              category={category}
              onUpdate={updateCategory}
              onUpdateTopic={updateTopic}
              onCreateTopic={createTopic}
              onAskDelete={setPendingDelete}
            />
          ))}
        </div>
      )}
      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
        title={pendingDelete?.kind === 'category' ? 'ลบหมวดหมู่นี้?' : 'ลบหัวข้อนี้?'}
        description={
          pendingDelete?.kind === 'category' ? (
            <>
              หมวดหมู่ <b>{pendingDelete?.name}</b> และหัวข้อย่อยทั้งหมดในหมวดหมู่นี้จะถูกลบถาวร
              หากต้องการซ่อนจากผู้ใช้ชั่วคราว ให้ปิด “แสดงใน LIFF” แทนการลบ
            </>
          ) : (
            <>
              หัวข้อ <b>{pendingDelete?.name}</b> จะถูกลบถาวร
              หากต้องการซ่อนจากผู้ใช้ชั่วคราว ให้ปิด “แสดงใน LIFF” แทนการลบ
            </>
          )
        }
        confirmText="ลบ"
        variant="danger"
        isLoading={deleting}
      />
    </div>
  )
}
