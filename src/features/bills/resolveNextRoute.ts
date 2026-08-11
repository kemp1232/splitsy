import { hasMinimumParticipants } from '@/features/participants/hasMinimumParticipants';

// Spec section 15 "Draft progression": a DRAFT bill's recommended next route
// is based purely on its content, checked in this exact order — the first
// matching rule wins. Pulled out as a small pure function (no repository or
// router dependency) so the ordered rule set is directly unit-testable; the
// caller (the home screen) is responsible for loading whatever a DRAFT bill
// needs to answer these questions — the same repositories the adjustments
// and summary screens' own draft-progression guards already read (line
// items, participants, item assignments, and the bill's own
// detected-total/discrepancyAcknowledged fields).
//
// Deliberately only meaningful for a DRAFT bill — a COMPLETED bill's next
// route is always its own saved-detail screen (`/bill/[billId]`), a
// separate, simpler status check the caller makes directly rather than
// folding bill status into this function's own draft-completeness logic.
export type NextRoute =
  | { screen: 'receipt-review' }
  | { screen: 'participants' }
  | { screen: 'assignments' }
  | { screen: 'adjustments' }
  | { screen: 'summary' };

export type ResolveNextRouteInput = {
  hasItems: boolean;
  participantCount: number;
  hasUnassignedItems: boolean;
  // True when there's a detected-total mismatch AND the bill hasn't
  // acknowledged it (discrepancyAcknowledged === false) — an unresolved
  // discrepancy, not merely a difference that exists but was already
  // explicitly continued past (spec 10.8/13.17's "Continue with
  // difference"). The caller computes this (e.g. via
  // reconcileBillTotals(...).matches && bill.discrepancyAcknowledged),
  // rather than this function reaching into reconciliation math itself.
  hasUnresolvedDiscrepancy: boolean;
};

/**
 * Implements spec section 15's ordered draft-progression rule:
 *
 * 1. No items -> receipt review/manual item entry.
 * 2. Fewer than two participants -> participants.
 * 3. Unassigned items -> assignments.
 * 4. Adjustments not reviewed or unresolved validation -> adjustments.
 * 5. Otherwise -> summary.
 *
 * Each rule is checked in order and the first one that matches wins — a bill
 * that's simultaneously missing items AND under the participant minimum
 * still routes to `receipt-review` (rule 1), not `participants`.
 */
export function resolveNextRoute(input: ResolveNextRouteInput): NextRoute {
  if (!input.hasItems) {
    return { screen: 'receipt-review' };
  }
  if (!hasMinimumParticipants(input.participantCount)) {
    return { screen: 'participants' };
  }
  if (input.hasUnassignedItems) {
    return { screen: 'assignments' };
  }
  if (input.hasUnresolvedDiscrepancy) {
    return { screen: 'adjustments' };
  }
  return { screen: 'summary' };
}
