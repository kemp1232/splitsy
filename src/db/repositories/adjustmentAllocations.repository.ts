import { eq } from 'drizzle-orm';

import { db } from '../client';
import { adjustmentAllocations } from '../schema';

export type AdjustmentAllocation = typeof adjustmentAllocations.$inferSelect;
export type NewAdjustmentAllocation = typeof adjustmentAllocations.$inferInsert;

export const adjustmentAllocationsRepository = {
  // Rows only exist when the adjustment's allocationMethod is CUSTOM (spec
  // section 9.6) — PROPORTIONAL and EQUAL allocations are computed on the fly
  // and never persisted here.
  async listByAdjustmentId(adjustmentId: string): Promise<AdjustmentAllocation[]> {
    return db
      .select()
      .from(adjustmentAllocations)
      .where(eq(adjustmentAllocations.adjustmentId, adjustmentId));
  },

  // Replaces all custom allocations for a single adjustment. Delete-then-insert
  // must be atomic (spec section 19) so a crash mid-write never leaves the
  // adjustment with a partial allocation set — db.transaction() runs both
  // statements in one SQLite transaction, matching itemAssignmentsRepository.
  async setForAdjustment(
    adjustmentId: string,
    allocations: { participantId: string; amountCentavos: number }[],
  ): Promise<void> {
    db.transaction((tx) => {
      tx.delete(adjustmentAllocations)
        .where(eq(adjustmentAllocations.adjustmentId, adjustmentId))
        .run();

      if (allocations.length > 0) {
        tx.insert(adjustmentAllocations)
          .values(
            allocations.map(({ participantId, amountCentavos }) => ({
              adjustmentId,
              participantId,
              amountCentavos,
            })),
          )
          .run();
      }
    });
  },
};
