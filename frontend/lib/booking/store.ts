import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  buildDateOptions,
  clipRangeWindow,
  fetchAvailability,
  fetchAvailabilityRange,
  type Availability,
  type DayAvailability,
} from '@/lib/booking'
import { API_BASE } from '@/lib/constants/api'
import { logger } from '@/lib/logger'

import { createDraftStore, type BookingDraft, type DraftAction } from './draft'

export interface BookingOptions {
  service_types: string[]
  advance_days: number
  blackout_dates: string[]
  /** Range cap the backend advertises; the local 62 is only the fallback. */
  max_range_days?: number
}

export type FetchStatus = 'idle' | 'loading' | 'ready' | 'failed'

export interface BookingStore {
  draft: BookingDraft
  dispatch: (action: DraftAction) => void
  options: BookingOptions | null
  dateOptions: string[]
  availability: Availability | null
  loadingSlots: boolean
  rangeInfo: Map<string, DayAvailability> | null
  error: string | null
  setError: (message: string | null) => void
  loadSlots: (service: string, date: string, opts?: { force?: boolean }) => Promise<void>
}

// A draft transition owns the fetched data it invalidates: a service change
// drops slots and the day strip, a date change drops slots, so a cleared
// section can never render a stale grid underneath.
function clearsSlots(action: DraftAction): boolean {
  return (
    action.type === 'draft/reset' ||
    action.type === 'service/set' ||
    action.type === 'date/set' ||
    (action.type === 'section/clear' &&
      (action.section === 'service' || action.section === 'date'))
  )
}

function clearsRange(action: DraftAction): boolean {
  return (
    action.type === 'draft/reset' ||
    action.type === 'service/set' ||
    (action.type === 'section/clear' && action.section === 'service')
  )
}

export function useBookingStore({
  idToken,
  confirmed,
}: {
  idToken: string | null
  confirmed: boolean
}): BookingStore {
  const [store] = useState(() => createDraftStore())
  const [draft, setDraft] = useState<BookingDraft>(() => store.getDraft())
  const [options, setOptions] = useState<BookingOptions | null>(null)
  const [rangeByDate, setRangeByDate] = useState<Map<string, DayAvailability> | null>(null)
  const [rangeStatus, setRangeStatus] = useState<FetchStatus>('idle')
  const [slots, setSlots] = useState<Availability | null>(null)
  const [slotsStatus, setSlotsStatus] = useState<FetchStatus>('idle')
  // Preselect fires once per service choice: a cleared date must stay
  // cleared instead of being re-picked behind the citizen's back. Only a
  // full reset re-arms it.
  const [preselected, setPreselected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Newest slot request wins; a slow superseded fetch must not overwrite the
  // current grid with another day's slots.
  const latestSlotKeyRef = useRef<string>('')

  const dispatch = useCallback(
    (action: DraftAction) => {
      setDraft(store.dispatch(action))
      if (action.type === 'draft/reset') setPreselected(null)
      if (clearsSlots(action)) {
        setSlots(null)
        setSlotsStatus('idle')
      }
      if (clearsRange(action)) {
        setRangeByDate(null)
        setRangeStatus('idle')
      }
    },
    [store],
  )

  const loadSlots = useCallback(
    async (service: string, date: string, { force = false } = {}) => {
      if (!idToken) return
      const key = `${service}|${date}`
      latestSlotKeyRef.current = key
      if (!force) {
        const cached = store.getSlots(key)
        if (cached) {
          setSlots(cached)
          setSlotsStatus('ready')
          return
        }
      }
      setSlotsStatus('loading')
      setError(null)
      try {
        const loaded = await fetchAvailability(idToken, service, date)
        store.setSlots(key, loaded)
        if (latestSlotKeyRef.current !== key) return
        setSlots(loaded)
        setSlotsStatus('ready')
      } catch (err) {
        logger.error('Failed to load availability:', err)
        if (latestSlotKeyRef.current !== key) return
        setError(err instanceof Error ? err.message : 'โหลดช่วงเวลาไม่สำเร็จ')
        setSlots(null)
        setSlotsStatus('failed')
      }
    },
    [idToken, store],
  )

  useEffect(() => {
    if (!idToken) return
    let cancelled = false
    const loadOptions = async () => {
      try {
        const res = await fetch(`${API_BASE}/liff/bookings/options`, {
          headers: { 'X-Liff-Id-Token': idToken },
        })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.detail ?? 'ระบบจองคิวยังไม่เปิดให้บริการ')
        }
        const loaded: BookingOptions = await res.json()
        if (cancelled) return
        setError(null)
        setOptions(loaded)
        const restored = store.getDraft().service
        if (restored && !loaded.service_types.includes(restored)) {
          dispatch({ type: 'section/clear', section: 'service' })
        } else if (!restored && loaded.service_types.length === 1) {
          dispatch({ type: 'service/set', service: loaded.service_types[0] })
        }
      } catch (err) {
        logger.error('Failed to load booking options:', err)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
        }
      }
    }
    void loadOptions()
    return () => {
      cancelled = true
    }
  }, [dispatch, idToken, store])

  const dateOptions = useMemo(() => {
    if (!options) return []
    return buildDateOptions(new Date(), options.advance_days, options.blackout_dates)
  }, [options])

  const service = draft.service

  useEffect(() => {
    if (!idToken || !service || confirmed || dateOptions.length === 0) return
    let cancelled = false
    setRangeStatus('loading')
    // The backend caps the window (max_range_days from /options; 62 is only
    // the fallback) and advance_days is admin-editable, so it can exceed the
    // cap — clip the request by calendar span from the first day. Chips
    // beyond the clip have no day info and stay enabled (fail-open).
    const clipped = clipRangeWindow(dateOptions, options?.max_range_days)
    const last = clipped[clipped.length - 1] ?? dateOptions[0]
    fetchAvailabilityRange(idToken, service, dateOptions[0], last)
      .then((range) => {
        if (cancelled) return
        setRangeByDate(new Map(range.days.map((day) => [day.date, day])))
        setRangeStatus('ready')
      })
      .catch((err) => {
        logger.error('Failed to load availability range:', err)
        if (cancelled) return
        setRangeByDate(null)
        setRangeStatus('failed')
      })
    return () => {
      cancelled = true
    }
  }, [confirmed, dateOptions, idToken, options, service])

  // The nearest bookable day loads itself, so the slot grid is already on
  // screen by the time the citizen looks for it.
  useEffect(() => {
    if (!service || draft.date || confirmed || dateOptions.length === 0) return
    if (rangeStatus !== 'ready' && rangeStatus !== 'failed') return
    if (preselected === service) return
    setPreselected(service)
    const firstBookable = dateOptions.find((iso) => {
      const info = rangeByDate?.get(iso)
      return Boolean(info?.is_open && info.remaining > 0)
    })
    const target = firstBookable ?? dateOptions[0]
    dispatch({ type: 'date/set', date: target })
    void loadSlots(service, target)
  }, [confirmed, dateOptions, dispatch, draft.date, loadSlots, preselected, rangeByDate, rangeStatus, service])

  // Cold open with a saved draft reloads its slots once; the idle → loading
  // transition is the guard, so no once-ref is needed.
  useEffect(() => {
    if (!idToken || !options || confirmed) return
    if (service && draft.date && slotsStatus === 'idle') {
      void loadSlots(service, draft.date)
    }
  }, [confirmed, draft.date, idToken, loadSlots, options, service, slotsStatus])

  return {
    draft,
    dispatch,
    options,
    dateOptions,
    availability: slots,
    loadingSlots: slotsStatus === 'loading',
    rangeInfo: rangeByDate,
    error,
    setError,
    loadSlots,
  }
}
