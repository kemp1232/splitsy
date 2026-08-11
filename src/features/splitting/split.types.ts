// Plain-data shapes for the splitting/allocation layer (spec sections 9.4-9.6,
// 10). Deliberately not the repository row types from src/db/repositories —
// callers (screens, hooks, services) translate their loaded rows into these
// shapes, which keeps this feature callable with plain data and no I/O, and
// independently testable without a database in the loop.

// Redeclared locally rather than imported from db/schema.ts or
// receipt-parser.types.ts (which each already redeclare it too) — same
// intentional decoupling precedent as receiptParser.types.ts's own copy of
// this literal union.
export type AllocationMethod = 'PROPORTIONAL' | 'EQUAL' | 'CUSTOM';

// A participant in stable bill order (spec 9.3's `sortOrder`). Callers must
// pass participants already sorted this way — allocateEqual/allocateProportional
// use array position, not any field on this type, to break remainder ties
// (spec 10.3/10.4/10.5's "stable participant sort order").
export type SplitParticipant = {
  participantId: string;
};

// One line item plus the participant ids it's assigned to (spec 9.2 + 9.4
// collapsed into the shape splitCalculator actually needs — a bill's item
// assignment rows already grouped by line item). `assigneeParticipantIds`
// must contain at least one id and must be in stable participant order.
export type SplitLineItem = {
  lineItemId: string;
  lineTotalCentavos: number;
  assigneeParticipantIds: string[];
};

// A single participant's stored custom amount for one CUSTOM adjustment
// (spec 9.6). Only meaningful when the owning SplitAdjustment's
// allocationMethod is 'CUSTOM'.
export type SplitAdjustmentAllocation = {
  participantId: string;
  amountCentavos: number;
};

// One adjustment (spec 9.5). `customAllocations` is required and used only
// when allocationMethod is 'CUSTOM' — it holds the already-validated,
// already-balanced per-participant amounts a user entered (spec 10.6);
// EQUAL/PROPORTIONAL adjustments are always computed deterministically and
// never carry stored allocations.
export type SplitAdjustment = {
  adjustmentId: string;
  amountCentavos: number;
  allocationMethod: AllocationMethod;
  customAllocations?: SplitAdjustmentAllocation[];
};

// Everything calculateSplit needs for one bill.
export type SplitCalculationInput = {
  participants: SplitParticipant[];
  items: SplitLineItem[];
  adjustments: SplitAdjustment[];
};

// One participant's share of a single line item (part of ParticipantShare's
// itemized breakdown below). Deliberately still just an id + amount — no
// item name/label here, same decoupling reasoning as SplitLineItem itself:
// callers attach display names by matching `lineItemId` against their own
// loaded rows (spec F-016/F-017's per-item breakdown UI does this).
export type ParticipantItemShare = {
  lineItemId: string;
  amountCentavos: number;
};

// One participant's share of a single adjustment — the adjustment analog of
// ParticipantItemShare above.
export type ParticipantAdjustmentShare = {
  adjustmentId: string;
  amountCentavos: number;
};

// One participant's final breakdown (spec 10.7's per-participant terms, plus
// spec F-016/F-017's itemized per-item/per-adjustment breakdown). `itemShares`
// and `adjustmentShares` are the same individual allocations calculateSplit
// already computes internally while accumulating `itemSubtotalCentavos`/
// `adjustmentTotalCentavos` — those two aggregate fields remain exactly
// `sum(itemShares)` / `sum(adjustmentShares)` respectively, so this is purely
// additive over the previous shape.
export type ParticipantShare = {
  participantId: string;
  itemShares: ParticipantItemShare[];
  adjustmentShares: ParticipantAdjustmentShare[];
  itemSubtotalCentavos: number;
  adjustmentTotalCentavos: number;
  finalTotalCentavos: number;
};

export type SplitCalculationResult = {
  participantShares: ParticipantShare[];
  itemSubtotalCentavos: number;
  adjustmentTotalCentavos: number;
  computedTotalCentavos: number;
};

// Inputs to the spec 10.2/10.8 reconciliation numbers. `detectedReceiptTotalCentavos`
// is null when no receipt total was detected or entered (e.g. a fully manual
// bill with no receipt total field filled in).
export type ReconciliationInput = {
  itemSubtotalCentavos: number;
  adjustmentTotalCentavos: number;
  detectedReceiptTotalCentavos: number | null;
};

export type ReconciliationResult = {
  itemSubtotalCentavos: number;
  adjustmentTotalCentavos: number;
  computedTotalCentavos: number;
  detectedReceiptTotalCentavos: number | null;
  // `detected - computed` (spec 10.2), null when there's no detected total to
  // compare against.
  differenceCentavos: number | null;
  // True when there is nothing to reconcile against (no detected total) or
  // the difference is exactly zero. False only when a detected total exists
  // and differs from the computed total — the one case the spec 10.8 UI
  // must surface as a discrepancy to resolve or acknowledge.
  matches: boolean;
};
