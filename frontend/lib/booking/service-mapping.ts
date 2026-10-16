/**
 * Service adapter: groups backend free-text `service_types` under a shared
 * taxonomy for the optgroup dropdown. Unknown strings fall to "อื่นๆ".
 *
 * DB-ready: the taxonomy is a pluggable table. `loadTaxonomy` fetches the
 * shared endpoint when it exists and falls back to the hardcoded
 * TOPIC_OPTIONS otherwise, so frontend units never block on the backend
 * endpoint + admin UI (a stacked follow-up). Unknown input never throws;
 * it just lands in "อื่นๆ" or is skipped.
 */
import { API_BASE } from '@/lib/constants/api'
import { TOPIC_OPTIONS } from '@/lib/constants/categories'

/** Category → topics, the same shape the backend endpoint will serve. */
export type TaxonomyTable = Record<string, string[]>

export interface ServiceOption {
  /** Exact backend string, sent back verbatim on submit. */
  value: string
  /** Trimmed display label. */
  label: string
  /** Taxonomy category key, or UNKNOWN_SERVICE_CATEGORY. */
  category: string
}

export interface ServiceGroup {
  category: string
  options: ServiceOption[]
}

export const UNKNOWN_SERVICE_CATEGORY = 'อื่นๆ'

/** The taxonomy categories, in definition order. */
export function topicCategories(taxonomy: TaxonomyTable = TOPIC_OPTIONS): string[] {
  return Object.keys(taxonomy)
}

/** Classify one backend string under its taxonomy category. */
export function categorizeService(value: unknown, taxonomy: TaxonomyTable = TOPIC_OPTIONS): string {
  if (typeof value !== 'string') return UNKNOWN_SERVICE_CATEGORY
  const name = value.trim()
  if (!name) return UNKNOWN_SERVICE_CATEGORY
  // The shared "อื่นๆ" sub-label sits under several categories at once, so no
  // parent owns it; a backend string with that literal meaning is itself other.
  if (name === UNKNOWN_SERVICE_CATEGORY) return UNKNOWN_SERVICE_CATEGORY
  if (taxonomy[name] !== undefined) return name
  for (const [category, topics] of Object.entries(taxonomy)) {
    if (topics.includes(name)) return category
  }
  return UNKNOWN_SERVICE_CATEGORY
}

/**
 * Bucket backend strings into one group per taxonomy category (in
 * definition order) plus a trailing "อื่นๆ" group. Known categories stay
 * present even when empty so coverage over the taxonomy is structural.
 */
export function buildServiceGroups(
  serviceTypes: readonly unknown[],
  taxonomy: TaxonomyTable = TOPIC_OPTIONS,
): ServiceGroup[] {
  const buckets = new Map<string, ServiceOption[]>()
  for (const category of topicCategories(taxonomy)) buckets.set(category, [])
  const others: ServiceOption[] = []
  for (const raw of serviceTypes) {
    if (typeof raw !== 'string') continue
    const name = raw.trim()
    if (!name) continue
    const category = categorizeService(name, taxonomy)
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

// --- Taxonomy boundary -------------------------------------------------------

/** Shared taxonomy endpoint; served by the stacked backend follow-up. */
export const SHARED_TAXONOMY_URL = `${API_BASE}/taxonomy`

interface TaxonomyResponse {
  ok: boolean
  json(): Promise<unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Validate a fetched payload into a taxonomy table. Null means "use fallback". Never throws. */
export function parseTaxonomyTable(value: unknown): TaxonomyTable | null {
  if (!isRecord(value)) return null
  const keys = Object.keys(value)
  if (keys.length === 0) return null
  const table: TaxonomyTable = {}
  for (const key of keys) {
    const topics: unknown = value[key]
    if (!Array.isArray(topics)) return null
    const names: string[] = []
    for (const topic of topics) {
      if (typeof topic !== 'string') return null
      names.push(topic)
    }
    table[key] = names
  }
  return table
}

/**
 * Fetch the shared taxonomy, falling back to TOPIC_OPTIONS when the endpoint
 * is missing, errors, or serves a bad shape. Never throws.
 */
export async function loadTaxonomy(
  options: {
    url?: string
    fetchFn?: (input: string) => Promise<TaxonomyResponse>
  } = {},
): Promise<TaxonomyTable> {
  const url = options.url ?? SHARED_TAXONOMY_URL
  const fetchFn = options.fetchFn ?? fetch
  try {
    const res = await fetchFn(url)
    if (!res.ok) return TOPIC_OPTIONS
    return parseTaxonomyTable(await res.json()) ?? TOPIC_OPTIONS
  } catch {
    return TOPIC_OPTIONS
  }
}
