import { desc, eq, sql } from 'drizzle-orm';

import { db } from '../client';
import { bills, participants } from '../schema';

export type Bill = typeof bills.$inferSelect;
export type NewBill = typeof bills.$inferInsert;
export type BillWithParticipantCount = { bill: Bill; participantCount: number };

export const billsRepository = {
  // Newest first, with participant count for the home list row (spec F-002).
  async listAllWithParticipantCounts(): Promise<BillWithParticipantCount[]> {
    return db
      .select({ bill: bills, participantCount: sql<number>`count(${participants.id})` })
      .from(bills)
      .leftJoin(participants, eq(participants.billId, bills.id))
      .groupBy(bills.id)
      .orderBy(desc(bills.updatedAt));
  },

  async getById(id: string): Promise<Bill | undefined> {
    const [row] = await db.select().from(bills).where(eq(bills.id, id));
    return row;
  },

  async create(bill: NewBill): Promise<Bill> {
    const [row] = await db.insert(bills).values(bill).returning();
    if (!row) throw new Error('Failed to create bill');
    return row;
  },

  async update(id: string, patch: Partial<NewBill>): Promise<void> {
    await db.update(bills).set(patch).where(eq(bills.id, id));
  },

  // Cascade-deletes line_items, participants, adjustments (and their child
  // rows) via the FK pragma enabled in db/client.ts — caller is responsible
  // for deleting the bill's receipt image files (not a DB concern).
  async remove(id: string): Promise<void> {
    await db.delete(bills).where(eq(bills.id, id));
  },
};
