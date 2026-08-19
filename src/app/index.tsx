import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, Share, StyleSheet, View } from 'react-native';

import { BillListItem } from '@/components/bill/BillListItem';
import { BillOverflowSheet } from '@/components/bill/BillOverflowSheet';
import { TripListItem } from '@/components/trip/TripListItem';
import { AppText } from '@/components/ui/AppText';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';
import { IconButton } from '@/components/ui/IconButton';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import type { AdjustmentAllocation } from '@/db/repositories/adjustmentAllocations.repository';
import { adjustmentAllocationsRepository } from '@/db/repositories/adjustmentAllocations.repository';
import { adjustmentsRepository } from '@/db/repositories/adjustments.repository';
import type { Bill, BillWithParticipantCount } from '@/db/repositories/bills.repository';
import { billsRepository } from '@/db/repositories/bills.repository';
import { itemAssignmentsRepository } from '@/db/repositories/itemAssignments.repository';
import { lineItemsRepository } from '@/db/repositories/lineItems.repository';
import { participantsRepository } from '@/db/repositories/participants.repository';
import type { TripWithBillCount } from '@/db/repositories/trips.repository';
import { tripsRepository } from '@/db/repositories/trips.repository';
import {
  buildSplitAdjustments,
  buildSplitLineItems,
} from '@/features/adjustments/buildSplitInputs';
import { partitionLineItemsByAssignment } from '@/features/assignments/partitionLineItemsByAssignment';
import { deleteBill } from '@/features/bills/bill.service';
import { resolveNextRoute, type NextRoute } from '@/features/bills/resolveNextRoute';
import { reconcileBillTotals } from '@/features/splitting/reconciliation';
import { buildShareText } from '@/features/splitting/shareText';
import { calculateSplit } from '@/features/splitting/splitCalculator';
import { nowIso } from '@/lib/date';
import { spacing } from '@/theme/tokens';

type LoadState = 'loading' | 'ready' | 'error';

// Trip feature addition (not from the numbered MVP spec, see the 2026-08-18
// spec Amendment): a home-list row is either a bill or a trip, interleaved by
// `updatedAt` (spec F-002's own "newest first" rule extended to cover both
// kinds of row) rather than shown in two separate sections/tabs — the
// lowest-disruption way to surface trips alongside bills in this same list
// (see the recently-finished dark-mode revamp's IA, which this deliberately
// doesn't reshape with a new tab/segment).
type HomeEntry =
  | { kind: 'bill'; data: BillWithParticipantCount }
  | { kind: 'trip'; data: TripWithBillCount; totalCentavos: number };

function getEntryUpdatedAt(entry: HomeEntry): string {
  return entry.kind === 'bill' ? entry.data.bill.updatedAt : entry.data.trip.updatedAt;
}

// ISO 8601 timestamps (nowIso()'s own format) sort correctly as plain
// strings, so this never needs to parse a Date to compare two entries.
function sortHomeEntriesNewestFirst(entries: HomeEntry[]): HomeEntry[] {
  return [...entries].sort((a, b) => (getEntryUpdatedAt(a) < getEntryUpdatedAt(b) ? 1 : -1));
}

// Same lighter-weight sum the trip hub screen uses for its own running total
// (see src/app/trip/[tripId]/index.tsx's own copy of this function) — kept as
// its own colocated copy rather than shared, matching this codebase's
// existing precedent of not sharing fetch/calculation functions across
// screens.
async function computeTripTotalCentavos(tripId: string): Promise<number> {
  const bills = await billsRepository.listByTripId(tripId);
  const completedBills = bills.filter((entry) => entry.bill.status === 'COMPLETED');
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

// Spec section 15's draft-progression rule (resolveNextRoute.ts), fed with
// exactly the DRAFT-bill content it needs — the same repositories the
// adjustments/summary screens' own draft-progression guards already read.
// Deliberately computes the reconciliation-match/discrepancy check directly
// from item and adjustment totals rather than calling calculateSplit: a
// DRAFT bill reaching this function may still have zero participants or an
// unassigned item, either of which calculateSplit would throw on, and
// resolveNextRoute's own earlier rules are exactly what already routes the
// user away before a discrepancy would ever matter.
async function resolveDraftNextRoute(billId: string): Promise<NextRoute> {
  const [billRow, itemRows, participantRows, adjustmentRows, assignmentRows] = await Promise.all([
    billsRepository.getById(billId),
    lineItemsRepository.listByBillId(billId),
    participantsRepository.listByBillId(billId),
    adjustmentsRepository.listByBillId(billId),
    itemAssignmentsRepository.listByBillId(billId),
  ]);

  // Shouldn't happen for a row the home list itself just loaded, but this
  // guards against a race (e.g. the bill was deleted between listing it and
  // the user tapping it) by falling back to the earliest step rather than
  // crashing.
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

// Spec F-017's share text, computed fresh from whatever the bill currently
// has — used by the overflow menu's "Share summary" action, which (unlike
// the saved-bill-detail/summary screens) can be invoked on a bill at any
// stage of completeness, including one with zero participants or an
// unassigned item. calculateSplit throws in exactly those cases (spec 10.7's
// own participant-count guard, and allocateEqual's divide-by-zero guard for
// an item with no assignees) — the caller is expected to catch that and show
// copy.home.shareUnavailable rather than let it propagate.
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

export default function HomeScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<HomeEntry[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [overflowBill, setOverflowBill] = useState<Bill | null>(null);
  const [deletingBill, setDeletingBill] = useState<Bill | null>(null);

  const load = useCallback(async () => {
    try {
      const [billRows, tripRows] = await Promise.all([
        billsRepository.listAllWithParticipantCounts(),
        tripsRepository.listAllWithBillCounts(),
      ]);

      const billEntries: HomeEntry[] = billRows.map((row) => ({
        kind: 'bill' as const,
        data: row,
      }));
      const tripEntries: HomeEntry[] = await Promise.all(
        tripRows.map(async (row) => ({
          kind: 'trip' as const,
          data: row,
          totalCentavos: row.billCount > 0 ? await computeTripTotalCentavos(row.trip.id) : 0,
        })),
      );

      setEntries(sortHomeEntriesNewestFirst([...billEntries, ...tripEntries]));
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  // Deliberately not `useEffect(() => { load(); }, [load])` — calling the
  // shared `load` callback (also used by handleRefresh below) directly inside
  // an effect trips the react-hooks/set-state-in-effect lint rule. This
  // inline IIFE with its own independent try/catch is this codebase's
  // existing convention for a screen's first load (see e.g. the trip hub/
  // settlement screens' own copies of this same shape).
  useEffect(() => {
    (async () => {
      try {
        const [billRows, tripRows] = await Promise.all([
          billsRepository.listAllWithParticipantCounts(),
          tripsRepository.listAllWithBillCounts(),
        ]);

        const billEntries: HomeEntry[] = billRows.map((row) => ({
          kind: 'bill' as const,
          data: row,
        }));
        const tripEntries: HomeEntry[] = await Promise.all(
          tripRows.map(async (row) => ({
            kind: 'trip' as const,
            data: row,
            totalCentavos: row.billCount > 0 ? await computeTripTotalCentavos(row.trip.id) : 0,
          })),
        );

        setEntries(sortHomeEntriesNewestFirst([...billEntries, ...tripEntries]));
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Spec F-002/F-018: a completed bill always opens its own saved-detail
  // screen; a draft returns the user to the earliest incomplete step
  // (resolveDraftNextRoute/resolveNextRoute above) instead of always the
  // same route regardless of how far along the draft is.
  async function handleOpenBill(bill: Bill) {
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
  }

  function closeOverflow() {
    setOverflowBill(null);
  }

  // Spec 15 "Completed bill editing" (same as [billId]/index.tsx's own Edit
  // bill action): a COMPLETED bill is flipped back to DRAFT first; either way
  // this then opens the earliest editable step. A DRAFT bill is left as-is
  // (it's already editable) and just navigates straight there.
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

  // Spec F-017. Unlike the summary/saved-bill-detail screens' own Share
  // actions, this can be invoked on a bill at any stage of completeness —
  // buildShareTextForBill's calculateSplit call throws for a bill that isn't
  // there yet (no participants, an unassigned item), which this treats as
  // "can't share this right now" rather than letting it crash the screen. A
  // native Share-sheet failure lands in the same catch and shows the same
  // message, since both are, from the user's point of view, just "sharing
  // didn't work."
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

  // The actual fix for the gap this menu exists to close: deleteBill has no
  // precondition on participants/items/status (spec F-019), so this works
  // for a brand-new DRAFT with nothing in it yet, not just a COMPLETED bill.
  async function handleConfirmDelete() {
    if (!deletingBill) return;
    setDeletingBill(null);
    try {
      deleteBill(deletingBill);
    } catch {
      // This screen has no inline-error slot of its own (unlike
      // handleOverflowShare's copy.home.shareUnavailable, there's no fixed
      // spot on the list row to show it) — Alert.alert matches that same
      // handler's own established convention for a failure here.
      Alert.alert(copy.global.genericErrorHeading, copy.global.deleteFailure);
      return;
    }
    await load();
  }

  if (state === 'loading') {
    return (
      <Screen>
        <LoadingState message={copy.global.loadingBills} />
      </Screen>
    );
  }

  if (state === 'error') {
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

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <AppText variant="heading">{copy.home.pageTitle}</AppText>
        <View style={styles.headerActions}>
          {/* Icon-only control — accessibilityLabel is required (spec section 17). */}
          <IconButton
            accessibilityLabel={copy.home.settingsAccessibilityLabel}
            onPress={() => router.push('/settings')}
            icon={<AppText variant="subheading">⚙</AppText>}
          />
        </View>
      </View>

      {entries.length === 0 ? (
        <EmptyState
          heading={copy.home.emptyHeading}
          body={copy.home.emptyBody}
          actionLabel={copy.home.emptyCta}
          onAction={() => router.push('/bill/new')}
        />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(entry) =>
            entry.kind === 'bill' ? `bill-${entry.data.bill.id}` : `trip-${entry.data.trip.id}`
          }
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          renderItem={({ item }) =>
            item.kind === 'bill' ? (
              <BillListItem
                entry={item.data}
                onPress={() => handleOpenBill(item.data.bill)}
                onOverflowPress={() => setOverflowBill(item.data.bill)}
              />
            ) : (
              <TripListItem
                entry={item.data}
                totalCentavos={item.totalCentavos}
                onPress={() => router.push(`/trip/${item.data.trip.id}`)}
              />
            )
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* The one floating primary action this flow calls for (see the theme
          direction notes) — starting a new bill. */}
      <FloatingActionButton
        accessibilityLabel={copy.home.primaryAction}
        onPress={() => router.push('/bill/new')}
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
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingBill(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  separator: {
    height: spacing.sm,
  },
});
