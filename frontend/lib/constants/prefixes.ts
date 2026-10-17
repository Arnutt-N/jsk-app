/** คำนำหน้าชื่อ — fixed dropdown shared by every LIFF form. */

export const NAME_PREFIXES = [
  'นาย',
  'นาง',
  'นางสาว',
  'เด็กชาย',
  'เด็กหญิง',
  'พระ',
  'อื่นๆ',
] as const

export type NamePrefix = (typeof NAME_PREFIXES)[number]

export const PREFIX_OPTIONS = NAME_PREFIXES.map((prefix) => ({
  value: prefix,
  label: prefix,
}))

export function isNamePrefix(value: string): value is NamePrefix {
  return (NAME_PREFIXES as readonly string[]).includes(value)
}
