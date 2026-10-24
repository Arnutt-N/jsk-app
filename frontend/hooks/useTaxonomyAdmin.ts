'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { API_BASE } from '@/lib/constants/api'
import { getHttpStatusMessage } from '@/lib/api-error'
import { logger } from '@/lib/logger'

export interface AdminTopic {
  id: number
  category_id: number
  name: string
  sort_order: number
  is_active: boolean
}

export interface AdminCategory {
  id: number
  name: string
  sort_order: number
  is_active: boolean
  topics: AdminTopic[]
}

export interface CategoryInput {
  name: string
  sort_order: number
  is_active?: boolean
}

export interface CategoryPatch {
  name?: string
  sort_order?: number
  is_active?: boolean
}

export interface TopicInput {
  category_id: number
  name: string
  sort_order: number
  is_active?: boolean
}

export interface TopicPatch {
  category_id?: number
  name?: string
  sort_order?: number
  is_active?: boolean
}

const TAXONOMY_API = `${API_BASE}/admin/taxonomy`

const LOAD_FAILED_MESSAGE = 'โหลดหมวดหมู่ไม่สำเร็จ กรุณาลองใหม่'
const NOT_FOUND_MESSAGE = 'ไม่พบรายการนี้ อาจถูกลบไปแล้ว กรุณารีเฟรช'
const FORBIDDEN_MESSAGE = 'ไม่มีสิทธิ์จัดการหมวดหมู่ (ต้องได้รับสิทธิ์ manage_taxonomy)'

export const DUPLICATE_CATEGORY_MESSAGE =
  'ชื่อหมวดหมู่นี้มีอยู่แล้ว — หากรายการเดิมถูกปิดใช้งานอยู่ ให้เปิดใช้งานรายการเดิมแทนการสร้างใหม่'
export const DUPLICATE_TOPIC_MESSAGE =
  'ชื่อหัวข้อนี้มีอยู่ในหมวดหมู่แล้ว — หากรายการเดิมถูกปิดใช้งานอยู่ ให้เปิดใช้งานรายการเดิมแทนการสร้างใหม่'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseTopic(value: unknown): AdminTopic | null {
  if (!isRecord(value)) return null
  const { id, category_id, name, sort_order, is_active } = value
  if (typeof id !== 'number') return null
  if (typeof category_id !== 'number') return null
  if (typeof name !== 'string') return null
  if (typeof sort_order !== 'number') return null
  if (typeof is_active !== 'boolean') return null
  return { id, category_id, name, sort_order, is_active }
}

function parseCategory(value: unknown): AdminCategory | null {
  if (!isRecord(value)) return null
  const { id, name, sort_order, is_active, topics } = value
  if (typeof id !== 'number') return null
  if (typeof name !== 'string') return null
  if (typeof sort_order !== 'number') return null
  if (typeof is_active !== 'boolean') return null
  const parsedTopics: AdminTopic[] = []
  if (Array.isArray(topics)) {
    for (const item of topics) {
      const parsed = parseTopic(item)
      if (parsed) parsedTopics.push(parsed)
    }
  }
  return { id, name, sort_order, is_active, topics: parsedTopics }
}

function parseCategoryList(value: unknown): AdminCategory[] {
  if (!isRecord(value)) return []
  const { categories } = value
  if (!Array.isArray(categories)) return []
  const list: AdminCategory[] = []
  for (const item of categories) {
    const parsed = parseCategory(item)
    if (parsed) list.push(parsed)
  }
  return list
}

async function readDetail(response: Response): Promise<string | null> {
  try {
    const payload: unknown = await response.json()
    if (!isRecord(payload)) return null
    if (typeof payload.detail === 'string' && payload.detail.trim()) return payload.detail
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message
  } catch {
  }
  return null
}

function conflictMessage(scope: 'category' | 'topic'): string {
  return scope === 'category' ? DUPLICATE_CATEGORY_MESSAGE : DUPLICATE_TOPIC_MESSAGE
}

export function useTaxonomyAdmin() {
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const [showHidden, setShowHidden] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    setLoadError(null)
    try {
      const url = showHidden ? `${TAXONOMY_API}?include_inactive=true` : TAXONOMY_API
      const response = await fetch(url)
      if (!mountedRef.current) return
      if (response.ok) {
        setCategories(parseCategoryList(await response.json()))
        return
      }
      if (response.status === 403) {
        setCategories([])
        setLoadError(FORBIDDEN_MESSAGE)
        return
      }
      setCategories([])
      setLoadError(getHttpStatusMessage(response.status))
    } catch (error) {
      logger.error('Error loading taxonomy:', error)
      if (!mountedRef.current) return
      setCategories([])
      setLoadError(getErrorMessage(error) === 'เกิดข้อผิดพลาด กรุณาลองใหม่' ? LOAD_FAILED_MESSAGE : getErrorMessage(error))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [showHidden])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const mutate = useCallback(
    async (scope: 'category' | 'topic', url: string, method: string, body?: unknown): Promise<string | null> => {
      try {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        if (response.ok) {
          await refresh()
          return null
        }
        if (response.status === 409) return (await readDetail(response)) ?? conflictMessage(scope)
        if (response.status === 404) return NOT_FOUND_MESSAGE
        if (response.status === 403) return FORBIDDEN_MESSAGE
        const detail = await readDetail(response)
        return detail ?? getHttpStatusMessage(response.status)
      } catch (error) {
        logger.error('Error saving taxonomy:', error)
        return getHttpStatusMessage(0)
      }
    },
    [refresh],
  )

  const createCategory = useCallback(
    (input: CategoryInput): Promise<string | null> =>
      mutate('category', `${TAXONOMY_API}/categories`, 'POST', {
        name: input.name.trim(),
        sort_order: input.sort_order,
        is_active: input.is_active ?? true,
      }),
    [mutate],
  )

  const updateCategory = useCallback(
    (id: number, patch: CategoryPatch): Promise<string | null> => {
      const body: Record<string, unknown> = {}
      if (patch.name !== undefined) body.name = patch.name.trim()
      if (patch.sort_order !== undefined) body.sort_order = patch.sort_order
      if (patch.is_active !== undefined) body.is_active = patch.is_active
      return mutate('category', `${TAXONOMY_API}/categories/${id}`, 'PATCH', body)
    },
    [mutate],
  )

  const deleteCategory = useCallback(
    (id: number): Promise<string | null> =>
      mutate('category', `${TAXONOMY_API}/categories/${id}`, 'DELETE'),
    [mutate],
  )

  const createTopic = useCallback(
    (input: TopicInput): Promise<string | null> =>
      mutate('topic', `${TAXONOMY_API}/topics`, 'POST', {
        category_id: input.category_id,
        name: input.name.trim(),
        sort_order: input.sort_order,
        is_active: input.is_active ?? true,
      }),
    [mutate],
  )

  const updateTopic = useCallback(
    (id: number, patch: TopicPatch): Promise<string | null> => {
      const body: Record<string, unknown> = {}
      if (patch.category_id !== undefined) body.category_id = patch.category_id
      if (patch.name !== undefined) body.name = patch.name.trim()
      if (patch.sort_order !== undefined) body.sort_order = patch.sort_order
      if (patch.is_active !== undefined) body.is_active = patch.is_active
      return mutate('topic', `${TAXONOMY_API}/topics/${id}`, 'PATCH', body)
    },
    [mutate],
  )

  const deleteTopic = useCallback(
    (id: number): Promise<string | null> =>
      mutate('topic', `${TAXONOMY_API}/topics/${id}`, 'DELETE'),
    [mutate],
  )

  return {
    categories,
    loading,
    loadError,
    refresh,
    showHidden,
    setShowHidden,
    createCategory,
    updateCategory,
    deleteCategory,
    createTopic,
    updateTopic,
    deleteTopic,
  }
}
