// Pure rules for moving a standalone bill into a trip (trip.service.ts's
// moveBillToTrip): which trip roster member each of the bill's participants
// becomes. Kept free of I/O so the move screen and both service variants
// (native + web) share one tested implementation.
//
// "Same person" for the suggestions means the same name after trimming,
// case-insensitive — the exact rule the bill and trip duplicate-name checks
// already use (normalizeParticipantName), so a name the roster editor would
// reject as "already in this trip" is the one suggested here.

import {
  normalizeParticipantName,
  validateParticipantName,
} from '@/features/participants/validateParticipantName';

// 'existing': this participant is that roster member. 'new': add this
// participant to the trip roster as a new person (named as on the bill).
export type BillToTripChoice = { kind: 'existing'; tripParticipantId: string } | { kind: 'new' };

// Keyed by the bill's own participant id.
export type BillToTripMapping = Record<string, BillToTripChoice>;

type NamedRow = { id: string; name: string };

export type BillToTripMappingValidation =
  | { valid: true }
  | {
      valid: false;
      reason: 'unmapped' | 'unknownMember' | 'memberUsedTwice' | 'invalidNewName';
      participantId: string;
    };

// Pre-selects the roster member with the same name; everyone else defaults to
// "Add to trip". A roster member is suggested for at most one participant
// (the first, in the order given), since two bill people can never be the
// same trip person.
export function suggestBillToTripMapping(
  participants: NamedRow[],
  roster: NamedRow[],
): BillToTripMapping {
  const used = new Set<string>();
  const mapping: BillToTripMapping = {};
  for (const participant of participants) {
    const normalized = normalizeParticipantName(participant.name);
    const match = roster.find(
      (member) => !used.has(member.id) && normalizeParticipantName(member.name) === normalized,
    );
    if (match) {
      used.add(match.id);
      mapping[participant.id] = { kind: 'existing', tripParticipantId: match.id };
    } else {
      mapping[participant.id] = { kind: 'new' };
    }
  }
  return mapping;
}

// Re-suggests after the bill or trip changed under the move screen (a failed
// move reloads fresh rows): every previous choice still valid against the
// fresh data is kept — the participant is still on the bill, an 'existing'
// member is still on the active roster and not already kept for an earlier
// participant, a 'new' name still passes the roster's name rules — and only
// the rest fall back to suggestBillToTripMapping's name match (never onto a
// member already kept).
export function mergeBillToTripMapping(
  previous: BillToTripMapping,
  participants: NamedRow[],
  roster: NamedRow[],
): BillToTripMapping {
  const rosterIds = new Set(roster.map((member) => member.id));
  const usedMemberIds = new Set<string>();
  const takenNames = roster.map((member) => member.name);
  const kept: BillToTripMapping = {};

  for (const participant of participants) {
    const choice = Object.prototype.hasOwnProperty.call(previous, participant.id)
      ? previous[participant.id]
      : undefined;
    if (choice?.kind === 'existing') {
      if (rosterIds.has(choice.tripParticipantId) && !usedMemberIds.has(choice.tripParticipantId)) {
        usedMemberIds.add(choice.tripParticipantId);
        kept[participant.id] = choice;
      }
    } else if (choice?.kind === 'new') {
      const result = validateParticipantName(participant.name, takenNames);
      if (result.valid) {
        takenNames.push(result.name);
        kept[participant.id] = choice;
      }
    }
  }

  const rest = participants.filter((participant) => !kept[participant.id]);
  const freeRoster = roster.filter((member) => !usedMemberIds.has(member.id));
  return { ...suggestBillToTripMapping(rest, freeRoster), ...kept };
}

// A mapping is valid when it covers exactly the bill's current participants,
// only points at members of the given (active) roster, uses each roster member
// at most once (two bill people mapped to one member would be merged into one
// balance by computeTripSettlement), and every "Add to trip" name would pass
// the roster's own name rules (required, length, not already on the roster or
// added twice by this same move).
export function validateBillToTripMapping(
  participants: NamedRow[],
  roster: NamedRow[],
  mapping: BillToTripMapping,
): BillToTripMappingValidation {
  const participantIds = new Set(participants.map((participant) => participant.id));
  for (const key of Object.keys(mapping)) {
    if (!participantIds.has(key)) return { valid: false, reason: 'unmapped', participantId: key };
  }

  const rosterIds = new Set(roster.map((member) => member.id));
  const usedMemberIds = new Set<string>();
  const takenNames = roster.map((member) => member.name);

  for (const participant of participants) {
    const choice = Object.prototype.hasOwnProperty.call(mapping, participant.id)
      ? mapping[participant.id]
      : undefined;
    if (!choice) return { valid: false, reason: 'unmapped', participantId: participant.id };

    if (choice.kind === 'existing') {
      if (!rosterIds.has(choice.tripParticipantId)) {
        return { valid: false, reason: 'unknownMember', participantId: participant.id };
      }
      if (usedMemberIds.has(choice.tripParticipantId)) {
        return { valid: false, reason: 'memberUsedTwice', participantId: participant.id };
      }
      usedMemberIds.add(choice.tripParticipantId);
    } else {
      const result = validateParticipantName(participant.name, takenNames);
      if (!result.valid) {
        return { valid: false, reason: 'invalidNewName', participantId: participant.id };
      }
      takenNames.push(result.name);
    }
  }

  return { valid: true };
}

export type MoveBillToTripFailure =
  'billNotFound' | 'alreadyInTrip' | 'hasPaidMarks' | 'tripNotFound' | 'invalidMapping';

// Thrown by trip.service.ts's / trip.service.web.ts's moveBillToTrip (from
// inside the transaction, so nothing is written). Lives here rather than in
// either service file so the screen can import it on both platforms.
export class MoveBillToTripError extends Error {
  readonly reason: MoveBillToTripFailure;

  constructor(reason: MoveBillToTripFailure) {
    super(`Cannot move bill into trip: ${reason}`);
    this.name = 'MoveBillToTripError';
    this.reason = reason;
  }
}

// What moveBillToTrip reads inside its transaction — fresh rows, never the
// screen's possibly stale copy.
export type BillToTripMoveState = {
  bill: { id: string; tripId: string | null } | undefined;
  trip: { id: string; status: 'ACTIVE' | 'SETTLED' } | undefined;
  // Bill-scoped paid marks (debt_payments.bill_id = bill.id).
  paidMarkCount: number;
  // Every roster row of the trip, active and deactivated.
  roster: { id: string; name: string; sortOrder: number; isActive: boolean }[];
  participants: NamedRow[];
};

export type BillToTripMovePlan = {
  newMembers: { participantId: string; name: string; sortOrder: number }[];
  // Deactivated roster rows to flip back to active (sortOrder unchanged).
  reactivateMemberIds: string[];
  links: { participantId: string; tripParticipantId: string }[];
  reopenTrip: boolean;
};

// Checks every guard against the fresh state and returns the writes to make,
// or throws MoveBillToTripError. An "Add to trip" person whose name matches a
// deactivated roster member reuses that row (tripParticipants.repository.ts's
// deactivate comment: re-adding someone must keep their roster id, since the
// trip settlement keys by it) — the lowest sortOrder one if several match.
// Otherwise they get a new row with the participant's trimmed name, sorted
// after every existing roster row (deactivated ones included, so no sortOrder
// is reused). `links` covers existing and reactivated members; the services
// link each new member once they've minted its id.
export function planBillToTripMove(
  state: BillToTripMoveState,
  mapping: BillToTripMapping,
): BillToTripMovePlan {
  if (!state.bill) throw new MoveBillToTripError('billNotFound');
  if (state.bill.tripId !== null) throw new MoveBillToTripError('alreadyInTrip');
  if (state.paidMarkCount > 0) throw new MoveBillToTripError('hasPaidMarks');
  if (!state.trip) throw new MoveBillToTripError('tripNotFound');

  const activeRoster = state.roster.filter((member) => member.isActive);
  if (!validateBillToTripMapping(state.participants, activeRoster, mapping).valid) {
    throw new MoveBillToTripError('invalidMapping');
  }

  let nextSortOrder = state.roster.reduce((max, member) => Math.max(max, member.sortOrder), -1) + 1;
  const deactivatedByName = new Map<string, { id: string; sortOrder: number }>();
  for (const member of state.roster) {
    if (member.isActive) continue;
    const key = normalizeParticipantName(member.name);
    const current = deactivatedByName.get(key);
    if (!current || member.sortOrder < current.sortOrder) deactivatedByName.set(key, member);
  }

  const newMembers: BillToTripMovePlan['newMembers'] = [];
  const reactivateMemberIds: string[] = [];
  const links: BillToTripMovePlan['links'] = [];
  for (const participant of state.participants) {
    const choice = mapping[participant.id];
    // Validation already guarantees a 'new' name isn't on the active roster
    // and isn't used by another 'new' choice, so each row is reused once.
    const formerMember =
      choice?.kind === 'new'
        ? deactivatedByName.get(normalizeParticipantName(participant.name))
        : undefined;
    if (choice?.kind === 'existing') {
      links.push({ participantId: participant.id, tripParticipantId: choice.tripParticipantId });
    } else if (formerMember) {
      reactivateMemberIds.push(formerMember.id);
      links.push({ participantId: participant.id, tripParticipantId: formerMember.id });
    } else {
      newMembers.push({
        participantId: participant.id,
        name: participant.name.trim(),
        sortOrder: nextSortOrder,
      });
      nextSortOrder += 1;
    }
  }

  return { newMembers, reactivateMemberIds, links, reopenTrip: state.trip.status === 'SETTLED' };
}
