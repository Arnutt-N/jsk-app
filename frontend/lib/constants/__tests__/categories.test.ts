import { describe, it, expect } from 'vitest'
import {
  CATEGORIES,
  DRUG_REPORTING_SUBCATEGORIES,
  isValidCategory,
  isValidDrugReportingSubcategory,
  getCategoryLabel,
  getDrugReportingSubcategoryLabel,
} from '../categories'

describe('CATEGORIES', () => {
  it('มี 4 หมวดหมู่', () => {
    expect(CATEGORIES).toHaveLength(4)
  })

  it('มีแจ้งเบาะแสยาเสพติดเป็นหมวดแรก', () => {
    expect(CATEGORIES[0].value).toBe('แจ้งเบาะแสยาเสพติด')
    expect(CATEGORIES[0].label).toBe('แจ้งเบาะแสยาเสพติด')
  })

  it('มีหมวดหมู่ครบตามที่กำหนด', () => {
    const values = CATEGORIES.map(c => c.value)
    expect(values).toContain('แจ้งเบาะแสยาเสพติด')
    expect(values).toContain('ร้องเรียน/ร้องทุกข์')
    expect(values).toContain('ขอความช่วยเหลือ')
    expect(values).toContain('อื่นๆ')
  })

  it('เรียงลำดับให้แจ้งเบาะแสยาเสพติดอยู่ก่อนร้องเรียน/ร้องทุกข์', () => {
    const drugIndex = CATEGORIES.findIndex(c => c.value === 'แจ้งเบาะแสยาเสพติด')
    const complaintIndex = CATEGORIES.findIndex(c => c.value === 'ร้องเรียน/ร้องทุกข์')
    expect(drugIndex).toBeLessThan(complaintIndex)
  })
})

describe('DRUG_REPORTING_SUBCATEGORIES', () => {
  it('มี 4 หมวดหมู่ย่อย', () => {
    expect(DRUG_REPORTING_SUBCATEGORIES).toHaveLength(4)
  })

  it('มีหมวดหมู่ย่อยครบตามที่กำหนด', () => {
    const values = DRUG_REPORTING_SUBCATEGORIES.map(s => s.value)
    expect(values).toContain('ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย')
    expect(values).toContain('ขอความช่วยเหลือบำบัดผู้เสพ')
    expect(values).toContain('ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด')
    expect(values).toContain('ปัญหายาเสพติด')
  })

  it('ปัญหายาเสพติดเป็นรายการแรก', () => {
    const firstItem = DRUG_REPORTING_SUBCATEGORIES[0]
    expect(firstItem.value).toBe('ปัญหายาเสพติด')
  })
})

describe('isValidCategory', () => {
  it('return true สำหรับหมวดหมู่ที่ถูกต้อง', () => {
    expect(isValidCategory('แจ้งเบาะแสยาเสพติด')).toBe(true)
    expect(isValidCategory('ร้องเรียน/ร้องทุกข์')).toBe(true)
    expect(isValidCategory('ขอความช่วยเหลือ')).toBe(true)
    expect(isValidCategory('อื่นๆ')).toBe(true)
  })

  it('return false สำหรับหมวดหมู่ที่ไม่ถูกต้อง', () => {
    expect(isValidCategory('หมวดหมู่อื่น')).toBe(false)
    expect(isValidCategory('')).toBe(false)
    expect(isValidCategory('ปัญหายาเสพติด')).toBe(false) // เป็น subcategory ไม่ใช่ category
  })
})

describe('isValidDrugReportingSubcategory', () => {
  it('return true สำหรับหมวดหมู่ย่อยที่ถูกต้อง', () => {
    expect(isValidDrugReportingSubcategory('ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย')).toBe(true)
    expect(isValidDrugReportingSubcategory('ขอความช่วยเหลือบำบัดผู้เสพ')).toBe(true)
    expect(isValidDrugReportingSubcategory('ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด')).toBe(true)
    expect(isValidDrugReportingSubcategory('ปัญหายาเสพติด')).toBe(true)
  })

  it('return false สำหรับหมวดหมู่ย่อยที่ไม่ถูกต้อง', () => {
    expect(isValidDrugReportingSubcategory('อื่นๆ')).toBe(false)
    expect(isValidDrugReportingSubcategory('')).toBe(false)
    expect(isValidDrugReportingSubcategory('แจ้งเบาะแสยาเสพติด')).toBe(false) // เป็น category ไม่ใช่ subcategory
  })
})

describe('getCategoryLabel', () => {
  it('return label สำหรับหมวดหมู่ที่ถูกต้อง', () => {
    expect(getCategoryLabel('แจ้งเบาะแสยาเสพติด')).toBe('แจ้งเบาะแสยาเสพติด')
    expect(getCategoryLabel('ร้องเรียน/ร้องทุกข์')).toBe('ร้องเรียน/ร้องทุกข์')
    expect(getCategoryLabel('ขอความช่วยเหลือ')).toBe('ขอความช่วยเหลือ')
    expect(getCategoryLabel('อื่นๆ')).toBe('อื่นๆ')
  })

  it('return undefined สำหรับหมวดหมู่ที่ไม่ถูกต้อง', () => {
    expect(getCategoryLabel('หมวดหมู่อื่น')).toBeUndefined()
    expect(getCategoryLabel('')).toBeUndefined()
  })
})

describe('getDrugReportingSubcategoryLabel', () => {
  it('return label สำหรับหมวดหมู่ย่อยที่ถูกต้อง', () => {
    expect(getDrugReportingSubcategoryLabel('ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย')).toBe('ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย')
    expect(getDrugReportingSubcategoryLabel('ขอความช่วยเหลือบำบัดผู้เสพ')).toBe('ขอความช่วยเหลือบำบัดผู้เสพ')
    expect(getDrugReportingSubcategoryLabel('ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด')).toBe('ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด')
    expect(getDrugReportingSubcategoryLabel('ปัญหายาเสพติด')).toBe('ปัญหายาเสพติด')
  })

  it('return undefined สำหรับหมวดหมู่ย่อยที่ไม่ถูกต้อง', () => {
    expect(getDrugReportingSubcategoryLabel('อื่นๆ')).toBeUndefined()
    expect(getDrugReportingSubcategoryLabel('')).toBeUndefined()
  })
})
