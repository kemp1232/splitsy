// Trip-wide counterpart to src/features/splitting/shareText.ts's
// buildShareText (spec F-017's per-bill share text) — same plain-text,
// paste-anywhere format and conventions, extended with two things a single
// bill's share text has no concept of: each person's items grouped by which
// bill they came from (a trip spans multiple receipts), and a closing
// "Settle up" section listing the trip-wide settlement transactions
// (computeSettlement's output), which buildShareText never included even for
// a single bill. Kept as its own function rather than a new parameter on the
// existing one — the shapes genuinely differ (multi-bill item grouping,
// settlement transactions) rather than one being a strict superset of fields.
import { copy } from '@/constants/copy';
import type { SettlementResult } from '@/features/splitting/settlement.types';
import { formatCentavos } from '@/lib/money';

import type { TripItemShareDisplay } from './buildTripParticipantItemShareDisplay';

export type TripShareTextBillItems = {
  billLabel: string;
  items: TripItemShareDisplay[];
};

export type TripShareTextPerson = {
  name: string;
  fairShareCentavos: number;
  contributedCentavos: number;
  // In bill order, same shape TripPersonBalanceCard's expanded section
  // renders — an empty `items` array for a bill is fine and produces no
  // bullet lines for it.
  billItems: TripShareTextBillItems[];
};

export type TripShareTextInput = {
  tripTitle: string;
  tripTotalCentavos: number;
  people: TripShareTextPerson[];
  settlement: SettlementResult;
  // Settlement transactions reference the same canonical identity ids
  // computeTripSettlement aggregates by, not a `TripShareTextPerson`'s own
  // position in `people` — resolved separately so this function doesn't have
  // to assume every identity in `settlement` also appears in `people` (it
  // always should in practice, but this keeps the two independent).
  nameByIdentityId: Map<string, string>;
};

const FOOTER_LINE = 'Calculated with Splitsy.';

/**
 * Builds a plain-text trip summary suitable for pasting into Messenger,
 * Viber, SMS, email, or notes:
 *
 * ```text
 * Splitsy — {tripTitle}
 * Trip total: ₱{tripTotalCentavos}
 *
 * {name} — ₱{fair share}
 * {bill label}
 * • {item name} — ₱{amount}
 * • {item name} (split with {names}) — ₱{amount}
 * Paid: ₱{contributed}
 *
 * {next person, same shape}
 *
 * Settle up
 * {debtor} owes {creditor} — ₱{amount}
 * (or "Everyone's settled up." when there's nothing left to transfer)
 *
 * Calculated with Splitsy.
 * ```
 *
 * Every amount is formatted with `formatCentavos` (spec 10.1: format at the
 * UI boundary only), same discipline as buildShareText. A bill with no
 * nonzero item shares for a given person contributes no lines at all (not
 * even its own bill-label line) — mirrors buildShareText's own "omit a share
 * that's exactly zero" rule.
 */
export function buildTripShareText(input: TripShareTextInput): string {
  const { tripTitle, tripTotalCentavos, people, settlement, nameByIdentityId } = input;

  const headerBlock = [
    `Splitsy — ${tripTitle}`,
    `${copy.tripSettlement.tripTotalLabel}: ${formatCentavos(tripTotalCentavos)}`,
  ].join('\n');

  const personBlocks = people.map((person) => {
    const lines: string[] = [`${person.name} — ${formatCentavos(person.fairShareCentavos)}`];

    for (const bill of person.billItems) {
      if (bill.items.length === 0) continue;
      lines.push(bill.billLabel);
      for (const item of bill.items) {
        const suffix =
          item.sharedWithNames.length > 0
            ? ` (${copy.tripSettlement.itemSharedWithSuffix.replace(
                '{names}',
                item.sharedWithNames.join(', '),
              )})`
            : '';
        lines.push(`• ${item.name}${suffix} — ${formatCentavos(item.amountCentavos)}`);
      }
    }

    lines.push(`${copy.tripSettlement.paidLabel}: ${formatCentavos(person.contributedCentavos)}`);
    return lines.join('\n');
  });

  const settlementLines: string[] = [copy.settlement.heading];
  if (settlement.transactions.length === 0) {
    settlementLines.push(copy.settlement.allSettled);
  } else {
    for (const transaction of settlement.transactions) {
      const debtorName = nameByIdentityId.get(transaction.fromParticipantId) ?? '';
      const creditorName = nameByIdentityId.get(transaction.toParticipantId) ?? '';
      const label = copy.settlement.owesLabel
        .replace('{debtor}', debtorName)
        .replace('{creditor}', creditorName);
      settlementLines.push(`${label} — ${formatCentavos(transaction.amountCentavos)}`);
    }
  }
  if (settlement.unaccountedCentavos !== 0) {
    settlementLines.push(
      settlement.unaccountedCentavos > 0
        ? copy.payments.unaccountedNote.replace(
            '{amount}',
            formatCentavos(settlement.unaccountedCentavos),
          )
        : copy.payments.overCollectedNote.replace(
            '{amount}',
            formatCentavos(Math.abs(settlement.unaccountedCentavos)),
          ),
    );
  }

  return [headerBlock, ...personBlocks, settlementLines.join('\n'), FOOTER_LINE].join('\n\n');
}
