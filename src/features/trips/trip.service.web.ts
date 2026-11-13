import { asc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import type { Bill } from '@/db/repositories/bills.repository';
import type { Trip } from '@/db/repositories/trips.repository';
import { tripsRepository } from '@/db/repositories/trips.repository';
import { tripParticipantsRepository } from '@/db/repositories/tripParticipants.repository';
import { bills, debtPayments, participants, tripParticipants, trips } from '@/db/schema';
import type { CreateDraftBillInput } from '@/features/bills/bill.service';
import { deleteBill } from '@/features/bills/bill.service';
import {
  planBillToTripMove,
  type BillToTripMapping,
} from '@/features/trips/buildBillToTripMapping';
import { nowIso } from '@/lib/date';
import { createId } from '@/lib/ids';

// Web counterpart to trip.service.ts — same reasoning as
// bill.service.web.ts's own header comment: drizzle-orm/sqlite-proxy (this
// app's web SQLite driver) only supports an *async* `db.transaction()`
// callback, unlike native's sync one, so this can't be a shared file.

type CreateTripInput = {
  name?: string | null;
  rosterNames: string[];
};

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const timestamp = nowIso();

  return db.transaction(async (tx) => {
    const [trip] = await tx
      .insert(trips)
      .values({
        id: createId(),
        name: input.name ?? null,
        status: 'ACTIVE',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning();

    if (!trip) throw new Error('Failed to create trip');

    if (input.rosterNames.length > 0) {
      await tx.insert(tripParticipants).values(
        input.rosterNames.map((name, index) => ({
          id: createId(),
          tripId: trip.id,
          name,
          sortOrder: index,
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
    }

    return trip;
  });
}

export async function createBillInTrip(tripId: string, input: CreateDraftBillInput): Promise<Bill> {
  const roster = await tripParticipantsRepository.listByTripId(tripId);
  const timestamp = nowIso();

  return db.transaction(async (tx) => {
    const [bill] = await tx
      .insert(bills)
      .values({
        id: createId(),
        // Empty — named at display time (getBillDisplayTitle).
        title: '',
        currency: 'PHP',
        status: 'DRAFT',
        tripId,
        entryMethod: input.entryMethod,
        receiptImageUri: input.receiptImageUri ?? null,
        originalReceiptImageUri: input.originalReceiptImageUri ?? null,
        discrepancyAcknowledged: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning();

    if (!bill) throw new Error('Failed to create bill');

    if (roster.length > 0) {
      await tx.insert(participants).values(
        roster.map((member, index) => ({
          id: createId(),
          billId: bill.id,
          sortOrder: index,
          name: member.name,
          tripParticipantId: member.id,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
    }

    return bill;
  });
}

// Web counterpart to trip.service.ts's moveBillToTrip (see that one for the
// rules). sqlite-proxy runs this as BEGIN … COMMIT and issues ROLLBACK when the
// callback throws, serialized by client.web.ts's transaction lock, so the
// move is all-or-nothing here too.
export async function moveBillToTrip(
  billId: string,
  tripId: string,
  mapping: BillToTripMapping,
): Promise<void> {
  const timestamp = nowIso();

  await db.transaction(async (tx) => {
    const [bill] = await tx.select().from(bills).where(eq(bills.id, billId));
    const paidMarks = await tx.select().from(debtPayments).where(eq(debtPayments.billId, billId));
    const [trip] = await tx.select().from(trips).where(eq(trips.id, tripId));
    const roster = await tx
      .select()
      .from(tripParticipants)
      .where(eq(tripParticipants.tripId, tripId))
      .orderBy(asc(tripParticipants.sortOrder));
    const billParticipants = await tx
      .select()
      .from(participants)
      .where(eq(participants.billId, billId))
      .orderBy(asc(participants.sortOrder));

    const plan = planBillToTripMove(
      { bill, trip, paidMarkCount: paidMarks.length, roster, participants: billParticipants },
      mapping,
    );

    for (const memberId of plan.reactivateMemberIds) {
      await tx
        .update(tripParticipants)
        .set({ isActive: true, updatedAt: timestamp })
        .where(eq(tripParticipants.id, memberId));
    }

    const links = [...plan.links];
    for (const member of plan.newMembers) {
      const id = createId();
      await tx.insert(tripParticipants).values({
        id,
        tripId,
        name: member.name,
        sortOrder: member.sortOrder,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      links.push({ participantId: member.participantId, tripParticipantId: id });
    }

    for (const link of links) {
      await tx
        .update(participants)
        .set({ tripParticipantId: link.tripParticipantId, updatedAt: timestamp })
        .where(eq(participants.id, link.participantId));
    }

    await tx.update(bills).set({ tripId, updatedAt: timestamp }).where(eq(bills.id, billId));

    if (plan.reopenTrip) {
      await tx
        .update(trips)
        .set({ status: 'ACTIVE', updatedAt: timestamp })
        .where(eq(trips.id, tripId));
    }
  });
}

export async function deleteTrip(trip: Trip): Promise<void> {
  const tripBills: Bill[] = await db.select().from(bills).where(eq(bills.tripId, trip.id));

  for (const bill of tripBills) {
    await deleteBill(bill);
  }

  await tripsRepository.remove(trip.id);
}
