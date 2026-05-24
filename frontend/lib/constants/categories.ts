/**
 * หมวดหมู่คำร้องที่รองรับในระบบ
 * @description รายการหมวดหมู่หลักที่สามารถเลือกได้เมื่อสร้างคำร้องใหม่
 */
export const CATEGORIES = [
  { value: 'แจ้งเบาะแสยาเสพติด', label: 'แจ้งเบาะแสยาเสพติด' },
  { value: 'ร้องเรียน/ร้องทุกข์', label: 'ร้องเรียน/ร้องทุกข์' },
  { value: 'ขอความช่วยเหลือ', label: 'ขอความช่วยเหลือ' },
  { value: 'อื่นๆ', label: 'อื่นๆ' },
] as const;

export type CategoryValue = typeof CATEGORIES[number]['value'];

/**
 * หมวดหมู่ย่อยสำหรับแจ้งเบาะแสยาเสพติด
 * @description ปัญหาเฉพาะด้านที่เกี่ยวข้องกับยาเสพติด
 */
export const DRUG_REPORTING_SUBCATEGORIES = [
  { value: 'ปัญหายาเสพติด', label: 'ปัญหายาเสพติด' },
  { value: 'ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย', label: 'ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย' },
  { value: 'ขอความช่วยเหลือบำบัดผู้เสพ', label: 'ขอความช่วยเหลือบำบัดผู้เสพ' },
  { value: 'ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด', label: 'ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด' },
] as const;

export type DrugReportingSubcategoryValue = typeof DRUG_REPORTING_SUBCATEGORIES[number]['value'];

/**
 * ตรวจสอบว่าค่าที่กำหนดเป็นหมวดหมู่ที่ถูกต้องหรือไม่
 */
export function isValidCategory(value: string): value is CategoryValue {
  return CATEGORIES.some(category => category.value === value);
}

/**
 * ตรวจสอบว่าค่าที่กำหนดเป็นหมวดหมู่ย่อยของแจ้งเบาะแสยาเสพติดที่ถูกต้องหรือไม่
 */
export function isValidDrugReportingSubcategory(value: string): value is DrugReportingSubcategoryValue {
  return DRUG_REPORTING_SUBCATEGORIES.some(subcategory => subcategory.value === value);
}

/**
 * ดึง label จาก value ของหมวดหมู่
 */
export function getCategoryLabel(value: string): string | undefined {
  const category = CATEGORIES.find(c => c.value === value);
  return category?.label;
}

/**
 * ดึง label จาก value ของหมวดหมู่ย่อยแจ้งเบาะแสยาเสพติด
 */
export function getDrugReportingSubcategoryLabel(value: string): string | undefined {
  const subcategory = DRUG_REPORTING_SUBCATEGORIES.find(s => s.value === value);
  return subcategory?.label;
}
