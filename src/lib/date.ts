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

// True only for a YYYY-MM-DD string naming a real calendar day — the shape
// alone would let "2026-02-31" through, which parseBillDate then silently
// rolls over to Mar 3.
export function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

// For a scanned date (OCR/AI) that's shaped YYYY-MM-DD but isn't a real day
// ("2026-02-31"): the real date it rolls over to, the same way
// new Date(y, m - 1, d) does (→ "2026-03-03"), so it can be saved as a valid
// date and the user told. A real date, or anything not shaped YYYY-MM-DD,
// comes back unchanged with rolledOver false.
export function rollOverDateOnly(value: string): { date: string; rolledOver: boolean } {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match || isValidDateOnly(value)) return { date: value, rolledOver: false };
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const pad = (part: number) => String(part).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    rolledOver: true,
  };
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
