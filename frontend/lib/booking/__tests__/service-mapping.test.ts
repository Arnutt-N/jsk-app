import { describe, expect, it } from 'vitest'
import { TOPIC_OPTIONS } from '@/lib/constants/categories'
import {
  UNKNOWN_SERVICE_CATEGORY,
  buildServiceGroups,
  categorizeService,
  topicCategories,
} from '../service-mapping'

describe('categorizeService', () => {
  it('maps a category name to itself', () => {
    expect(categorizeService('กองทุนยุติธรรม')).toBe('กองทุนยุติธรรม')
  })

  it('maps a subcategory to its parent category', () => {
    expect(categorizeService('แพ่ง')).toBe('ให้คำปรึกษากฎหมาย')
    expect(categorizeService('หนี้สิน')).toBe('ไกล่เกลี่ยระงับข้อพิพาท')
  })

  it('sends an unmapped backend string to Others', () => {
    expect(categorizeService('ปรึกษากฎหมาย')).toBe('อื่นๆ')
  })

  it('sends blank and non-string input to Others without throwing', () => {
    expect(categorizeService('   ')).toBe('อื่นๆ')
    expect(categorizeService(null)).toBe('อื่นๆ')
    expect(categorizeService(42)).toBe('อื่นๆ')
  })

  it('keeps the shared Others label in the Others bucket', () => {
    expect(categorizeService('อื่นๆ')).toBe('อื่นๆ')
  })

  it('covers every subcategory in the taxonomy under its parent', () => {
    for (const [category, topics] of Object.entries(TOPIC_OPTIONS)) {
      for (const topic of topics) {
        // The shared "อื่นๆ" label has five parents; the rule above owns it.
        if (topic === UNKNOWN_SERVICE_CATEGORY) continue
        expect(categorizeService(topic)).toBe(category)
      }
    }
  })
})

describe('buildServiceGroups', () => {
  it('buckets known services and falls the unknown one to Others', () => {
    const groups = buildServiceGroups(['แพ่ง', 'ปรึกษากฎหมาย'])
    const counsel = groups.find((group) => group.category === 'ให้คำปรึกษากฎหมาย')
    expect(counsel?.options).toEqual([
      { value: 'แพ่ง', label: 'แพ่ง', category: 'ให้คำปรึกษากฎหมาย' },
    ])
    const others = groups.find((group) => group.category === UNKNOWN_SERVICE_CATEGORY)
    expect(others?.options).toEqual([
      { value: 'ปรึกษากฎหมาย', label: 'ปรึกษากฎหมาย', category: 'อื่นๆ' },
    ])
  })

  it('keeps every taxonomy category present as a group', () => {
    const groups = buildServiceGroups(['แพ่ง'])
    expect(groups.map((group) => group.category)).toEqual([
      ...topicCategories(),
      UNKNOWN_SERVICE_CATEGORY,
    ])
  })

  it('skips blank and non-string entries instead of breaking', () => {
    const groups = buildServiceGroups(['แพ่ง', '  ', null, 7])
    const others = groups.find((group) => group.category === UNKNOWN_SERVICE_CATEGORY)
    expect(others?.options).toEqual([])
    const counsel = groups.find((group) => group.category === 'ให้คำปรึกษากฎหมาย')
    expect(counsel?.options).toHaveLength(1)
  })
})
