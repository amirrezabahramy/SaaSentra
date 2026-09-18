export function formatCurrency(minor: number, currency = 'USD'): string {
  const hasMinorUnitDisplay = currency !== 'IRR'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: hasMinorUnitDisplay ? 2 : 0,
    maximumFractionDigits: hasMinorUnitDisplay ? 2 : 0,
  }).format(hasMinorUnitDisplay ? minor / 100 : minor)
}

export function formatDate(value: string | Date | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(typeof value === 'string' ? new Date(value) : value)
}
