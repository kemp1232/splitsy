import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Share, StyleSheet, View } from 'react-native';

import { BillListItem } from '@/components/bill/BillListItem';
import { BillOverflowSheet } from '@/components/bill/BillOverflowSheet';
import {
  ParticipantEditorSheet,
  type ParticipantDraft,
} from '@/components/bill/ParticipantEditorSheet';
import { TripOverflowSheet } from '@/components/trip/TripOverflowSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { TAB_BAR_CONTENT_CLEARANCE } from '@/components/ui/BottomTabBar';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GradientHeroCard } from '@/components/ui/GradientHeroCard';
import { IconButton } from '@/components/ui/IconButton';
import { InlineError } from '@/components/ui/InlineError';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { SectionCard } from '@/components/ui/SectionCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { copy } from '@/constants/copy';
import type { AdjustmentAllocation } from '@/db/repositories/adjustmentAllocations.repository';
import { adjustmentAllocationsRepository } from '@/db/repositories/adjustmentAllocations.repository';
import { adjustmentsRepository } from '@/db/repositories/adjustments.repository';
import type { Bill, BillWithParticipantCount } from '@/db/repositories/bills.repository';
import { billsRepository } from '@/db/repositories/bills.repository';
import { itemAssignmentsRepository } from '@/db/repositories/itemAssignments.repository';
import { lineItemsRepository } from '@/db/repositories/lineItems.repository';
import { participantsRepository } from '@/db/repositories/participants.repository';
import type { Trip } from '@/db/repositories/trips.repository';
import { tripsRepository } from '@/db/repositories/trips.repository';
import type { TripParticipant } from '@/db/repositories/tripParticipants.repository';
import { tripParticipantsRepository } from '@/db/repositories/tripParticipants.repository';
import {
  buildSplitAdjustments,
  buildSplitLineItems,
} from '@/features/adjustments/buildSplitInputs';
import { partitionLineItemsByAssignment } from '@/features/assignments/partitionLineItemsByAssignment';
import { deleteBill } from '@/features/bills/bill.service';
import { useBillSourceActions } from '@/features/bills/useBillSourceActions';
import { resolveNextRoute, type NextRoute } from '@/features/bills/resolveNextRoute';
import { reconcileBillTotals } from '@/features/splitting/reconciliation';
import { buildShareText } from '@/features/splitting/shareText';
import { calculateSplit } from '@/features/splitting/splitCalculator';
import { deleteTrip } from '@/features/trips/trip.service';
import { nowIso } from '@/lib/date';
import { createId } from '@/lib/ids';
import type { ColorTokens } from '@/theme/tokens';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type LoadState = 'loading' | 'ready' | 'error';

type LoadedTripHubData = {
  trip: Trip;
  roster: TripParticipant[];
  bills: BillWithParticipantCount[];
  completedTotalCentavos: number;
  // Participant display names per bill, keyed by bill id — feeds each
  // BillListItem row's own initials-avatar-stack (never derived from a route
  // param; spec section 7).
  participantNamesByBillId: Map<string, string[]>;
};

// Same lighter-weight sum used by the home screen's own trip-total
// computation (see src/app/index.tsx) — the hub only needs one running
// number, not a full per-person calculateSplit breakdown, so this reads
// straight from each COMPLETED bill's own line items and adjustments rather
// than assembling calculateSplit's full input shape.
async function computeCompletedTotalCentavos(
  completedBills: BillWithParticipantCount[],
): Promise<number> {
  const totals = await Promise.all(
    completedBills.map(async ({ bill }) => {
      const [items, adjustments] = await Promise.all([
        lineItemsRepository.listByBillId(bill.id),
        adjustmentsRepository.listByBillId(bill.id),
      ]);
      const itemSubtotal = items.reduce((sum, item) => sum + item.lineTotalCentavos, 0);
      const adjustmentTotal = adjustments.reduce(
        (sum, adjustment) => sum + adjustment.amountCentavos,
        0,
      );
      return itemSubtotal + adjustmentTotal;
    }),
  );
  return totals.reduce((sum, total) => sum + total, 0);
}

async function fetchTripHubData(tripId: string): Promise<LoadedTripHubData | null> {
  const [trip, roster, bills] = await Promise.all([
    tripsRepository.getById(tripId),
    tripParticipantsRepository.listByTripId(tripId),
    billsRepository.listByTripId(tripId),
  ]);

  if (!trip) return null;

  const completedBills = bills.filter((entry) => entry.bill.status === 'COMPLETED');
  const completedTotalCentavos = await computeCompletedTotalCentavos(completedBills);

  const participantNamesByBillId = new Map<string, string[]>();
  await Promise.all(
    bills.map(async ({ bill }) => {
      const rows = await participantsRepository.listByBillId(bill.id);
      participantNamesByBillId.set(
        bill.id,
        rows.map((participant) => participant.name),
      );
    }),
  );

  return { trip, roster, bills, completedTotalCentavos, participantNamesByBillId };
}

// Same draft-progression resolution the home screen uses for its own bill
// rows (spec section 15) — kept as its own colocated copy rather than shared,
// matching this codebase's existing precedent of not sharing fetch/resolve
// functions across screens (e.g. summary.tsx's/[billId]/index.tsx's own
// separate fetch functions).
async function resolveDraftNextRoute(billId: string): Promise<NextRoute> {
  const [billRow, itemRows, participantRows, adjustmentRows, assignmentRows] = await Promise.all([
    billsRepository.getById(billId),
    lineItemsRepository.listByBillId(billId),
    participantsRepository.listByBillId(billId),
    adjustmentsRepository.listByBillId(billId),
    itemAssignmentsRepository.listByBillId(billId),
  ]);

  if (!billRow) {
    return { screen: 'receipt-review' };
  }

  const { unassignedItems } = partitionLineItemsByAssignment(itemRows, assignmentRows);
  const itemSubtotalCentavos = itemRows.reduce((sum, item) => sum + item.lineTotalCentavos, 0);
  const adjustmentTotalCentavos = adjustmentRows.reduce(
    (sum, adjustment) => sum + adjustment.amountCentavos,
    0,
  );
  const reconciliation = reconcileBillTotals({
    itemSubtotalCentavos,
    adjustmentTotalCentavos,
    detectedReceiptTotalCentavos: billRow.detectedReceiptTotalCentavos,
  });

  return resolveNextRoute({
    hasItems: itemRows.length > 0,
    participantCount: participantRows.length,
    hasUnassignedItems: unassignedItems.length > 0,
    hasUnresolvedDiscrepancy: !reconciliation.matches && !billRow.discrepancyAcknowledged,
  });
}

// Same share-text assembly the home screen's overflow menu uses for its own
// bill rows (spec F-017) — see that screen's own copy of this function for
// the full reasoning on why calculateSplit can throw here and why that's
// treated as "can't share this right now" rather than a crash.
async function buildShareTextForBill(bill: Bill): Promise<string> {
  const [itemRows, participantRows, adjustmentRows, assignmentRows] = await Promise.all([
    lineItemsRepository.listByBillId(bill.id),
    participantsRepository.listByBillId(bill.id),
    adjustmentsRepository.listByBillId(bill.id),
    itemAssignmentsRepository.listByBillId(bill.id),
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

  const splitResult = calculateSplit({
    participants: participantRows.map((participant) => ({ participantId: participant.id })),
    items: buildSplitLineItems(itemRows, assignmentRows),
    adjustments: buildSplitAdjustments(adjustmentRows, customAllocationsByAdjustmentId),
  });

  return buildShareText({
    billTitle: bill.merchantName ?? bill.title,
    participants: participantRows.map((participant) => ({
      participantId: participant.id,
      name: participant.name,
    })),
    items: itemRows.map((item) => ({ lineItemId: item.id, name: item.name })),
    adjustments: adjustmentRows.map((adjustment) => ({
      adjustmentId: adjustment.id,
      label: adjustment.label,
    })),
    splitResult,
  });
}

// Flips a SETTLED trip back to ACTIVE the moment the user adds another bill
// to it (spec-adjacent Trip feature convention — same treatment as editing a
// COMPLETED bill flipping it back to DRAFT elsewhere in this app). Only
// called from this hub's own "Scan next bill"/"Choose from photos" actions,
// never inferred from a bill simply being completed elsewhere.
async function ensureTripActive(trip: Trip): Promise<Trip> {
  if (trip.status !== 'SETTLED') return trip;
  const updatedAt = nowIso();
  await tripsRepository.update(trip.id, { status: 'ACTIVE', updatedAt });
  return { ...trip, status: 'ACTIVE', updatedAt };
}

export default function TripHubScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { pickFromGallery } = useBillSourceActions();

  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<LoadedTripHubData | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Roster editing here is add/remove only (no rename) — the roster sheet is
  // only ever opened for a brand-new member, matching the trip hub's own
  // narrower roster scope (spec-adjacent Trip feature; renaming an existing
  // roster member isn't part of this screen's asked-for behavior).
  const [addingMember, setAddingMember] = useState(false);
  const [removingMember, setRemovingMember] = useState<TripParticipant | null>(null);

  const [overflowBill, setOverflowBill] = useState<Bill | null>(null);
  const [deletingBill, setDeletingBill] = useState<Bill | null>(null);

  const [tripOverflowVisible, setTripOverflowVisible] = useState(false);
  const [confirmingDeleteTrip, setConfirmingDeleteTrip] = useState(false);
  const [deleteTripError, setDeleteTripError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const loaded = await fetchTripHubData(tripId);
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
  // shared `load` callback (also used after every mutation below) directly
  // inside an effect trips the react-hooks/set-state-in-effect lint rule.
  // This inline IIFE with its own independent try/catch is this codebase's
  // existing convention for a screen's first load (see e.g. src/app/index.tsx's
  // own copy of this same shape).
  useEffect(() => {
    (async () => {
      try {
        const loaded = await fetchTripHubData(tripId);
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

  // Same explicit per-screen switch the home screen's own handleOpenBill
  // uses (rather than templating `next.screen` into the path) — typed routes
  // (app.config.ts's `experiments.typedRoutes`) need each route literal to
  // match a real file under src/app, not an arbitrary interpolated segment.
  //
  // Wrapped in useCallback (RN perf rule), declared above every early return
  // below since hooks can't be called conditionally — stays a stable
  // reference for the memoized BillListItem rows this feeds.
  const handleOpenBill = useCallback(
    async (bill: Bill) => {
      if (bill.status === 'COMPLETED') {
        router.push(`/bill/${bill.id}`);
        return;
      }

      const next = await resolveDraftNextRoute(bill.id);
      switch (next.screen) {
        case 'receipt-review':
          router.push(`/bill/${bill.id}/receipt-review`);
          return;
        case 'participants':
          router.push(`/bill/${bill.id}/participants`);
          return;
        case 'assignments':
          router.push(`/bill/${bill.id}/assignments`);
          return;
        case 'adjustments':
          router.push(`/bill/${bill.id}/adjustments`);
          return;
        case 'summary':
          router.push(`/bill/${bill.id}/summary`);
          return;
      }
    },
    [router],
  );

  const handleOverflowPress = useCallback((bill: Bill) => setOverflowBill(bill), []);

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
  const hasCompletedBill = data.bills.some((entry) => entry.bill.status === 'COMPLETED');

  async function handleScanNextBill() {
    if (!data) return;
    const activeTrip = await ensureTripActive(data.trip);
    setData((current) => (current ? { ...current, trip: activeTrip } : current));
    router.push({ pathname: '/bill/capture', params: { tripId } });
  }

  async function handleChooseFromGallery() {
    if (!data) return;
    const activeTrip = await ensureTripActive(data.trip);
    setData((current) => (current ? { ...current, trip: activeTrip } : current));
    await pickFromGallery();
  }

  async function handleAddMember(draft: ParticipantDraft) {
    if (!data) return;
    setActionError(null);
    try {
      const timestamp = nowIso();
      await tripParticipantsRepository.create({
        id: createId(),
        tripId,
        name: draft.name,
        sortOrder: data.roster.length,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      setAddingMember(false);
      await load();
    } catch {
      setAddingMember(false);
      setActionError(copy.global.storageFailure);
    }
  }

  async function handleConfirmRemoveMember() {
    if (!removingMember) return;
    setRemovingMember(null);
    setActionError(null);
    try {
      await tripParticipantsRepository.deactivate(removingMember.id);
      await load();
    } catch {
      setActionError(copy.global.storageFailure);
    }
  }

  function closeOverflow() {
    setOverflowBill(null);
  }

  async function handleOverflowEdit() {
    const bill = overflowBill;
    closeOverflow();
    if (!bill) return;
    if (bill.status === 'COMPLETED') {
      await billsRepository.update(bill.id, {
        status: 'DRAFT',
        completedAt: null,
        updatedAt: nowIso(),
      });
    }
    router.push(`/bill/${bill.id}/receipt-review`);
  }

  async function handleOverflowShare() {
    const bill = overflowBill;
    closeOverflow();
    if (!bill) return;
    try {
      const text = await buildShareTextForBill(bill);
      await Share.share({ message: text });
    } catch {
      Alert.alert(copy.global.genericErrorHeading, copy.home.shareUnavailable);
    }
  }

  function handleOverflowDelete() {
    const bill = overflowBill;
    closeOverflow();
    if (!bill) return;
    setDeletingBill(bill);
  }

  async function handleConfirmDeleteBill() {
    if (!deletingBill) return;
    setDeletingBill(null);
    try {
      deleteBill(deletingBill);
    } catch {
      Alert.alert(copy.global.genericErrorHeading, copy.global.deleteFailure);
      return;
    }
    await load();
  }

  function handleTripOverflowDelete() {
    setTripOverflowVisible(false);
    setConfirmingDeleteTrip(true);
  }

  async function handleConfirmDeleteTrip() {
    if (!data) return;
    setConfirmingDeleteTrip(false);
    setDeleteTripError(null);
    try {
      await deleteTrip(data.trip);
    } catch {
      setDeleteTripError(copy.global.deleteFailure);
      return;
    }
    router.replace('/');
  }

  const existingRosterNames = data.roster.map((member) => member.name);

  return (
    <Screen scroll padded={false}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <AppText variant="heading">{title}</AppText>
          <StatusBadge
            label={data.trip.status === 'SETTLED' ? copy.trip.settledBadge : copy.trip.activeBadge}
            tone={data.trip.status === 'SETTLED' ? 'success' : 'neutral'}
          />
        </View>
        <IconButton
          accessibilityLabel={copy.home.overflowAccessibilityLabel}
          onPress={() => setTripOverflowVisible(true)}
          icon={<Feather name="more-vertical" size={20} color={colors.textSecondary} />}
        />
      </View>

      {/* Gradient hero card (reference UI's "hero panel" — see the visual
          revamp task notes) — the trip hub's one genuinely single running
          total, unlike the home screen's own list-of-independent-bills view
          (which deliberately doesn't get one of these). */}
      <GradientHeroCard
        label={copy.trip.tripTotalLabel}
        amountCentavos={data.completedTotalCentavos}
        meta={
          data.bills.length > 0
            ? copy.trip.billCountLabel.replace('{count}', String(data.bills.length))
            : undefined
        }
      />

      <View style={styles.body}>
        <View style={styles.rosterBlock}>
          {actionError ? <InlineError message={actionError} /> : null}

          <SectionCard>
            <View style={styles.rosterHeader}>
              <Feather name="users" size={18} color={colors.textPrimary} />
              <AppText variant="subheading">{copy.trip.rosterSectionTitle}</AppText>
            </View>
            {data.roster.length === 0 ? (
              <AppText color="textSecondary">{copy.trip.emptyBody}</AppText>
            ) : (
              <View style={styles.rosterList}>
                {data.roster.map((member) => (
                  <View key={member.id} style={styles.rosterRow}>
                    <AppText variant="body" numberOfLines={1} style={styles.rosterRowLabel}>
                      {member.name}
                    </AppText>
                    <IconButton
                      accessibilityLabel={copy.trip.removeConfirmHeading.replace(
                        '{name}',
                        member.name,
                      )}
                      onPress={() => setRemovingMember(member)}
                      icon={<Feather name="x" size={20} color={colors.danger} />}
                    />
                  </View>
                ))}
              </View>
            )}
            <AppButton
              variant="secondary"
              label={copy.trip.addAction}
              onPress={() => setAddingMember(true)}
              icon={(color) => <Feather name="plus" size={18} color={color} />}
            />
          </SectionCard>
        </View>

        {hasCompletedBill ? (
          // The reference UI's prominent bottom-of-screen pill primary
          // action (mapped here to "Settle up", not a literal swipe-to-pay
          // gesture — see the visual revamp task notes).
          <AppButton
            pill
            label={copy.trip.settleUpAction}
            onPress={() => router.push(`/trip/${tripId}/settlement`)}
          />
        ) : null}

        <View style={styles.billsBlock}>
          <AppText variant="subheading">{copy.trip.billsSectionTitle}</AppText>

          {data.bills.length === 0 ? (
            <EmptyState heading={copy.trip.emptyBillsHeading} body={copy.trip.emptyBillsBody} />
          ) : (
            <FlatList
              data={data.bills}
              keyExtractor={(entry) => entry.bill.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.itemGap} />}
              renderItem={({ item }) => (
                <BillListItem
                  entry={item}
                  participantNames={data.participantNamesByBillId.get(item.bill.id) ?? []}
                  onPress={handleOpenBill}
                  onOverflowPress={handleOverflowPress}
                />
              )}
            />
          )}
        </View>

        {/* Was a sticky BottomActionBar footer — moved inline, per the
            user's own explicit request (2026-08-27) to drop sticky nav
            footers in favor of plain in-flow buttons. */}
        <View style={styles.footerBlock}>
          {deleteTripError ? <InlineError message={deleteTripError} /> : null}
          <View style={styles.footerRow}>
            <AppButton
              variant="secondary"
              label={copy.trip.chooseFromGalleryAction}
              onPress={handleChooseFromGallery}
            />
            <View style={styles.footerPrimary}>
              <AppButton
                label={copy.trip.scanNextBillAction}
                onPress={handleScanNextBill}
                icon={(color) => <Feather name="camera" size={18} color={color} />}
              />
            </View>
          </View>
        </View>
      </View>

      <ParticipantEditorSheet
        visible={addingMember}
        initial={null}
        existingNames={existingRosterNames}
        onSave={handleAddMember}
        onCancel={() => setAddingMember(false)}
      />

      <ConfirmationDialog
        visible={removingMember !== null}
        heading={copy.trip.removeConfirmHeading.replace('{name}', removingMember?.name ?? '')}
        body={copy.trip.removeConfirmBody}
        confirmLabel={copy.trip.removeAction}
        cancelLabel={copy.global.cancelAction}
        destructive
        onConfirm={handleConfirmRemoveMember}
        onCancel={() => setRemovingMember(null)}
      />

      <BillOverflowSheet
        visible={overflowBill !== null}
        onEdit={handleOverflowEdit}
        onShare={handleOverflowShare}
        onDelete={handleOverflowDelete}
        onCancel={closeOverflow}
      />

      <ConfirmationDialog
        visible={deletingBill !== null}
        heading={copy.home.deleteConfirmHeading}
        body={copy.home.deleteConfirmBody}
        confirmLabel={copy.home.overflowDelete}
        cancelLabel={copy.global.cancelAction}
        destructive
        onConfirm={handleConfirmDeleteBill}
        onCancel={() => setDeletingBill(null)}
      />

      <TripOverflowSheet
        visible={tripOverflowVisible}
        onDelete={handleTripOverflowDelete}
        onCancel={() => setTripOverflowVisible(false)}
      />

      <ConfirmationDialog
        visible={confirmingDeleteTrip}
        heading={copy.trip.deleteConfirmHeading}
        body={copy.trip.deleteConfirmBody.replace('{count}', String(data.bills.length))}
        confirmLabel={copy.trip.deleteTripAction}
        cancelLabel={copy.global.cancelAction}
        destructive
        onConfirm={handleConfirmDeleteTrip}
        onCancel={() => setConfirmingDeleteTrip(false)}
      />
    </Screen>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    body: {
      padding: spacing.lg,
      // The scan/gallery buttons used to sit in a sticky footer, which
      // Screen.tsx pads above the global nav bar automatically — now that
      // they're plain in-flow content, this screen reserves that space
      // itself.
      paddingBottom: spacing.lg + TAB_BAR_CONTENT_CLEARANCE,
      // Section-to-section rhythm (roster card vs. the "Settle up" pill vs.
      // the bills list vs. the scan/gallery actions) — spacing.xl, distinct
      // from the tighter spacing.md/sm used within each of those blocks.
      gap: spacing.xl,
    },
    rosterBlock: {
      gap: spacing.sm,
    },
    rosterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    billsBlock: {
      gap: spacing.md,
    },
    footerBlock: {
      gap: spacing.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    headerText: {
      flex: 1,
      gap: spacing.xs,
    },
    rosterList: {
      gap: spacing.xs,
    },
    rosterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rosterRowLabel: {
      flex: 1,
    },
    itemGap: {
      height: spacing.sm,
    },
    footerRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    footerPrimary: {
      flex: 1,
    },
  });
}
