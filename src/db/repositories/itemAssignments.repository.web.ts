import { eq } from 'drizzle-orm';

import { db } from '../client';
import { itemAssignments, lineItems } from '../schema';

export type ItemAssignment = typeof itemAssignments.$inferSelect;
export type NewItemAssignment = typeof itemAssignments.$inferInsert;

// Web counterpart to itemAssignments.repository.ts. Identical except for
// `setForLineItem`'s transaction shape: drizzle-orm/sqlite-proxy (this app's
// web SQLite driver — see client.web.ts) only supports an *async* transaction
// callback (`await db.transaction(async (tx) => { await tx.x().run(); })`),
// unlike drizzle-orm/expo-sqlite's *sync* one (`db.transaction((tx) => {
// tx.x().run(); })`) that native uses — the two aren't source-compatible, so
// this can't be a shared file. Kept as a full duplicate rather than a
// partial re-export to avoid Metro's platform-extension resolution turning a
// relative self-import into an infinite loop (importing `./itemAssignments.repository`
// from this very file would resolve back to itself on the web platform).
export const itemAssignmentsRepository = {
  async listByBillId(billId: string): Promise<ItemAssignment[]> {
    return db
      .select({
        lineItemId: itemAssignments.lineItemId,
        participantId: itemAssignments.participantId,
        weight: itemAssignments.weight,
      })
      .from(itemAssignments)
      .innerJoin(lineItems, eq(itemAssignments.lineItemId, lineItems.id))
      .where(eq(lineItems.billId, billId));
  },

  async listByLineItemId(lineItemId: string): Promise<ItemAssignment[]> {
    return db.select().from(itemAssignments).where(eq(itemAssignments.lineItemId, lineItemId));
  },

  async setForLineItem(lineItemId: string, participantIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(itemAssignments).where(eq(itemAssignments.lineItemId, lineItemId)).run();

      if (participantIds.length > 0) {
        await tx
          .insert(itemAssignments)
          .values(participantIds.map((participantId) => ({ lineItemId, participantId })))
          .run();
      }
    });
  },
};
