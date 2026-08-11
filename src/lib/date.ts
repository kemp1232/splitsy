export function nowIso(): string {
  return new Date().toISOString();
}

export function formatBillListDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}
