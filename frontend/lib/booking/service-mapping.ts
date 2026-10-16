import { API_BASE } from '@/lib/constants/api'
import { TOPIC_OPTIONS } from '@/lib/constants/categories'

export type TaxonomyTable = Record<string, string[]>

export interface ServiceOption {
  value: string
  label: string
  category: string
}

export interface ServiceGroup {
  category: string
  options: ServiceOption[]
}

export const UNKNOWN_SERVICE_CATEGORY = 'อื่นๆ'

export function topicCategories(taxonomy: TaxonomyTable = TOPIC_OPTIONS): string[] {
  return Object.keys(taxonomy)
}

export function categorizeService(value: unknown, taxonomy: TaxonomyTable = TOPIC_OPTIONS): string {
  if (typeof value !== 'string') return UNKNOWN_SERVICE_CATEGORY
  const name = value.trim()
  if (!name) return UNKNOWN_SERVICE_CATEGORY
  if (name === UNKNOWN_SERVICE_CATEGORY) return UNKNOWN_SERVICE_CATEGORY
  if (taxonomy[name] !== undefined) return name
  for (const [category, topics] of Object.entries(taxonomy)) {
    if (topics.includes(name)) return category
  }
  return UNKNOWN_SERVICE_CATEGORY
}

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

export const SHARED_TAXONOMY_URL = `${API_BASE}/taxonomy`

interface TaxonomyResponse {
  ok: boolean
  json(): Promise<unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

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
