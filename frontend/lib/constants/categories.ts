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
 * แผนที่หัวข้อ (category) → หัวข้อย่อย (subcategory) — source of truth ร่วม
 * ระหว่างฟอร์ม LIFF (request-v2) และฟอร์มสร้างคำร้องฝั่ง admin เพื่อ unity.
 * เดิม map นี้ถูก hardcode ไว้ใน LIFF เท่านั้น ทำให้ admin create cascade ไม่ตรงกัน.
 * เมื่อเพิ่ม/แก้หัวข้อ ให้แก้ที่นี่ที่เดียว — ทุก consumer จะอัปเดตตาม.
 */
export const TOPIC_OPTIONS: Record<string, string[]> = {
  'แจ้งเบาะแสยาเสพติด': [
    'ปัญหายาเสพติด',
    'ผู้เสพ/ผู้ป่วยที่เฝ้าระวัง/อันตราย',
    'ขอความช่วยเหลือบำบัดผู้เสพ',
    'ครอบครัวที่ต้องเข้าช่วยเหลือจากผลกระทบยาเสพติด',
  ],
  'กองทุนยุติธรรม': [
    'ค่าจ้างทนายความ',
    'ค่าธรรมเนียมศาล',
    'เงินประกันตัว',
    'อื่นๆ',
  ],
  'เงินเยียวยาเหยื่ออาชญากรรม': [
    'กรณีถูกทำร้ายร่างกาย/ถูกลูกหลง',
    'กรณีอุบัติเหตุจราจร',
    'กรณีอุบัติเหตุอื่นๆ/ไม่ทราบผู้กระทำผิด',
    'อื่นๆ',
  ],
  'พยานในคดีอาญา': [
    'ค่าพาหนะ/ค่าที่พัก/ค่าอาหาร (พยาน)',
    'ค่าตอบแทนความเสียหาย (พยาน)',
    'การคุ้มครองพยาน',
  ],
  'ไกล่เกลี่ยระงับข้อพิพาท': [
    'หนี้สิน',
    'ที่ดิน',
    'มรดก',
    'อื่นๆ',
  ],
  'รับเรื่องราวร้องทุกข์': [
    'ขอถวายฎีกา/รื้อฟื้นคดี',
    'การบังคับคดี',
    'ความขัดแย้งกับหน่วยงานรัฐ',
    'อื่นๆ',
  ],
  'ให้คำปรึกษากฎหมาย': [
    'แพ่ง',
    'อาญา',
    'อื่นๆ',
  ],
};

/** ตัวเลือกหัวข้อ (category) รูปแบบ {value,label} สำหรับ Select — อิงจาก TOPIC_OPTIONS */
export const TOPIC_CATEGORY_OPTIONS = Object.keys(TOPIC_OPTIONS).map((v) => ({
  value: v,
  label: v,
}));

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
