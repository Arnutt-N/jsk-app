export function maskLineUserId(id: string | null | undefined): string {
  if (!id) return '-'
  if (id.length <= 6) return '＊'.repeat(6)
  return `${id[0]}${'＊'.repeat(id.length - 5)}${id.slice(-4)}`
}
