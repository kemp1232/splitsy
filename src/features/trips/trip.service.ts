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

type CreateTripInput = {
  name?: string | null;
  rosterNames: string[];
};

// A Trip groups several bills that share one default participant roster
// (spec-adjacent Trip feature, see PLAN.md — not from the numbered MVP
// spec). Mirrors bill.service.ts's createQuickSplitBill: one
// db.transaction so a partial write never leaves a trip with no roster, or
// a roster with no trip.
export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const timestamp = nowIso();

  return db.transaction((tx) => {
    const [trip] = tx
      .insert(trips)
      .values({
        id: createId(),
        name: input.name ?? null,
        status: 'ACTIVE',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning()
      .all();

    if (!trip) throw new Error('Failed to create trip');

    if (input.rosterNames.length > 0) {
      tx.insert(tripParticipants)
        .values(
          input.rosterNames.map((name, index) => ({
            id: createId(),
            tripId: trip.id,
            name,
            sortOrder: index,
            isActive: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          })),
        )
        .run();
    }

    return trip;
  });
}

// A NEW sibling of bill.service.ts's createDraftBill — not a modification of
// it — following this codebase's existing precedent (createDraftBill vs.
// createQuickSplitBill are already separate, single-purpose creation
// functions rather than one function with branching options).
//
// The trip's roster is read (active members only, in roster order) *before*
// the transaction starts: tripParticipantsRepository.listByTripId goes
// through the plain top-level `db` connection, not `tx`, so it can't
// participate in the write transaction below — but it's a read that has to
// happen exactly once per call, and reading it up front (rather than inside
// the transaction) keeps the transaction itself limited to the writes that
// actually need to be atomic together: the bill row and its copied
// participant rows.
export async function createBillInTrip(tripId: string, input: CreateDraftBillInput): Promise<Bill> {
  const roster = await tripParticipantsRepository.listByTripId(tripId);
  const timestamp = nowIso();

  return db.transaction((tx) => {
    const [bill] = tx
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
      .returning()
      .all();

    if (!bill) throw new Error('Failed to create bill');

    // Roster auto-fills every new bill in the trip (confirmed product
    // decision — still editable per bill afterward via the existing
    // participants screen, same as any other bill's participants).
    // `tripParticipantId` links each copy back to its roster row so a later
    // roster rename/deactivation can be told apart from a bill-local edit,
    // without this copy ever being affected by it (schema.ts's
    // `onDelete: 'set null'` comment on participants.tripParticipantId).
    if (roster.length > 0) {
      tx.insert(participants)
        .values(
          roster.map((member, index) => ({
            id: createId(),
            billId: bill.id,
            sortOrder: index,
            name: member.name,
            tripParticipantId: member.id,
            createdAt: timestamp,
            updatedAt: timestamp,
          })),
        )
        .run();
    }

    return bill;
  });
}

// Moves a standalone bill (tripId null) into an existing trip. One
// transaction, and every guard is re-checked inside it against fresh rows
// (planBillToTripMove) — the bill must still be standalone, have no
// bill-scoped paid marks (those are keyed by this bill's participant ids and
// mean nothing in the trip's combined settle-up, so the move is blocked
// rather than deleting or converting them), and the mapping must still match
// the bill's current participants and the trip's active roster. Any throw
// rolls everything back. An "Add to trip" person named like a deactivated
// roster member reactivates that row instead of inserting a duplicate.
// Bill participants keep their own names (bill-level
// shares are unchanged); the trip settlement shows the roster name. A SETTLED
// trip is reopened the way the hub's ensureTripActive does when a bill is
// added; an ACTIVE trip is left untouched, as createBillInTrip does.
export async function moveBillToTrip(
  billId: string,
  tripId: string,
  mapping: BillToTripMapping,
): Promise<void> {
  const timestamp = nowIso();

  db.transaction((tx) => {
    const [bill] = tx.select().from(bills).where(eq(bills.id, billId)).all();
    const paidMarks = tx.select().from(debtPayments).where(eq(debtPayments.billId, billId)).all();
    const [trip] = tx.select().from(trips).where(eq(trips.id, tripId)).all();
    const roster = tx
      .select()
      .from(tripParticipants)
      .where(eq(tripParticipants.tripId, tripId))
      .orderBy(asc(tripParticipants.sortOrder))
      .all();
    const billParticipants = tx
      .select()
      .from(participants)
      .where(eq(participants.billId, billId))
      .orderBy(asc(participants.sortOrder))
      .all();

    const plan = planBillToTripMove(
      { bill, trip, paidMarkCount: paidMarks.length, roster, participants: billParticipants },
      mapping,
    );

    for (const memberId of plan.reactivateMemberIds) {
      tx.update(tripParticipants)
        .set({ isActive: true, updatedAt: timestamp })
        .where(eq(tripParticipants.id, memberId))
        .run();
    }

    const links = [...plan.links];
    for (const member of plan.newMembers) {
      const id = createId();
      tx.insert(tripParticipants)
        .values({
          id,
          tripId,
          name: member.name,
          sortOrder: member.sortOrder,
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
      links.push({ participantId: member.participantId, tripParticipantId: id });
    }

    for (const link of links) {
      tx.update(participants)
        .set({ tripParticipantId: link.tripParticipantId, updatedAt: timestamp })
        .where(eq(participants.id, link.participantId))
        .run();
    }

    tx.update(bills).set({ tripId, updatedAt: timestamp }).where(eq(bills.id, billId)).run();

    if (plan.reopenTrip) {
      tx.update(trips)
        .set({ status: 'ACTIVE', updatedAt: timestamp })
        .where(eq(trips.id, tripId))
        .run();
    }
  });
}

// Permanently deletes a trip and every bill under it (spec-adjacent Trip
// feature — combined settle-up and its UI are separate work, not this
// function's job).
//
// Deliberately does not rely on bills.tripId's own FK cascade (schema.ts):
// that raw cascade would delete the bill rows but skip bill.service.ts's
// deleteBill, which is what actually removes each bill's app-owned receipt
// image files. Reusing deleteBill per-bill here means a trip's bills are
// deleted exactly the same way a standalone bill would be, so no image file
// is ever orphaned just because the bill happened to belong to a trip. Only
// once every bill (and its files) is gone does the trip row itself get
// removed, which cascades away the trip's tripParticipants rows via the FK
// pragma (db/client.ts) — those never owned any files of their own, so a
// plain cascade is fine for them.
export async function deleteTrip(trip: Trip): Promise<void> {
  const tripBills: Bill[] = await db.select().from(bills).where(eq(bills.tripId, trip.id));

  for (const bill of tripBills) {
    deleteBill(bill);
  }

  await tripsRepository.remove(trip.id);
}
