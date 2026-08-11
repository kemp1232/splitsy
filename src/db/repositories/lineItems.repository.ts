import { asc, eq } from 'drizzle-orm';

import { db } from '../client';
import { lineItems } from '../schema';

export type LineItem = typeof lineItems.$inferSelect;
export type NewLineItem = typeof lineItems.$inferInsert;

export const lineItemsRepository = {
  async listByBillId(billId: string): Promise<LineItem[]> {
    return db
      .select()
      .from(lineItems)
      .where(eq(lineItems.billId, billId))
      .orderBy(asc(lineItems.sortOrder));
  },

  async create(item: NewLineItem): Promise<LineItem> {
    const [row] = await db.insert(lineItems).values(item).returning();
    if (!row) throw new Error('Failed to create line item');
    return row;
  },

  async update(id: string, patch: Partial<NewLineItem>): Promise<void> {
    await db.update(lineItems).set(patch).where(eq(lineItems.id, id));
  },

  // Cascade-deletes the item's assignments via the FK pragma in db/client.ts.
  async remove(id: string): Promise<void> {
    await db.delete(lineItems).where(eq(lineItems.id, id));
  },
};
