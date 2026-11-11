import { copy } from '@/constants/copy';
import { rollOverDateOnly } from '@/lib/date';

// Warning under receipt review's date field after a scan read a day that
// doesn't exist: `readDate` is what the scan read (processing.tsx's one-time
// `dateReadAs` param), `currentDate` the field's current value. Shown only
// while the field still holds the rolled-over date processing saved, so it
// goes away as soon as the user corrects the date. null otherwise.
export function buildDateRolledOverWarning(
  readDate: string | undefined,
  currentDate: string,
): string | null {
  if (!readDate) return null;
  const { date, rolledOver } = rollOverDateOnly(readDate);
  if (!rolledOver || currentDate !== date) return null;
  return copy.receiptReview.dateRolledOverWarning
    .replace('{readDate}', () => readDate)
    .replace('{date}', () => date);
}
