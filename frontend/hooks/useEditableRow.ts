'use client'

import { useState } from 'react'

import { useToast } from '@/components/ui/Toast'

const NAME_REQUIRED_MESSAGE = 'กรุณากรอกชื่อ'
const ORDER_INVALID_MESSAGE = 'ลำดับต้องเป็นตัวเลข 0 ขึ้นไป'

function parseOrder(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isInteger(parsed) || parsed < 0) return null
  return parsed
}

interface EditableRowInitial {
  name: string
  order: string
  active?: boolean
}

interface EditableRowInput {
  name: string
  sortOrder: number
  active: boolean
}

interface UseEditableRowOptions {
  initial: EditableRowInitial
  successTitle: string
  resetOnSuccess?: boolean
  onSave: (input: EditableRowInput) => Promise<string | null>
}

// Shared name/order/visibility form model behind every taxonomy row and
// add-form: the same five state atoms, the same Thai validation, and the
// same save → clear-or-toast choreography, so the four call sites in
// TaxonomyEditor stay thin label-and-callback wrappers.
export function useEditableRow({
  initial,
  successTitle,
  resetOnSuccess = false,
  onSave,
}: UseEditableRowOptions) {
  const [snapshot] = useState(initial)
  const [name, setName] = useState(initial.name)
  const [order, setOrder] = useState(initial.order)
  const [active, setActive] = useState(initial.active ?? true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const dirty =
    name.trim() !== snapshot.name ||
    order.trim() !== snapshot.order ||
    active !== (snapshot.active ?? true)

  const save = async (): Promise<void> => {
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
    const failure = await onSave({ name: name.trim(), sortOrder, active })
    setSaving(false)
    if (failure) {
      setError(failure)
      return
    }
    if (resetOnSuccess) {
      setName(snapshot.name)
      setOrder(snapshot.order)
    }
    toast({ title: successTitle, variant: 'success' })
  }

  return {
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
  }
}
