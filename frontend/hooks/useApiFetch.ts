'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, type ApiFetchOptions } from '@/lib/api-error'

interface UseApiFetchState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useApiFetch<T = unknown>() {
  const [state, setState] = useState<UseApiFetchState<T>>({
    data: null,
    loading: false,
    error: null,
  })
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const execute = useCallback(
    async (url: string, init?: ApiFetchOptions): Promise<T | null> => {
      setState((s) => ({ ...s, loading: true, error: null }))
      const result = await apiFetch<T>(url, init)
      if (!mountedRef.current) return result.ok ? result.data : null
      if (result.ok) {
        setState({ data: result.data, loading: false, error: null })
        return result.data
      }
      setState((s) => ({ ...s, loading: false, error: result.message }))
      return null
    },
    [],
  )

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }))
  }, [])

  return { ...state, execute, clearError }
}
