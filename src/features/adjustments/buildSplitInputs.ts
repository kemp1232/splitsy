// Shapes bill data already loaded from the repositories — line items plus
// their item-assignment rows, and adjustments plus their custom allocations —
// into the plain-data inputs src/features/splitting/splitCalculator.ts's
// calculateSplit expects (spec section 10). Pulled out of the adjustments
// screen so this repository-row -> calculation-input shaping is directly
// unit-testable without a database or a rendered screen in the loop.
import type { AdjustmentAllocation } from '@/db/repositories/adjustmentAllocations.repository';
import type { Adjustment } from '@/db/repositories/adjustments.repository';
import type { ItemAssignment } from '@/db/repositories/itemAssignments.repository';
import type { LineItem } from '@/db/repositories/lineItems.repository';
import { groupAssignedParticipantIdsByLineItem } from '@/features/assignments/partitionLineItemsByAssignment';
import type { SplitAdjustment, SplitLineItem } from '@/features/splitting/split.types';

// Every item must already have at least one assignee for calculateSplit to
// accept it (spec F-013 blocks continuing past the assignments screen while
// any item is unassigned) — callers are responsible for guarding against
// unassigned items before calling this. The adjustments screen redirects back
// to /assignments instead of ever calling calculateSplit when any item is
// still unassigned, so an empty assigneeParticipantIds array here would only
// ever reflect a real bug upstream, not a case this function silently patches
// over.
export function buildSplitLineItems(
  items: LineItem[],
  assignmentRows: ItemAssignment[],
): SplitLineItem[] {
  const assignedIdsByItem = groupAssignedParticipantIdsByLineItem(assignmentRows);
  return items.map((item) => ({
    lineItemId: item.id,
    lineTotalCentavos: item.lineTotalCentavos,
    assigneeParticipantIds: assignedIdsByItem.get(item.id) ?? [],
  }));
}

// customAllocationsByAdjustmentId only needs entries for CUSTOM adjustments
// (spec 9.6) — looked up by adjustment id, defaulting to an empty array for a
// CUSTOM adjustment that happens to have no stored allocation rows yet (e.g.
// immediately after switching an existing adjustment's method to CUSTOM,
// before the user has entered any per-participant amount).
export function buildSplitAdjustments(
  adjustments: Adjustment[],
  customAllocationsByAdjustmentId: Map<string, AdjustmentAllocation[]>,
): SplitAdjustment[] {
  return adjustments.map((adjustment) => ({
    adjustmentId: adjustment.id,
    amountCentavos: adjustment.amountCentavos,
    allocationMethod: adjustment.allocationMethod,
    customAllocations:
      adjustment.allocationMethod === 'CUSTOM'
        ? (customAllocationsByAdjustmentId.get(adjustment.id) ?? []).map((allocation) => ({
            participantId: allocation.participantId,
            amountCentavos: allocation.amountCentavos,
          }))
        : undefined,
  }));
}
