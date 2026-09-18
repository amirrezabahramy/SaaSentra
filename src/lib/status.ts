export function normalizeStatusConfirmation(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '_')
}
