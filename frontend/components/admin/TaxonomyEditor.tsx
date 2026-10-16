'use client'

import { useState } from 'react'

import PageHeader from '@/app/admin/components/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useToast } from '@/components/ui/Toast'
import { useEditableRow } from '@/hooks/useEditableRow'
import {
  useTaxonomyAdmin,
  type AdminCategory,
  type AdminTopic,
  type CategoryPatch,
  type TopicPatch,
} from '@/hooks/useTaxonomyAdmin'
import { cn } from '@/lib/utils'

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
  onUpdate: (id: number, patch: TopicPatch) => Promise<string | null>
  onAskDelete: (target: PendingDelete) => void
}) {
  const {
    name,
    setName,
    order,
    setOrder,
    active,
    setActive,
    error,
    saving,
    dirty,
    save,
  } = useEditableRow({
    initial: { name: topic.name, order: String(topic.sort_order), active: topic.is_active },
    successTitle: 'บันทึกหัวข้อแล้ว',
    onSave: (input) =>
      onUpdate(topic.id, { name: input.name, sort_order: input.sortOrder, is_active: input.active }),
  })

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
        <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
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
  const { name, setName, order, setOrder, error, saving, save } = useEditableRow({
    initial: { name: '', order: '0' },
    successTitle: 'เพิ่มหัวข้อแล้ว',
    resetOnSuccess: true,
    onSave: (input) => onCreate({ category_id: categoryId, name: input.name, sort_order: input.sortOrder }),
  })

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
        <Button size="sm" variant="secondary" disabled={saving} onClick={() => void save()}>
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
  onUpdate: (id: number, patch: CategoryPatch) => Promise<string | null>
  onUpdateTopic: (id: number, patch: TopicPatch) => Promise<string | null>
  onCreateTopic: (input: { category_id: number; name: string; sort_order: number }) => Promise<string | null>
  onAskDelete: (target: PendingDelete) => void
}) {
  const {
    name,
    setName,
    order,
    setOrder,
    active,
    setActive,
    error,
    saving,
    dirty,
    save,
  } = useEditableRow({
    initial: { name: category.name, order: String(category.sort_order), active: category.is_active },
    successTitle: 'บันทึกหมวดหมู่แล้ว',
    onSave: (input) =>
      onUpdate(category.id, { name: input.name, sort_order: input.sortOrder, is_active: input.active }),
  })

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
        <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
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
  const { name, setName, order, setOrder, error, saving, save } = useEditableRow({
    initial: { name: '', order: '0' },
    successTitle: 'เพิ่มหมวดหมู่แล้ว',
    resetOnSuccess: true,
    onSave: (input) => onCreate({ name: input.name, sort_order: input.sortOrder }),
  })

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
        <Button disabled={saving} onClick={() => void save()}>
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
              หมวดหมู่ <b>{pendingDelete?.name}</b> ที่มีหัวข้อย่อยอยู่ไม่สามารถลบได้
              หากต้องการซ่อนจากผู้ใช้ ให้ปิด “แสดงใน LIFF” แทนการลบ
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
