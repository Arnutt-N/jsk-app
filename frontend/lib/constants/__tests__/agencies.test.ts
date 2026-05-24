import { describe, it, expect } from 'vitest'
import {
  AGENCIES,
  isValidAgency,
  getAgencyLabel,
} from '../agencies'

describe('AGENCIES', () => {
  it('มี 4 หน่วยงาน', () => {
    expect(AGENCIES).toHaveLength(4)
  })

  it('มีศูนย์ยุติธรรมชุมชนเป็นรายการแรก', () => {
    expect(AGENCIES[0].value).toBe('ศูนย์ยุติธรรมชุมชน')
    expect(AGENCIES[0].label).toBe('ศูนย์ยุติธรรมชุมชน')
  })

  it('มีหน่วยงานครบตามที่กำหนด', () => {
    const values = AGENCIES.map(a => a.value)
    expect(values).toContain('ผู้นำชุมชนและจิตอาสา')
    expect(values).toContain('ศูนย์ยุติธรรมชุมชน')
    expect(values).toContain('ศูนย์ดำรงธรรม')
    expect(values).toContain('สถานีตำรวจภูธร')
  })

  it('เรียงลำดับให้หน่วยงานระดับชุมชนอยู่ท้ายสุด', () => {
    const communityIndex = AGENCIES.findIndex(a => a.value === 'ผู้นำชุมชนและจิตอาสา')
    const justiceCenterIndex = AGENCIES.findIndex(a => a.value === 'ศูนย์ยุติธรรมชุมชน')
    expect(communityIndex).toBeGreaterThan(justiceCenterIndex)
  })
})

describe('isValidAgency', () => {
  it('return true สำหรับหน่วยงานที่ถูกต้อง', () => {
    expect(isValidAgency('ผู้นำชุมชนและจิตอาสา')).toBe(true)
    expect(isValidAgency('ศูนย์ยุติธรรมชุมชน')).toBe(true)
    expect(isValidAgency('ศูนย์ดำรงธรรม')).toBe(true)
    expect(isValidAgency('สถานีตำรวจภูธร')).toBe(true)
  })

  it('return false สำหรับหน่วยงานที่ไม่ถูกต้อง', () => {
    expect(isValidAgency('หน่วยงานอื่น')).toBe(false)
    expect(isValidAgency('')).toBe(false)
    expect(isValidAgency('ตำรวจ')).toBe(false)
  })
})

describe('getAgencyLabel', () => {
  it('return label สำหรับหน่วยงานที่ถูกต้อง', () => {
    expect(getAgencyLabel('ผู้นำชุมชนและจิตอาสา')).toBe('กำนัน ผู้ใหญ่บ้าน จิตอาสา ผู้นำชุมชน')
    expect(getAgencyLabel('ศูนย์ยุติธรรมชุมชน')).toBe('ศูนย์ยุติธรรมชุมชน')
    expect(getAgencyLabel('ศูนย์ดำรงธรรม')).toBe('ศูนย์ดำรงธรรม')
    expect(getAgencyLabel('สถานีตำรวจภูธร')).toBe('สถานีตำรวจภูธร')
  })

  it('return undefined สำหรับหน่วยงานที่ไม่ถูกต้อง', () => {
    expect(getAgencyLabel('หน่วยงานอื่น')).toBeUndefined()
    expect(getAgencyLabel('')).toBeUndefined()
  })
})
