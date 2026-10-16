/**
 * Service adapter: groups backend free-text `service_types` under the
 * TOPIC_OPTIONS taxonomy so the booking dropdown renders grouped options.
 * Anything the taxonomy does not know falls to "อื่นๆ" instead of breaking.
 * Unknown input never throws; it just lands in "อื่นๆ" or is skipped.
 */
import { TOPIC_OPTIONS } from '@/lib/constants/categories'

export interface ServiceOption {
  /** Exact backend string, sent back verbatim on submit. */
  value: string
  /** Trimmed display label. */
  label: string
  /** TOPIC_OPTIONS category key, or UNKNOWN_SERVICE_CATEGORY. */
  category: string
}

export interface ServiceGroup {
  category: string
  options: ServiceOption[]
}

export const UNKNOWN_SERVICE_CATEGORY = 'อื่นๆ'

/** The taxonomy categories, in definition order. */
export function topicCategories(): string[] {
  return Object.keys(TOPIC_OPTIONS)
}

/** Classify one backend string under its taxonomy category. */
export function categorizeService(value: unknown): string {
  if (typeof value !== 'string') return UNKNOWN_SERVICE_CATEGORY
  const name = value.trim()
  if (!name) return UNKNOWN_SERVICE_CATEGORY
  // The shared "อื่นๆ" sub-label sits under five categories at once, so no
  // parent owns it; a backend string with that literal meaning is itself other.
  if (name === UNKNOWN_SERVICE_CATEGORY) return UNKNOWN_SERVICE_CATEGORY
  if (TOPIC_OPTIONS[name] !== undefined) return name
  for (const [category, topics] of Object.entries(TOPIC_OPTIONS)) {
    if (topics.includes(name)) return category
  }
  return UNKNOWN_SERVICE_CATEGORY
}

/**
 * Bucket backend strings into one group per taxonomy category (in
 * definition order) plus a trailing "อื่นๆ" group. Known categories stay
 * present even when empty so coverage over the taxonomy is structural.
 */
export function buildServiceGroups(serviceTypes: readonly unknown[]): ServiceGroup[] {
  const buckets = new Map<string, ServiceOption[]>()
  for (const category of topicCategories()) buckets.set(category, [])
  const others: ServiceOption[] = []
  for (const raw of serviceTypes) {
    if (typeof raw !== 'string') continue
    const name = raw.trim()
    if (!name) continue
    const category = categorizeService(name)
    const option: ServiceOption = { value: raw, label: name, category }
    if (category === UNKNOWN_SERVICE_CATEGORY) {
      others.push(option)
    } else {
      const bucket = buckets.get(category)
      if (bucket) bucket.push(option)
      else others.push({ ...option, category: UNKNOWN_SERVICE_CATEGORY })
    }
  }
  const groups: ServiceGroup[] = []
  for (const [category, options] of buckets) groups.push({ category, options })
  groups.push({ category: UNKNOWN_SERVICE_CATEGORY, options: others })
  return groups
}
