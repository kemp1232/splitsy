import { asc, eq } from 'drizzle-orm';

import { db } from '../client';
import { adjustments } from '../schema';

export type Adjustment = typeof adjustments.$inferSelect;
export type NewAdjustment = typeof adjustments.$inferInsert;

export const adjustmentsRepository = {
  async listByBillId(billId: string): Promise<Adjustment[]> {
    return db
      .select()
      .from(adjustments)
      .where(eq(adjustments.billId, billId))
      .orderBy(asc(adjustments.sortOrder));
  },

  async create(adjustment: NewAdjustment): Promise<Adjustment> {
    const [row] = await db.insert(adjustments).values(adjustment).returning();
    if (!row) throw new Error('Failed to create adjustment');
    return row;
  },

  async update(id: string, patch: Partial<NewAdjustment>): Promise<void> {
    await db.update(adjustments).set(patch).where(eq(adjustments.id, id));
  },

  // Cascade-deletes the adjustment's custom allocations via the FK pragma in db/client.ts.
  async remove(id: string): Promise<void> {
    await db.delete(adjustments).where(eq(adjustments.id, id));
  },
};
