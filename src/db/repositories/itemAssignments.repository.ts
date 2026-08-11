import { eq } from 'drizzle-orm';

import { db } from '../client';
import { itemAssignments, lineItems } from '../schema';

export type ItemAssignment = typeof itemAssignments.$inferSelect;
export type NewItemAssignment = typeof itemAssignments.$inferInsert;

export const itemAssignmentsRepository = {
  // Assignments have no bill_id of their own, so this joins through line_items
  // to find every assignment for the bill — used to compute which line items
  // are unassigned across the whole bill.
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

  // Used to pre-select the current participants when opening the assignment
  // picker sheet for a single line item.
  async listByLineItemId(lineItemId: string): Promise<ItemAssignment[]> {
    return db.select().from(itemAssignments).where(eq(itemAssignments.lineItemId, lineItemId));
  },

  // Replaces all assignments for a single line item. Delete-then-insert must
  // be atomic (spec section 19) so a crash mid-write never leaves the item
  // with zero assignments — db.transaction() runs both statements in one
  // SQLite transaction, matching the precedent in bill.service.ts.
  async setForLineItem(lineItemId: string, participantIds: string[]): Promise<void> {
    db.transaction((tx) => {
      tx.delete(itemAssignments).where(eq(itemAssignments.lineItemId, lineItemId)).run();

      if (participantIds.length > 0) {
        tx.insert(itemAssignments)
          .values(participantIds.map((participantId) => ({ lineItemId, participantId })))
          .run();
      }
    });
  },
};
