// Labels of the CUSTOM-split adjustments that removing this participant will
// switch to a proportional split — exactly the adjustments
// bill.service.ts's removeParticipant rewrites (CUSTOM, with an allocation
// row for this participant), in the bill's adjustment order. Lets the
// remove-confirmation dialog warn about it before anything changes.
export function findAffectedCustomAdjustments(
  adjustments: { id: string; label: string; allocationMethod: string }[],
  allocations: { adjustmentId: string; participantId: string }[],
  participantId: string,
): string[] {
  const allocatedAdjustmentIds = new Set(
    allocations
      .filter((allocation) => allocation.participantId === participantId)
      .map((allocation) => allocation.adjustmentId),
  );
  return adjustments
    .filter(
      (adjustment) =>
        adjustment.allocationMethod === 'CUSTOM' && allocatedAdjustmentIds.has(adjustment.id),
    )
    .map((adjustment) => adjustment.label);
}
