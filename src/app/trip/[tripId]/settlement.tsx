import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { SettlementCard } from '@/components/bill/SettlementCard';
import { TripPersonBalanceCard } from '@/components/trip/TripPersonBalanceCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GradientHeroCard } from '@/components/ui/GradientHeroCard';
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
import { groupAssignedParticipantIdsByLineItem } from '@/features/assignments/partitionLineItemsByAssignment';
import { calculateSplit } from '@/features/splitting/splitCalculator';
import {
  buildTripParticipantItemShareDisplay,
  type TripItemInfo,
  type TripItemShareDisplay,
} from '@/features/trips/buildTripParticipantItemShareDisplay';
import { buildTripShareText } from '@/features/trips/buildTripShareText';
import {
  computeTripSettlement,
  type TripBillData,
  type TripSettlementResult,
} from '@/features/trips/computeTripSettlement';
import { nowIso } from '@/lib/date';
import { spacing } from '@/theme/tokens';

type LoadState = 'loading' | 'ready' | 'error';

// One bill's worth of a person's item shares, labeled with which bill they're
// from — a trip settlement spans multiple bills, so "all the items this
// person is assigned to" (the expanded card's whole reason to exist) reads as
// a list grouped per bill, not one undifferentiated pile of item names that
// might collide across two different restaurants' menus.
type TripPersonBillItems = {
  billId: string;
  billLabel: string;
  items: TripItemShareDisplay[];
};

type LoadedTripSettlementData = {
  trip: Trip;
  // null when the trip has zero COMPLETED bills — computeTripSettlement is
  // never called in that case (see this file's own fetch function below),
  // rather than calling it with an empty array and treating that as "settled".
  result: TripSettlementResult | null;
  nameByIdentityId: Map<string, string>;
  tripTotalCentavos: number;
  // Every identity's item shares, grouped per bill, in bill order — feeds the
  // expanded section of TripPersonBalanceCard. Empty array for an identity
  // with no nonzero item shares in any COMPLETED bill (shouldn't normally
  // happen, but the card renders correctly either way).
  billItemsByIdentityId: Map<string, TripPersonBillItems[]>;
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
  const billItemsByIdentityId = new Map<string, TripPersonBillItems[]>();

  if (completedBills.length === 0) {
    return { trip, result: null, nameByIdentityId, tripTotalCentavos: 0, billItemsByIdentityId };
  }

  // Each bill's callback returns its own TripBillData (for the aggregate
  // settlement below) plus this bill's per-identity item rows — merged into
  // billItemsByIdentityId only after every bill has resolved (not from inside
  // the concurrent Promise.all callbacks themselves), since two different
  // bills can share the same identity and mutating one shared Map from
  // multiple in-flight async callbacks would risk a lost update.
  const perBillResults = await Promise.all(
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

      const splitItems = buildSplitLineItems(itemRows, assignmentRows);
      const splitAdjustments = buildSplitAdjustments(
        adjustmentRows,
        customAllocationsByAdjustmentId,
      );
      const tripBillData: TripBillData = {
        billId: entry.bill.id,
        participants: participantRows.map((participant) => ({ participantId: participant.id })),
        items: splitItems,
        adjustments: splitAdjustments,
        contributedCentavosByParticipantId,
        identityByParticipantId,
      };

      // Same calculateSplit call computeTripSettlement will make again
      // internally for its own aggregation — cheap and pure, so recomputing
      // it here (rather than having computeTripSettlement expose its
      // per-bill splitResults) keeps that module's contract exactly as
      // documented: aggregate totals only, never item-level detail.
      const billSplit = calculateSplit({
        participants: tripBillData.participants,
        items: splitItems,
        adjustments: splitAdjustments,
      });
      const assigneeIdsByLineItem = groupAssignedParticipantIdsByLineItem(assignmentRows);
      const itemInfoById = new Map<string, TripItemInfo>(
        itemRows.map((item) => [
          item.id,
          { name: item.name, assigneeParticipantIds: assigneeIdsByLineItem.get(item.id) ?? [] },
        ]),
      );
      const nameByParticipantId = new Map(
        participantRows.map((participant) => [participant.id, participant.name]),
      );
      const billLabel =
        entry.bill.merchantName ?? entry.bill.title ?? copy.home.unknownMerchantTitle;

      const personItems = participantRows.map((participant) => {
        const share = billSplit.participantShares.find((s) => s.participantId === participant.id);
        const items = share
          ? buildTripParticipantItemShareDisplay(
              participant.id,
              share.itemShares,
              itemInfoById,
              nameByParticipantId,
            )
          : [];
        return { identityId: identityByParticipantId.get(participant.id)!, items };
      });

      return { tripBillData, billLabel, personItems };
    }),
  );

  for (const { tripBillData, billLabel, personItems } of perBillResults) {
    for (const { identityId, items } of personItems) {
      if (items.length === 0) continue;
      const existing = billItemsByIdentityId.get(identityId) ?? [];
      existing.push({ billId: tripBillData.billId, billLabel, items });
      billItemsByIdentityId.set(identityId, existing);
    }
  }

  const tripBills = perBillResults.map((r) => r.tripBillData);
  const result = computeTripSettlement(tripBills);
  const tripTotalCentavos = result.perPerson.reduce(
    (sum, person) => sum + person.fairShareCentavos,
    0,
  );

  return { trip, result, nameByIdentityId, tripTotalCentavos, billItemsByIdentityId };
}

export default function TripSettlementScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();

  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<LoadedTripSettlementData | null>(null);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

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

  // Reuses buildTripShareText (pure, tested separately) with exactly the
  // data this screen already has loaded — same "assemble from already-loaded
  // state, never re-fetch for a share action" discipline as
  // summary.tsx's own buildShareTextForBill.
  function buildShareTextForTrip(): string {
    if (!data || !data.result) throw new Error('buildShareTextForTrip: settlement not loaded');
    const people = data.result.perPerson.map((person) => ({
      name: data.nameByIdentityId.get(person.identityId) ?? '',
      fairShareCentavos: person.fairShareCentavos,
      contributedCentavos: person.contributedCentavos,
      billItems: data.billItemsByIdentityId.get(person.identityId) ?? [],
    }));
    return buildTripShareText({
      tripTitle: title,
      tripTotalCentavos: data.tripTotalCentavos,
      people,
      settlement: data.result.settlement,
      nameByIdentityId: data.nameByIdentityId,
    });
  }

  async function handleShare() {
    setShareError(null);
    try {
      await Share.share({ message: buildShareTextForTrip() });
    } catch {
      setShareError(copy.summary.shareFailure);
    }
  }

  async function handleCopy() {
    setCopyError(null);
    try {
      await Clipboard.setStringAsync(buildShareTextForTrip());
      setToastMessage(copy.summary.copiedToast);
    } catch {
      // Same reasoning as summary.tsx's own handleCopy fallback —
      // expo-clipboard's setStringAsync always resolves on iOS/Android per
      // its own docs, so this only ever fires from some unexpected native
      // failure, and there's no dedicated copy string for it.
      setCopyError(copy.global.genericErrorBody);
    }
  }

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
      <View style={styles.headerRow}>
        <AppText variant="heading">{copy.tripSettlement.heading}</AppText>
        <AppText variant="subheading">{title}</AppText>
        <StatusBadge
          label={isSettled ? copy.trip.settledBadge : copy.trip.activeBadge}
          tone={isSettled ? 'success' : 'neutral'}
        />
      </View>

      {/* Gradient hero card (reference UI's rounded-bottom-corner "hero
          panel", screenshot 2) — only once there's an actual trip settlement
          total to show (never fabricated for the "nothing to settle yet"
          empty state below). */}
      {data.result ? (
        <GradientHeroCard
          label={copy.tripSettlement.tripTotalLabel}
          amountCentavos={data.tripTotalCentavos}
        />
      ) : null}

      <View style={styles.body}>
        {/* Rendered in the body, not the footer — the footer only exists
            while canMarkSettled is true, which flips to false the instant
            handleMarkSettled succeeds (isSettled becomes true), so a toast
            set at that same moment would otherwise never actually be shown.
            This also covers handleCopy's toast on an already-settled trip,
            which has no footer at all. */}
        {toastMessage ? <AppText color="success">{toastMessage}</AppText> : null}

        {!data.result ? (
          <EmptyState
            heading={copy.tripSettlement.emptyHeading}
            body={copy.tripSettlement.emptyBody}
          />
        ) : (
          <>
            <View style={styles.actionsRow}>
              <View style={styles.actionColumn}>
                <AppButton
                  variant="secondary"
                  label={copy.summary.shareAction}
                  onPress={handleShare}
                />
                {shareError ? <InlineError message={shareError} /> : null}
              </View>
              <View style={styles.actionColumn}>
                <AppButton
                  variant="secondary"
                  label={copy.summary.copyAction}
                  onPress={handleCopy}
                />
                {copyError ? <InlineError message={copyError} /> : null}
              </View>
            </View>

            <View style={styles.cardsList}>
              {data.result.perPerson.map((person) => (
                <TripPersonBalanceCard
                  key={person.identityId}
                  name={data.nameByIdentityId.get(person.identityId) ?? ''}
                  fairShareCentavos={person.fairShareCentavos}
                  contributedCentavos={person.contributedCentavos}
                  billItems={data.billItemsByIdentityId.get(person.identityId) ?? []}
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
  headerRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionColumn: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  cardsList: {
    gap: spacing.sm,
  },
});
