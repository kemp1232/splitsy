import { eq } from 'drizzle-orm';

import { db } from '../client';
import { adjustmentAllocations } from '../schema';

export type AdjustmentAllocation = typeof adjustmentAllocations.$inferSelect;
export type NewAdjustmentAllocation = typeof adjustmentAllocations.$inferInsert;

// Web counterpart to adjustmentAllocations.repository.ts — same reasoning as
// itemAssignments.repository.web.ts (see its own header comment): the async
// vs. sync transaction-callback shapes aren't source-compatible between
// drizzle-orm/sqlite-proxy (web) and drizzle-orm/expo-sqlite (native), so
// this is a full duplicate rather than a partial re-export.
export const adjustmentAllocationsRepository = {
  async listByAdjustmentId(adjustmentId: string): Promise<AdjustmentAllocation[]> {
    return db
      .select()
      .from(adjustmentAllocations)
      .where(eq(adjustmentAllocations.adjustmentId, adjustmentId));
  },

  async setForAdjustment(
    adjustmentId: string,
    allocations: { participantId: string; amountCentavos: number }[],
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .delete(adjustmentAllocations)
        .where(eq(adjustmentAllocations.adjustmentId, adjustmentId))
        .run();

      if (allocations.length > 0) {
        await tx
          .insert(adjustmentAllocations)
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
