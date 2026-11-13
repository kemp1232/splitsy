import { copy } from '@/constants/copy';
import type { SettlementTransaction } from '@/features/splitting/settlement.types';

// The user's own GCash/Maya number (spec Amendment 2026-11-12): a Philippine
// mobile number, entered as 09XXXXXXXXX, +639XXXXXXXXX or 639XXXXXXXXX, with
// any spaces or dashes. Always stored in the local 09XXXXXXXXX form.
export type NormalizePhMobileNumberResult = { ok: true; value: string | null } | { ok: false };

const LOCAL_FORM = /^09\d{9}$/;
const INTERNATIONAL_FORM = /^\+?639\d{9}$/;

// `value: null` means the field was cleared (the saved number is removed).
export function normalizePhMobileNumber(raw: string): NormalizePhMobileNumberResult {
  const compact = raw.replace(/[\s-]/g, '');
  if (compact === '') return { ok: true, value: null };
  if (LOCAL_FORM.test(compact)) return { ok: true, value: compact };
  if (INTERNATIONAL_FORM.test(compact)) {
    return { ok: true, value: `0${compact.slice(compact.indexOf('9'))}` };
  }
  return { ok: false };
}

// "09171234567" -> "0917 123 4567". Anything not in the stored form is
// returned unchanged rather than mangled.
export function formatPhMobileNumber(normalized: string): string {
  if (!LOCAL_FORM.test(normalized)) return normalized;
  return `${normalized.slice(0, 4)} ${normalized.slice(4, 7)} ${normalized.slice(7)}`;
}

// Whether `participantId` is owed money in at least one settle-up transaction.
export function isCreditor(transactions: SettlementTransaction[], participantId: string): boolean {
  return transactions.some((transaction) => transaction.toParticipantId === participantId);
}

// The share-text block listing how to pay the user, or null when no number
// is saved:
//
//   Pay {name} via:
//   GCash: 0917 123 4567
//   Maya: 0918 765 4321
export function buildPaymentDetailsBlock({
  name,
  gcashNumber,
  mayaNumber,
}: {
  name: string;
  gcashNumber: string | null;
  mayaNumber: string | null;
}): string | null {
  const lines: string[] = [];
  if (gcashNumber) {
    lines.push(`${copy.paymentDetails.gcashLabel}: ${formatPhMobileNumber(gcashNumber)}`);
  }
  if (mayaNumber) {
    lines.push(`${copy.paymentDetails.mayaLabel}: ${formatPhMobileNumber(mayaNumber)}`);
  }
  if (lines.length === 0) return null;
  return [copy.paymentDetails.shareHeading.replace('{name}', () => name), ...lines].join('\n');
}
