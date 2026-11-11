import type { Bill } from '@/db/repositories/bills.repository';

// "Scan this photo" on receipt review: offered for a photo bill whose scan
// never finished (closed mid-processing, or the user chose "Enter items
// manually" after a failure) — a DRAFT with its receipt photo but no OCR text,
// and nothing added yet. Processing (saveParsedReceiptDraft) appends items
// and adjustments, so requiring both lists to be empty is what keeps a
// re-scan from duplicating anything — and it overwrites the merchant name and
// receipt date, so a typed-in merchant or date also takes the option away.
export function canRescanReceipt(
  bill: Pick<
    Bill,
    'status' | 'entryMethod' | 'receiptImageUri' | 'rawOcrText' | 'merchantName' | 'receiptDate'
  >,
  itemCount: number,
  adjustmentCount: number,
): boolean {
  return (
    bill.status === 'DRAFT' &&
    bill.entryMethod !== 'MANUAL' &&
    Boolean(bill.receiptImageUri) &&
    !bill.rawOcrText &&
    !bill.merchantName?.trim() &&
    !bill.receiptDate?.trim() &&
    itemCount === 0 &&
    adjustmentCount === 0
  );
}
