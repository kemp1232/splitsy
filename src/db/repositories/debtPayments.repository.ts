import { and, eq, sql } from 'drizzle-orm';

import { createId } from '@/lib/ids';

import { db } from '../client';
import { debtPayments } from '../schema';

export type DebtPayment = typeof debtPayments.$inferSelect;

// Exactly one scope per mark (see schema.ts's debtPayments comment).
export type DebtPaymentScope = { billId: string } | { tripId: string };

export type DebtPaymentMark = { fromKey: string; toKey: string; amountCentavos: number };

function scopeColumn(scope: DebtPaymentScope) {
  return 'billId' in scope ? debtPayments.billId : debtPayments.tripId;
}

function scopeId(scope: DebtPaymentScope): string {
  return 'billId' in scope ? scope.billId : scope.tripId;
}

// One shared file for native and web: every write below is a single
// statement (no db.transaction), so the expo-sqlite sync vs sqlite-proxy
// async transaction split (see itemAssignments.repository.web.ts) doesn't
// apply here.
export const debtPaymentsRepository = {
  async listByBillId(billId: string): Promise<DebtPayment[]> {
    return db.select().from(debtPayments).where(eq(debtPayments.billId, billId));
  },

  async listByTripId(tripId: string): Promise<DebtPayment[]> {
    return db.select().from(debtPayments).where(eq(debtPayments.tripId, tripId));
  },

  async markPaid(scope: DebtPaymentScope, mark: DebtPaymentMark): Promise<void> {
    await debtPaymentsRepository.markManyPaid(scope, [mark]);
  },

  // Upsert: a stale mark for the same debtor/creditor pair (recorded against
  // an older amount) is overwritten with the current amount. One multi-row
  // INSERT ... ON CONFLICT statement, so it's atomic on its own.
  async markManyPaid(scope: DebtPaymentScope, marks: DebtPaymentMark[]): Promise<void> {
    if (marks.length === 0) return;
    const billId = 'billId' in scope ? scope.billId : null;
    const tripId = 'tripId' in scope ? scope.tripId : null;
    await db
      .insert(debtPayments)
      .values(
        marks.map((mark) => ({
          id: createId(),
          billId,
          tripId,
          fromKey: mark.fromKey,
          toKey: mark.toKey,
          amountCentavos: mark.amountCentavos,
        })),
      )
      .onConflictDoUpdate({
        target: [scopeColumn(scope), debtPayments.fromKey, debtPayments.toKey],
        set: { amountCentavos: sql`excluded.amount_centavos` },
      });
  },

  // Removes the pair's mark whatever amount it was recorded against.
  async unmarkPaid(scope: DebtPaymentScope, fromKey: string, toKey: string): Promise<void> {
    await db
      .delete(debtPayments)
      .where(
        and(
          eq(scopeColumn(scope), scopeId(scope)),
          eq(debtPayments.fromKey, fromKey),
          eq(debtPayments.toKey, toKey),
        ),
      );
  },
};
