/**
 * หน่วยงานที่รองรับในระบบคำร้อง
 * @description รายการหน่วยงานที่สามารถเลือกได้เมื่อสร้างคำร้องใหม่
 */
export const AGENCIES = [
  { value: 'ศูนย์ยุติธรรมชุมชน', label: 'ศูนย์ยุติธรรมชุมชน' },
  { value: 'ศูนย์ดำรงธรรม', label: 'ศูนย์ดำรงธรรม' },
  { value: 'สถานีตำรวจภูธร', label: 'สถานีตำรวจภูธร' },
  { value: 'ผู้นำชุมชนและจิตอาสา', label: 'กำนัน ผู้ใหญ่บ้าน จิตอาสา ผู้นำชุมชน' },
] as const;

export type AgencyValue = typeof AGENCIES[number]['value'];

/**
 * ตรวจสอบว่าค่าที่กำหนดเป็นหน่วยงานที่ถูกต้องหรือไม่
 */
export function isValidAgency(value: string): value is AgencyValue {
  return AGENCIES.some(agency => agency.value === value);
}

/**
 * ดึง label จาก value ของหน่วยงาน
 */
export function getAgencyLabel(value: string): string | undefined {
  const agency = AGENCIES.find(a => a.value === value);
  return agency?.label;
}
