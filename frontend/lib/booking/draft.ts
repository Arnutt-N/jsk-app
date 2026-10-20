import type { Availability } from '@/lib/booking'

export interface BookingDraft {
  service: string | null
  date: string | null
  slotId: string | null
  prefix: string
  firstname: string
  lastname: string
  phoneNumber: string
  note: string
  email: string
  savedAt: number
}

export const EMPTY_DRAFT: BookingDraft = {
  service: null,
  date: null,
  slotId: null,
  prefix: '',
  firstname: '',
  lastname: '',
  phoneNumber: '',
  note: '',
  email: '',
  savedAt: 0,
}

export type DraftSection = 'service' | 'date' | 'slot' | 'contact'

export type DraftAction =
  | { type: 'service/set'; service: string | null }
  | { type: 'date/set'; date: string | null }
  | { type: 'slot/set'; slotId: string | null }
  | {
      type: 'contact/set'
      contact: { prefix?: string; firstname?: string; lastname?: string; phoneNumber?: string; note?: string; email?: string }
    }
  | { type: 'section/clear'; section: DraftSection }
  | { type: 'draft/reset' }

function clearSection(state: BookingDraft, section: DraftSection): BookingDraft {
  switch (section) {
    case 'service':
      return { ...state, service: null, date: null, slotId: null, note: '' }
    case 'date':
      return { ...state, date: null, slotId: null }
    case 'slot':
      return { ...state, slotId: null }
    case 'contact':
      return { ...state, prefix: '', firstname: '', lastname: '', phoneNumber: '', email: '' }
  }
}

export function draftReducer(state: BookingDraft, action: DraftAction): BookingDraft {
  switch (action.type) {
    case 'service/set': {
      if (action.service === state.service) return state
      return { ...state, service: action.service, date: null, slotId: null }
    }
    case 'date/set': {
      if (action.date === state.date && state.slotId === null) return state
      return { ...state, date: action.date, slotId: null }
    }
    case 'slot/set': {
      if (action.slotId === state.slotId) return state
      return { ...state, slotId: action.slotId }
    }
    case 'contact/set': {
      const next: BookingDraft = {
        ...state,
        prefix: action.contact.prefix ?? state.prefix,
        firstname: action.contact.firstname ?? state.firstname,
        lastname: action.contact.lastname ?? state.lastname,
        phoneNumber: action.contact.phoneNumber ?? state.phoneNumber,
        note: action.contact.note ?? state.note,
        email: action.contact.email ?? state.email,
      }
      if (
        next.prefix === state.prefix &&
        next.firstname === state.firstname &&
        next.lastname === state.lastname &&
        next.phoneNumber === state.phoneNumber &&
        next.note === state.note &&
        next.email === state.email
      ) {
        return state
      }
      return next
    }
    case 'section/clear': {
      const next = clearSection(state, action.section)
      if (
        next.service === state.service &&
        next.date === state.date &&
        next.slotId === state.slotId &&
        next.prefix === state.prefix &&
        next.firstname === state.firstname &&
        next.lastname === state.lastname &&
        next.phoneNumber === state.phoneNumber &&
        next.note === state.note &&
        next.email === state.email
      ) {
        return state
      }
      return next
    }
    case 'draft/reset': {
      return state === EMPTY_DRAFT ? state : { ...EMPTY_DRAFT }
    }
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

export const DRAFT_STORAGE_KEY = 'liff-booking-draft'
export const DRAFT_VERSION = 3
export const DRAFT_TTL_MS = 30 * 60 * 1000

export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function sessionStorageLike(): DraftStorage | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null
  return window.sessionStorage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isBookingDraft(value: unknown): value is BookingDraft {
  if (!isRecord(value)) return false
  return (
    (value.service === null || typeof value.service === 'string') &&
    (value.date === null || typeof value.date === 'string') &&
    (value.slotId === null || typeof value.slotId === 'string') &&
    typeof value.prefix === 'string' &&
    typeof value.firstname === 'string' &&
    typeof value.lastname === 'string' &&
    typeof value.phoneNumber === 'string' &&
    typeof value.note === 'string' &&
    typeof value.email === 'string' &&
    typeof value.savedAt === 'number'
  )
}

function isBookingDraftV2(value: unknown): value is Omit<BookingDraft, 'email'> {
  if (!isRecord(value)) return false
  return (
    (value.service === null || typeof value.service === 'string') &&
    (value.date === null || typeof value.date === 'string') &&
    (value.slotId === null || typeof value.slotId === 'string') &&
    typeof value.prefix === 'string' &&
    typeof value.firstname === 'string' &&
    typeof value.lastname === 'string' &&
    typeof value.phoneNumber === 'string' &&
    typeof value.note === 'string' &&
    typeof value.savedAt === 'number'
  )
}

export function loadDraft(
  storage: DraftStorage | null = sessionStorageLike(),
  now: number = Date.now(),
): BookingDraft {
  try {
    const raw = storage?.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return EMPTY_DRAFT
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return EMPTY_DRAFT
    let draft: unknown = parsed.draft
    if (parsed.version === 2 && isBookingDraftV2(parsed.draft)) {
      draft = { ...parsed.draft, email: '' }
    } else if (parsed.version !== DRAFT_VERSION) {
      return EMPTY_DRAFT
    }
    if (!isBookingDraft(draft)) return EMPTY_DRAFT
    if (!Number.isFinite(draft.savedAt)) return EMPTY_DRAFT
    if (now - draft.savedAt > DRAFT_TTL_MS) return EMPTY_DRAFT
    return draft
  } catch {
    return EMPTY_DRAFT
  }
}

export function saveDraft(
  draft: BookingDraft,
  storage: DraftStorage | null = sessionStorageLike(),
  now: number = Date.now(),
): void {
  try {
    storage?.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ version: DRAFT_VERSION, draft: { ...draft, savedAt: now } }),
    )
  } catch {
  }
}

export function clearStoredDraft(storage: DraftStorage | null = sessionStorageLike()): void {
  try {
    storage?.removeItem(DRAFT_STORAGE_KEY)
  } catch {
  }
}

export const SLOT_CACHE_TTL_MS = 60 * 1000

export interface SlotCache {
  get(key: string): Availability | null
  set(key: string, value: Availability): void
  clear(): void
}

export function createSlotCache(
  now: () => number = Date.now,
  ttlMs: number = SLOT_CACHE_TTL_MS,
): SlotCache {
  const entries = new Map<string, { value: Availability; expiresAt: number }>()
  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry) return null
      if (entry.expiresAt <= now()) {
        entries.delete(key)
        return null
      }
      return entry.value
    },
    set(key, value) {
      entries.set(key, { value, expiresAt: now() + ttlMs })
    },
    clear() {
      entries.clear()
    },
  }
}

export interface DraftStore {
  getDraft(): BookingDraft
  dispatch(action: DraftAction): BookingDraft
  getSlots(key: string): Availability | null
  setSlots(key: string, value: Availability): void
  reset(): BookingDraft
}

export function createDraftStore(options: {
  storage?: DraftStorage | null
  now?: number
} = {}): DraftStore {
  const storage = options.storage ?? sessionStorageLike()
  let state: BookingDraft = loadDraft(storage, options.now)
  const slots = createSlotCache()
  return {
    getDraft: () => state,
    dispatch: (action) => {
      const next = draftReducer(state, action)
      if (next === state) return state
      state = next
      if (action.type === 'draft/reset') slots.clear()
      saveDraft(state, storage)
      return state
    },
    getSlots: (key) => slots.get(key),
    setSlots: (key, value) => slots.set(key, value),
    reset: () => {
      state = { ...EMPTY_DRAFT }
      slots.clear()
      saveDraft(state, storage)
      return state
    },
  }
}
