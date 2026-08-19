import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SettlementCard } from '@/components/bill/SettlementCard';
import { TripPersonBalanceCard } from '@/components/trip/TripPersonBalanceCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { InlineError } from '@/components/ui/InlineError';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { copy } from '@/constants/copy';
import type { AdjustmentAllocation } from '@/db/repositories/adjustmentAllocations.repository';
import { adjustmentAllocationsRepository } from '@/db/repositories/adjustmentAllocations.repository';
import { adjustmentsRepository } from '@/db/repositories/adjustments.repository';
import { billsRepository } from '@/db/repositories/bills.repository';
import { itemAssignmentsRepository } from '@/db/repositories/itemAssignments.repository';
import { lineItemsRepository } from '@/db/repositories/lineItems.repository';
import { participantsRepository } from '@/db/repositories/participants.repository';
import type { Trip } from '@/db/repositories/trips.repository';
import { tripsRepository } from '@/db/repositories/trips.repository';
import { tripParticipantsRepository } from '@/db/repositories/tripParticipants.repository';
import {
  buildSplitAdjustments,
  buildSplitLineItems,
} from '@/features/adjustments/buildSplitInputs';
import {
  computeTripSettlement,
  type TripBillData,
  type TripSettlementResult,
} from '@/features/trips/computeTripSettlement';
import { nowIso } from '@/lib/date';
import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import { spacing } from '@/theme/tokens';

type LoadState = 'loading' | 'ready' | 'error';

type LoadedTripSettlementData = {
  trip: Trip;
  // null when the trip has zero COMPLETED bills — computeTripSettlement is
  // never called in that case (see this file's own fetch function below),
  // rather than calling it with an empty array and treating that as "settled".
  result: TripSettlementResult | null;
  nameByIdentityId: Map<string, string>;
  tripTotalCentavos: number;
};

// Assembles TripBillData[] from every COMPLETED bill in the trip, exactly the
// way bill/[billId]/summary.tsx and bill/[billId]/index.tsx already load and
// shape one bill's own data (buildSplitLineItems/buildSplitAdjustments), then
// hands it to the parallel-built, pure computeTripSettlement. Display names
// are resolved from whichever source actually has one for a given identity:
// the trip roster (tripParticipants, including deactivated members — a
// COMPLETED bill's participant may reference a roster row that's since been
// removed from the trip, and their name must still show up here) first, then
// falling back to that bill's own participant row's name for a person who
// was only ever added to this one bill.
async function fetchTripSettlementData(tripId: string): Promise<LoadedTripSettlementData | null> {
  const [trip, tripRoster, billEntries] = await Promise.all([
    tripsRepository.getById(tripId),
    tripParticipantsRepository.listByTripId(tripId, { activeOnly: false }),
    billsRepository.listByTripId(tripId),
  ]);

  if (!trip) return null;

  const completedBills = billEntries.filter((entry) => entry.bill.status === 'COMPLETED');
  const tripRosterNameById = new Map(tripRoster.map((member) => [member.id, member.name]));
  const nameByIdentityId = new Map<string, string>();

  if (completedBills.length === 0) {
    return { trip, result: null, nameByIdentityId, tripTotalCentavos: 0 };
  }

  const tripBills: TripBillData[] = await Promise.all(
    completedBills.map(async (entry) => {
      const [itemRows, participantRows, adjustmentRows, assignmentRows] = await Promise.all([
        lineItemsRepository.listByBillId(entry.bill.id),
        participantsRepository.listByBillId(entry.bill.id),
        adjustmentsRepository.listByBillId(entry.bill.id),
        itemAssignmentsRepository.listByBillId(entry.bill.id),
      ]);

      const customAllocationsByAdjustmentId = new Map<string, AdjustmentAllocation[]>();
      await Promise.all(
        adjustmentRows
          .filter((adjustment) => adjustment.allocationMethod === 'CUSTOM')
          .map(async (adjustment) => {
            const rows = await adjustmentAllocationsRepository.listByAdjustmentId(adjustment.id);
            customAllocationsByAdjustmentId.set(adjustment.id, rows);
          }),
      );

      const contributedCentavosByParticipantId = new Map<string, number>();
      const identityByParticipantId = new Map<string, string>();
      for (const participant of participantRows) {
        contributedCentavosByParticipantId.set(participant.id, participant.contributedCentavos);
        const identityId = participant.tripParticipantId ?? participant.id;
        identityByParticipantId.set(participant.id, identityId);
        if (!nameByIdentityId.has(identityId)) {
          nameByIdentityId.set(identityId, tripRosterNameById.get(identityId) ?? participant.name);
        }
      }

      return {
        billId: entry.bill.id,
        participants: participantRows.map((participant) => ({ participantId: participant.id })),
        items: buildSplitLineItems(itemRows, assignmentRows),
        adjustments: buildSplitAdjustments(adjustmentRows, customAllocationsByAdjustmentId),
        contributedCentavosByParticipantId,
        identityByParticipantId,
      };
    }),
  );

  const result = computeTripSettlement(tripBills);
  const tripTotalCentavos = result.perPerson.reduce(
    (sum, person) => sum + person.fairShareCentavos,
    0,
  );

  return { trip, result, nameByIdentityId, tripTotalCentavos };
}

export default function TripSettlementScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();

  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<LoadedTripSettlementData | null>(null);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const loaded = await fetchTripSettlementData(tripId);
      if (!loaded) {
        setState('error');
        return;
      }
      setData(loaded);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [tripId]);

  // Deliberately not `useEffect(() => { load(); }, [load])` — calling the
  // shared `load` callback directly inside an effect trips the
  // react-hooks/set-state-in-effect lint rule. This inline IIFE with its own
  // independent try/catch is this codebase's existing convention for a
  // screen's first load (see e.g. src/app/index.tsx's own copy of this same
  // shape).
  useEffect(() => {
    (async () => {
      try {
        const loaded = await fetchTripSettlementData(tripId);
        if (!loaded) {
          setState('error');
          return;
        }
        setData(loaded);
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [tripId]);

  if (state === 'loading') {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (state === 'error' || !data) {
    return (
      <Screen>
        <ErrorState
          heading={copy.global.genericErrorHeading}
          body={copy.global.genericErrorBody}
          retryLabel={copy.global.retryAction}
          onRetry={load}
        />
      </Screen>
    );
  }

  const title = data.trip.name ?? copy.trip.unknownTripTitle;
  const isSettled = data.trip.status === 'SETTLED';
  // "Mark trip settled" is only ever offered once there's something to
  // settle, and never auto-applied just because every bill happens to be
  // COMPLETED (see this screen's own header note / the trip hub's own
  // instructions) — it's a deliberate, explicit action the user takes here.
  const canMarkSettled = data.result !== null && !isSettled;

  async function handleMarkSettled() {
    setMarkError(null);
    setMarking(true);
    try {
      const timestamp = nowIso();
      await tripsRepository.update(tripId, { status: 'SETTLED', updatedAt: timestamp });
      setToastMessage(copy.tripSettlement.settledToast);
      setData((current) =>
        current
          ? { ...current, trip: { ...current.trip, status: 'SETTLED', updatedAt: timestamp } }
          : current,
      );
    } catch {
      setMarkError(copy.global.storageFailure);
    } finally {
      setMarking(false);
    }
  }

  return (
    <Screen
      scroll
      padded={false}
      footer={
        canMarkSettled ? (
          <BottomActionBar>
            {toastMessage ? <AppText color="success">{toastMessage}</AppText> : null}
            {markError ? <InlineError message={markError} /> : null}
            <AppButton
              label={copy.tripSettlement.markSettledAction}
              onPress={handleMarkSettled}
              loading={marking}
              disabled={marking}
            />
          </BottomActionBar>
        ) : undefined
      }
    >
      <View style={styles.body}>
        <AppText variant="heading">{copy.tripSettlement.heading}</AppText>
        <AppText variant="subheading">{title}</AppText>
        <StatusBadge
          label={isSettled ? copy.trip.settledBadge : copy.trip.activeBadge}
          tone={isSettled ? 'success' : 'neutral'}
        />

        {!data.result ? (
          <EmptyState
            heading={copy.tripSettlement.emptyHeading}
            body={copy.tripSettlement.emptyBody}
          />
        ) : (
          <>
            <View style={styles.totalRow}>
              <AppText color="textSecondary">{copy.tripSettlement.tripTotalLabel}</AppText>
              <AppText
                variant="amount"
                accessibilityLabel={formatCentavosForSpeech(data.tripTotalCentavos)}
              >
                {formatCentavos(data.tripTotalCentavos)}
              </AppText>
            </View>

            <View style={styles.cardsList}>
              {data.result.perPerson.map((person) => (
                <TripPersonBalanceCard
                  key={person.identityId}
                  name={data.nameByIdentityId.get(person.identityId) ?? ''}
                  fairShareCentavos={person.fairShareCentavos}
                  contributedCentavos={person.contributedCentavos}
                />
              ))}
            </View>

            <SettlementCard
              transactions={data.result.settlement.transactions}
              unaccountedCentavos={data.result.settlement.unaccountedCentavos}
              nameByParticipantId={data.nameByIdentityId}
              totalCentavos={data.tripTotalCentavos}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  cardsList: {
    gap: spacing.sm,
  },
});
