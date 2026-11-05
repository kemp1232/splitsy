import { copy } from '@/constants/copy';
import { formatShortBillDate } from '@/lib/date';

// Title older builds stored on every bill created without a merchant name.
// Treated exactly like an empty title at display time so those existing rows
// get the same date-based default name as new ones — no DB migration needed.
export const LEGACY_UNTITLED_BILL_TITLE = 'Untitled bill';

export type BillTitleSource = {
  merchantName: string | null;
  title: string | null;
  receiptDate: string | null;
  createdAt: string;
};

// The bill's own user-facing name (merchant name, else a real title), or
// null when it has none and should fall back to the date-based default.
export function getBillCustomName(bill: BillTitleSource): string | null {
  const merchantName = bill.merchantName?.trim();
  if (merchantName) return merchantName;
  const title = bill.title?.trim();
  if (title && title !== LEGACY_UNTITLED_BILL_TITLE) return title;
  return null;
}

// Display name for any bill: its custom name, else "Bill · Nov 5" from the
// receipt date (falling back to when the bill was created — not updatedAt,
// so the name doesn't shift every time the bill is edited).
export function getBillDisplayTitle(bill: BillTitleSource): string {
  return (
    getBillCustomName(bill) ??
    copy.home.defaultBillTitle.replace('{date}', () =>
      formatShortBillDate(bill.receiptDate ?? bill.createdAt),
    )
  );
}
