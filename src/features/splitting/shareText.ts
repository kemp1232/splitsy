// Lives alongside calculateSplit/reconciliation rather than in its own
// feature folder: this is a direct, pure consumer of `SplitCalculationResult`
// (spec F-017's share text is just that result rendered as text) with no
// responsibility beyond formatting numbers that already exist on it. The
// "attach a display name/label to an id" work below is the same kind of
// caller-side translation `split.types.ts` already documents for
// `SplitLineItem`/`SplitAdjustment` (this layer stays decoupled from
// repository row shapes) — it doesn't need a separate module, just plain
// data passed in by whichever screen/hook already has the names loaded.

import { copy } from '@/constants/copy';
import { formatCentavos } from '@/lib/money';

import type { SettlementTransaction } from './settlement.types';
import type { SplitCalculationResult } from './split.types';

// Display name for one participant, keyed by the same `participantId` used
// throughout split.types.ts.
export type ShareTextParticipant = {
  participantId: string;
  name: string;
  // Not from spec F-017 — post-MVP Payments data (same optional field
  // PersonTotalCard's own `paidCentavos` prop takes). Omitted entirely skips
  // this participant's "Paid" line; the caller is expected to omit it for
  // every participant at once (never just some), matching
  // PersonTotalCard's/SettlementCard's own hasAnyContribution gate.
  paidCentavos?: number;
};

// Display name for one line item, keyed by `lineItemId`.
export type ShareTextItem = {
  lineItemId: string;
  name: string;
};

// Display label for one adjustment, keyed by `adjustmentId`.
export type ShareTextAdjustment = {
  adjustmentId: string;
  label: string;
};

export type ShareTextInput = {
  billTitle: string;
  participants: ShareTextParticipant[];
  items: ShareTextItem[];
  adjustments: ShareTextAdjustment[];
  splitResult: SplitCalculationResult;
  // Not from spec F-017 — post-MVP settlement ("who owes whom", see
  // settlement.ts's header comment) appended as its own block right before
  // the footer line. Omitted (undefined or empty) entirely skips the block —
  // a bill that never touched the Payments screen shouldn't get an empty or
  // meaningless "Settle up" section in its shared text, matching
  // SettlementCard's own on-screen hasAnyContribution gate.
  settlementTransactions?: SettlementTransaction[];
};

const FOOTER_LINE = 'Calculated with Splitsy.';

/**
 * Builds the exact plain-text bill summary from spec F-017 — the format
 * suitable for pasting into Messenger, Viber, SMS, email, or notes:
 *
 * ```text
 * Splitsy — {billTitle}
 * Total: ₱{computed total}
 *
 * {name} — ₱{their final total}
 * • {item name} — ₱{their share of that item}
 * • {adjustment label} — ₱{their share of that adjustment}
 * Paid: ₱{amount they've actually paid}
 *
 * {next participant, same shape}
 *
 * {debtor} owes {creditor} — ₱{amount}
 * {next transaction, same shape}
 *
 * Calculated with Splitsy.
 * ```
 *
 * The "who owes whom" block (not from spec F-017 — see `settlementTransactions`
 * on `ShareTextInput`) is entirely optional and only ever appears when the
 * caller actually has settlement data to show. Same for each participant's
 * "Paid" line (see `ShareTextParticipant.paidCentavos`).
 *
 * Every amount is formatted with `formatCentavos` (spec 10.1: format at the
 * UI boundary only, never by hand) — this module never touches a floating
 * point number or builds a currency string itself.
 *
 * Each participant's item/adjustment lines use their own allocated share
 * from `splitResult` (spec F-017: "must use each participant's allocated
 * item share, not always the full line price") — a shared item naturally
 * shows each participant's partial amount because that's what
 * `ParticipantShare.itemShares` already holds, not the item's full price.
 *
 * A participant's line for one item/adjustment is omitted entirely when
 * their share of it is exactly zero centavos — the spec's own example never
 * shows a zero-value line, and a ₱0 share is nothing worth listing. This
 * only affects which bullet lines print; it never changes the header
 * `{name} — ₱{final total}` line, which always prints even if every
 * individual share happened to be zero (a diner covered entirely by other
 * people's custom adjustments, for instance).
 *
 * Purely presentational: no rounding, allocation, or validation happens
 * here. It trusts `splitResult` completely, so it's meaningless to call this
 * on a `SplitCalculationResult` that hasn't already passed
 * `calculateSplit`'s invariant assertion.
 */
export function buildShareText(input: ShareTextInput): string {
  const { billTitle, participants, items, adjustments, splitResult, settlementTransactions } =
    input;

  const nameByParticipantId = new Map(
    participants.map((participant) => [participant.participantId, participant.name]),
  );
  const paidCentavosByParticipantId = new Map(
    participants
      .filter((participant) => participant.paidCentavos !== undefined)
      .map((participant) => [participant.participantId, participant.paidCentavos as number]),
  );
  const nameByLineItemId = new Map(items.map((item) => [item.lineItemId, item.name]));
  const labelByAdjustmentId = new Map(
    adjustments.map((adjustment) => [adjustment.adjustmentId, adjustment.label]),
  );

  const headerBlock = [
    `Splitsy — ${billTitle}`,
    `Total: ${formatCentavos(splitResult.computedTotalCentavos)}`,
  ].join('\n');

  const participantBlocks = splitResult.participantShares.map((share) => {
    const name = nameByParticipantId.get(share.participantId);
    if (name === undefined) {
      throw new Error(
        `buildShareText: no display name provided for participant ${share.participantId}`,
      );
    }

    const bulletLines: string[] = [];

    for (const itemShare of share.itemShares) {
      if (itemShare.amountCentavos === 0) continue;
      const itemName = nameByLineItemId.get(itemShare.lineItemId);
      if (itemName === undefined) {
        throw new Error(`buildShareText: no name provided for line item ${itemShare.lineItemId}`);
      }
      bulletLines.push(`• ${itemName} — ${formatCentavos(itemShare.amountCentavos)}`);
    }

    for (const adjustmentShare of share.adjustmentShares) {
      if (adjustmentShare.amountCentavos === 0) continue;
      const label = labelByAdjustmentId.get(adjustmentShare.adjustmentId);
      if (label === undefined) {
        throw new Error(
          `buildShareText: no label provided for adjustment ${adjustmentShare.adjustmentId}`,
        );
      }
      bulletLines.push(`• ${label} — ${formatCentavos(adjustmentShare.amountCentavos)}`);
    }

    const paidCentavos = paidCentavosByParticipantId.get(share.participantId);
    if (paidCentavos !== undefined) {
      bulletLines.push(`${copy.tripSettlement.paidLabel}: ${formatCentavos(paidCentavos)}`);
    }

    const headerLine = `${name} — ${formatCentavos(share.finalTotalCentavos)}`;
    return bulletLines.length > 0 ? [headerLine, ...bulletLines].join('\n') : headerLine;
  });

  const settlementBlock =
    settlementTransactions && settlementTransactions.length > 0
      ? [
          copy.settlement.heading,
          ...settlementTransactions.map((transaction) => {
            const debtorName = nameByParticipantId.get(transaction.fromParticipantId);
            const creditorName = nameByParticipantId.get(transaction.toParticipantId);
            if (debtorName === undefined || creditorName === undefined) {
              throw new Error(
                'buildShareText: no display name provided for a settlement participant',
              );
            }
            const label = copy.settlement.owesLabel
              .replace('{debtor}', debtorName)
              .replace('{creditor}', creditorName);
            return `${label} — ${formatCentavos(transaction.amountCentavos)}`;
          }),
        ].join('\n')
      : null;

  return [
    headerBlock,
    ...participantBlocks,
    ...(settlementBlock !== null ? [settlementBlock] : []),
    FOOTER_LINE,
  ].join('\n\n');
}
