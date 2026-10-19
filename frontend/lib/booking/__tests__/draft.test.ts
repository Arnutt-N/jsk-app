import { describe, expect, it } from 'vitest'
import type { Availability } from '@/lib/booking'
import {
  DRAFT_STORAGE_KEY,
  DRAFT_TTL_MS,
  DRAFT_VERSION,
  EMPTY_DRAFT,
  SLOT_CACHE_TTL_MS,
  createDraftStore,
  createSlotCache,
  draftReducer,
  loadDraft,
  saveDraft,
  type BookingDraft,
  type DraftStorage,
} from '../draft'

function memoryStorage(initial: Record<string, string> = {}): DraftStorage {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

function stored(rawDraft: unknown, version: unknown = DRAFT_VERSION): Record<string, string> {
  return { [DRAFT_STORAGE_KEY]: JSON.stringify({ version, draft: rawDraft }) }
}

const SAVED: BookingDraft = {
  service: 'ไกล่เกลี่ยระงับข้อพิพาท',
  date: '2026-09-02',
  slotId: '09:30:00',
  prefix: 'นาย',
  firstname: 'สมชาย',
  lastname: 'ใจดี',
  phoneNumber: '0812345678',
  note: 'มาก่อนเวลานัด',
  email: '',
  savedAt: 1_000_000,
}

const EMPTY_LITERAL = {
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

function slotPayload(): Availability {
  return {
    service_type: 'ไกล่เกลี่ยระงับข้อพิพาท',
    date: '2026-09-02',
    slots: [{ time: '09:30:00', capacity: 3, booked: 0, remaining: 3, is_full: false }],
  }
}

describe('loadDraft', () => {
  it('reads empty when nothing was stored', () => {
    expect(loadDraft(memoryStorage(), 1_000_000)).toEqual(EMPTY_LITERAL)
  })

  it('restores a fresh draft verbatim', () => {
    const storage = memoryStorage(stored(SAVED))
    expect(loadDraft(storage, SAVED.savedAt + 1_000)).toEqual(SAVED)
  })

  it('reads empty once the 30-minute TTL has passed', () => {
    const storage = memoryStorage(stored(SAVED))
    expect(loadDraft(storage, SAVED.savedAt + DRAFT_TTL_MS + 1)).toEqual(EMPTY_LITERAL)
  })

  it('reads empty on a version mismatch', () => {
    const storage = memoryStorage(stored(SAVED, DRAFT_VERSION + 1))
    expect(loadDraft(storage, SAVED.savedAt + 1_000)).toEqual(EMPTY_LITERAL)
  })

  it('ignores v1 drafts that still carry the single contactName string', () => {
    const legacy = {
      service: 'ปรึกษากฎหมาย',
      date: null,
      slotId: null,
      contactName: 'สมชาย ใจดี',
      phoneNumber: '',
      note: '',
      savedAt: 1_000_000,
    }
    const storage = memoryStorage(stored(legacy, 1))
    expect(loadDraft(storage, 1_001_000)).toEqual(EMPTY_LITERAL)
  })

  it('reads empty on corrupt JSON', () => {
    const storage = memoryStorage({ [DRAFT_STORAGE_KEY]: '{oops' })
    expect(loadDraft(storage, 1_000_000)).toEqual(EMPTY_LITERAL)
  })

  it('reads empty when the shape is wrong', () => {
    const bad = { ...SAVED, firstname: 42, savedAt: 'yesterday' }
    const storage = memoryStorage(stored(bad))
    expect(loadDraft(storage, 1_000_000)).toEqual(EMPTY_LITERAL)
  })

  it('never throws, even when storage itself throws', () => {
    const throwing: DraftStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadDraft(throwing, 1_000_000)).toEqual(EMPTY_LITERAL)
    expect(() => saveDraft(SAVED, throwing, 1_000_000)).not.toThrow()
  })
})

describe('saveDraft', () => {
  it('round-trips through load with a fresh timestamp', () => {
    const storage = memoryStorage()
    saveDraft(SAVED, storage, 2_000_000)
    expect(loadDraft(storage, 2_000_000)).toEqual({ ...SAVED, savedAt: 2_000_000 })
  })
})

describe('draftReducer', () => {
  it('sets the service and drops the dependent date and slot', () => {
    const next = draftReducer(SAVED, { type: 'service/set', service: 'แพ่ง' })
    expect(next).toEqual({ ...SAVED, service: 'แพ่ง', date: null, slotId: null })
  })

  it('sets the date and clears the slot but keeps the service', () => {
    const next = draftReducer(SAVED, { type: 'date/set', date: '2026-09-03' })
    expect(next).toEqual({ ...SAVED, date: '2026-09-03', slotId: null })
  })

  it('clears the contact section to blank strings and keeps the service-step note', () => {
    const next = draftReducer(SAVED, { type: 'section/clear', section: 'contact' })
    expect(next).toEqual({ ...SAVED, prefix: '', firstname: '', lastname: '', phoneNumber: '' })
  })

  it('clearing the date twice is a no-op the second time', () => {
    const once = draftReducer(SAVED, { type: 'section/clear', section: 'date' })
    expect(once).toEqual({ ...SAVED, date: null, slotId: null })
    expect(draftReducer(once, { type: 'section/clear', section: 'date' })).toBe(once)
  })

  it('clearing the service cascades to the date and slot and clears its note', () => {
    const next = draftReducer(SAVED, { type: 'section/clear', section: 'service' })
    expect(next).toEqual({ ...SAVED, service: null, date: null, slotId: null, note: '' })
  })

  it('resets to the empty draft', () => {
    expect(draftReducer(SAVED, { type: 'draft/reset' })).toEqual(EMPTY_DRAFT)
  })
})

describe('createSlotCache', () => {
  it('serves a stored day until the ~60s TTL expires', () => {
    let now = 1_000_000
    const cache = createSlotCache(() => now)
    cache.set('ส|2026-09-02', slotPayload())
    expect(cache.get('ส|2026-09-02')).toEqual(slotPayload())
    now += SLOT_CACHE_TTL_MS + 1
    expect(cache.get('ส|2026-09-02')).toBeNull()
  })
})

describe('createDraftStore', () => {
  it('restores the persisted draft synchronously on creation', () => {
    const store = createDraftStore({
      storage: memoryStorage(stored(SAVED)),
      now: SAVED.savedAt + 1_000,
    })
    expect(store.getDraft()).toEqual(SAVED)
  })

  it('reset empties the draft and clears the slot cache', () => {
    const store = createDraftStore({ storage: memoryStorage(), now: 1_000_000 })
    store.dispatch({ type: 'service/set', service: 'แพ่ง' })
    store.setSlots('แพ่ง|2026-09-02', slotPayload())
    store.reset()
    expect(store.getDraft()).toEqual(EMPTY_DRAFT)
    expect(store.getSlots('แพ่ง|2026-09-02')).toBeNull()
  })
})
