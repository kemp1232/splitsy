// The share rules buildShareText and buildShareImageModel have in common
// (name/paid lookups, the "Paid" line, the "owes" label, and when Me's payment
// numbers are shown), kept in one place so the text and the image can't drift
// apart. Names are inserted with function replacers so a name containing `$&`
// or `$'` (special in a string replacement) comes out literally.

import { copy } from '@/constants/copy';
import { buildPaymentDetailsBlock, isCreditor } from '@/features/payment-details/phMobileNumber';
import { formatCentavos } from '@/lib/money';

import type { SettlementTransaction } from './settlement.types';
import type { ShareTextInput } from './shareText';

export function buildParticipantLookups(participants: ShareTextInput['participants']) {
  const nameByParticipantId = new Map(
    participants.map((participant) => [participant.participantId, participant.name]),
  );
  const paidCentavosByParticipantId = new Map(
    participants
      .filter((participant) => participant.paidCentavos !== undefined)
      .map((participant) => [participant.participantId, participant.paidCentavos as number]),
  );
  return { nameByParticipantId, paidCentavosByParticipantId };
}

export function formatPaidLine(paidCentavos: number): string {
  return `${copy.tripSettlement.paidLabel}: ${formatCentavos(paidCentavos)}`;
}

export function formatOwesLabel(debtorName: string, creditorName: string): string {
  return copy.settlement.owesLabel
    .replace('{debtor}', () => debtorName)
    .replace('{creditor}', () => creditorName);
}

// Me's saved payment numbers, only when there is a settle-up block and Me is
// owed money in it; null otherwise.
export function buildMePaymentDetailsBlock({
  settlementTransactions,
  paymentDetails,
  nameByParticipantId,
}: {
  settlementTransactions: SettlementTransaction[] | undefined;
  paymentDetails: ShareTextInput['paymentDetails'];
  nameByParticipantId: Map<string, string>;
}): string | null {
  if (!settlementTransactions || settlementTransactions.length === 0 || !paymentDetails) {
    return null;
  }
  const meName = nameByParticipantId.get(paymentDetails.meParticipantId);
  if (meName === undefined || !isCreditor(settlementTransactions, paymentDetails.meParticipantId)) {
    return null;
  }
  return buildPaymentDetailsBlock({
    name: meName,
    gcashNumber: paymentDetails.gcashNumber,
    mayaNumber: paymentDetails.mayaNumber,
  });
}
