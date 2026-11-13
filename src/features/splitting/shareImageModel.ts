// The bill summary as display rows for the shareable image card
// (SummaryShareCard). Takes the exact same input as buildShareText and
// applies the same rules (settle-up only when transactions are given, Me's
// payment numbers only when Me is owed money), so the image never shows
// anything the text share wouldn't. Purely presentational: every amount comes
// from `splitResult`/`settlementTransactions` and goes through formatCentavos.

import { copy } from '@/constants/copy';
import { buildPaymentDetailsBlock, isCreditor } from '@/features/payment-details/phMobileNumber';
import { formatCentavos } from '@/lib/money';

import type { ShareTextInput } from './shareText';

export type ShareImagePersonRow = {
  participantId: string;
  name: string;
  totalText: string;
  // Null when the caller gave no paidCentavos (no Payments data on the bill).
  paidText: string | null;
};

export type ShareImageSettleLine = {
  key: string;
  label: string;
  amountText: string;
};

export type ShareImageModel = {
  title: string;
  totalText: string;
  people: ShareImagePersonRow[];
  // Empty when the text share would have no "Settle up" block.
  settleLines: ShareImageSettleLine[];
  // Null when the text share would have no payment details block.
  payment: { heading: string; lines: string[] } | null;
};

export function buildShareImageModel(input: ShareTextInput): ShareImageModel {
  const { billTitle, participants, splitResult, settlementTransactions, paymentDetails } = input;

  const nameByParticipantId = new Map(
    participants.map((participant) => [participant.participantId, participant.name]),
  );
  const paidCentavosByParticipantId = new Map(
    participants
      .filter((participant) => participant.paidCentavos !== undefined)
      .map((participant) => [participant.participantId, participant.paidCentavos as number]),
  );

  const people = splitResult.participantShares.map((share) => {
    const name = nameByParticipantId.get(share.participantId);
    if (name === undefined) {
      throw new Error(
        `buildShareImageModel: no display name provided for participant ${share.participantId}`,
      );
    }
    const paidCentavos = paidCentavosByParticipantId.get(share.participantId);
    return {
      participantId: share.participantId,
      name,
      totalText: formatCentavos(share.finalTotalCentavos),
      paidText:
        paidCentavos !== undefined
          ? `${copy.tripSettlement.paidLabel}: ${formatCentavos(paidCentavos)}`
          : null,
    };
  });

  const settleLines = (settlementTransactions ?? []).map((transaction, index) => {
    const debtorName = nameByParticipantId.get(transaction.fromParticipantId);
    const creditorName = nameByParticipantId.get(transaction.toParticipantId);
    if (debtorName === undefined || creditorName === undefined) {
      throw new Error(
        'buildShareImageModel: no display name provided for a settlement participant',
      );
    }
    return {
      key: `${index}:${transaction.fromParticipantId}->${transaction.toParticipantId}`,
      label: copy.settlement.owesLabel
        // Function replacers: a name is inserted literally, even one
        // containing `$&` or `$'` (special in a string replacement).
        .replace('{debtor}', () => debtorName)
        .replace('{creditor}', () => creditorName),
      amountText: formatCentavos(transaction.amountCentavos),
    };
  });

  const meName = paymentDetails
    ? nameByParticipantId.get(paymentDetails.meParticipantId)
    : undefined;
  const paymentBlock =
    settleLines.length > 0 &&
    settlementTransactions &&
    paymentDetails &&
    meName !== undefined &&
    isCreditor(settlementTransactions, paymentDetails.meParticipantId)
      ? buildPaymentDetailsBlock({
          name: meName,
          gcashNumber: paymentDetails.gcashNumber,
          mayaNumber: paymentDetails.mayaNumber,
        })
      : null;
  const [paymentHeading, ...paymentLines] = paymentBlock !== null ? paymentBlock.split('\n') : [];

  return {
    title: billTitle,
    totalText: formatCentavos(splitResult.computedTotalCentavos),
    people,
    settleLines,
    payment: paymentHeading !== undefined ? { heading: paymentHeading, lines: paymentLines } : null,
  };
}
