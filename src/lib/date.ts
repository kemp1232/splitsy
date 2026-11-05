export function nowIso(): string {
  return new Date().toISOString();
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// A bare YYYY-MM-DD (bills.receiptDate) is built as a *local* calendar date —
// `new Date('2026-11-05')` would parse it as UTC midnight and shift it to the
// previous day in any timezone west of UTC. Full ISO timestamps
// (createdAt/updatedAt) are parsed normally and shown in local time.
function parseBillDate(value: string): Date {
  const match = DATE_ONLY_PATTERN.exec(value);
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
}

export function formatBillListDate(isoDate: string): string {
  const date = parseBillDate(isoDate);
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Hoisted (RN perf rule js-hoist-intl): constructing an Intl formatter is
// expensive, and this one runs for every untitled bill row on Home.
const SHORT_BILL_DATE_FORMAT = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' });

// "Nov 5"-style short date for date-based default bill names (see
// parseBillDate for how date-only vs. full timestamps are handled).
export function formatShortBillDate(value: string): string {
  return SHORT_BILL_DATE_FORMAT.format(parseBillDate(value));
}
