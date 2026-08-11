// Plain-data shapes for the post-MVP settlement feature (see settlement.ts's
// header comment for the placement decision and full rationale — this lives
// alongside calculateSplit/reconciliation rather than in its own feature
// folder because it is a direct, pure consumer of `calculateSplit`'s output,
// same reasoning shareText.ts already documents for itself).

// One participant's fair share (from `calculateSplit`'s
// `ParticipantShare.finalTotalCentavos`) alongside what they actually
// contributed toward the bill (e.g. what they handed the merchant or
// reimbursed the organizer). Order matters: `participants` passed to
// `computeSettlement` must already be in the bill's stable participant order
// (spec 10.3/10.4/10.5's convention) — that array position is the tie-break
// this module uses when two debtors or two creditors have equal magnitude.
export type SettlementParticipant = {
  participantId: string;
  fairShareCentavos: number;
  contributedCentavos: number;
};

// One suggested peer-to-peer payment: `fromParticipantId` pays
// `toParticipantId` exactly `amountCentavos` to move the group closer to
// everyone having paid their fair share.
export type SettlementTransaction = {
  fromParticipantId: string;
  toParticipantId: string;
  amountCentavos: number;
};

export type SettlementResult = {
  transactions: SettlementTransaction[];
  // `sum(fairShareCentavos) - sum(contributedCentavos)`. Positive means that
  // much of the bill has not been covered by anyone's contribution yet (the
  // "nobody has paid the merchant/organizer" case, including the common
  // all-zero-contributions default). Negative means more was contributed in
  // total than the bill actually required (e.g. a pooled tip or a
  // data-entry mistake). Zero means every centavo of the bill is accounted
  // for by someone's contribution, so the transactions above are a complete
  // settlement. See settlement.ts's `computeSettlement` doc comment for how
  // this relates to any leftover, unmatched debtor/creditor balance.
  unaccountedCentavos: number;
};
