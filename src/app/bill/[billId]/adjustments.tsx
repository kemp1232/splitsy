import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import {
  AdjustmentEditorSheet,
  type AdjustmentDraft,
} from '@/components/bill/AdjustmentEditorSheet';
import { AdjustmentRow } from '@/components/bill/AdjustmentRow';
import { ReconciliationCard } from '@/components/bill/ReconciliationCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { TAB_BAR_CONTENT_CLEARANCE } from '@/components/ui/BottomTabBar';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { Divider } from '@/components/ui/Divider';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { InlineError } from '@/components/ui/InlineError';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import type { AdjustmentAllocation } from '@/db/repositories/adjustmentAllocations.repository';
import { adjustmentAllocationsRepository } from '@/db/repositories/adjustmentAllocations.repository';
import type { Adjustment } from '@/db/repositories/adjustments.repository';
import { adjustmentsRepository } from '@/db/repositories/adjustments.repository';
import type { Bill } from '@/db/repositories/bills.repository';
import { billsRepository } from '@/db/repositories/bills.repository';
import type { ItemAssignment } from '@/db/repositories/itemAssignments.repository';
import { itemAssignmentsRepository } from '@/db/repositories/itemAssignments.repository';
import type { LineItem } from '@/db/repositories/lineItems.repository';
import { lineItemsRepository } from '@/db/repositories/lineItems.repository';
import type { Participant } from '@/db/repositories/participants.repository';
import { participantsRepository } from '@/db/repositories/participants.repository';
import { partitionLineItemsByAssignment } from '@/features/assignments/partitionLineItemsByAssignment';
import {
  buildSplitAdjustments,
  buildSplitLineItems,
} from '@/features/adjustments/buildSplitInputs';
import { hasMinimumParticipants } from '@/features/participants/hasMinimumParticipants';
import { calculateSplit } from '@/features/splitting/splitCalculator';
import { reconcileBillTotals } from '@/features/splitting/reconciliation';
import type {
  SplitCalculationResult,
  ReconciliationResult,
} from '@/features/splitting/split.types';
import { nowIso } from '@/lib/date';
import { createId } from '@/lib/ids';
import { formatCentavos } from '@/lib/money';
import { spacing } from '@/theme/tokens';

type LoadState = 'loading' | 'ready' | 'error';

type LoadedData = {
  billRow: Bill | undefined;
  itemRows: LineItem[];
  participantRows: Participant[];
  adjustmentRows: Adjustment[];
  assignmentRows: ItemAssignment[];
  customAllocationsByAdjustmentId: Map<string, AdjustmentAllocation[]>;
};

async function fetchAdjustmentsData(billId: string): Promise<LoadedData> {
  const [billRow, itemRows, participantRows, adjustmentRows, assignmentRows] = await Promise.all([
    billsRepository.getById(billId),
    lineItemsRepository.listByBillId(billId),
    participantsRepository.listByBillId(billId),
    adjustmentsRepository.listByBillId(billId),
    itemAssignmentsRepository.listByBillId(billId),
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

  return {
    billRow,
    itemRows,
    participantRows,
    adjustmentRows,
    assignmentRows,
    customAllocationsByAdjustmentId,
  };
}

// Spec section 10's calculateSplit/reconcileBillTotals, run against the
// already-loaded bill data. Left inline (rather than pulled into its own
// feature module) since it's a thin, direct pass-through of two already fully
// tested pure functions (src/features/splitting/) — only the repository-row
// shaping upstream of it (buildSplitLineItems/buildSplitAdjustments) has
// logic of its own worth unit-testing separately.
function computeSplitAndReconciliation(data: LoadedData): {
  splitResult: SplitCalculationResult;
  reconciliation: ReconciliationResult;
} {
  const splitParticipants = data.participantRows.map((participant) => ({
    participantId: participant.id,
  }));
  const splitItems = buildSplitLineItems(data.itemRows, data.assignmentRows);
  const splitAdjustments = buildSplitAdjustments(
    data.adjustmentRows,
    data.customAllocationsByAdjustmentId,
  );

  const splitResult = calculateSplit({
    participants: splitParticipants,
    items: splitItems,
    adjustments: splitAdjustments,
  });

  const reconciliation = reconcileBillTotals({
    itemSubtotalCentavos: splitResult.itemSubtotalCentavos,
    adjustmentTotalCentavos: splitResult.adjustmentTotalCentavos,
    detectedReceiptTotalCentavos: data.billRow?.detectedReceiptTotalCentavos ?? null,
  });

  return { splitResult, reconciliation };
}

export default function AdjustmentsScreen() {
  const router = useRouter();
  const { billId } = useLocalSearchParams<{ billId: string }>();

  const [state, setState] = useState<LoadState>('loading');
  const [bill, setBill] = useState<Bill | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [splitResult, setSplitResult] = useState<SplitCalculationResult | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  const [editingAdjustment, setEditingAdjustment] = useState<Adjustment | 'new' | null>(null);
  const [editingCustomAllocations, setEditingCustomAllocations] = useState<AdjustmentAllocation[]>(
    [],
  );
  const [deletingAdjustment, setDeletingAdjustment] = useState<Adjustment | null>(null);
  const [showContinueWithDifference, setShowContinueWithDifference] = useState(false);
  // One shared error slot for this screen's write paths (save/delete an
  // adjustment, add the reconciliation difference) — mirrors participants.tsx
  // and receipt-review.tsx's own actionError.
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchAdjustmentsData(billId);
        if (!data.billRow) {
          setState('error');
          return;
        }

        // Draft-progression guard (spec section 15): this screen assumes
        // items exist, at least two participants exist, and every item is
        // already assigned — exactly what F-013's assignments screen already
        // blocks continuing without. If any of that isn't true yet (e.g. a
        // stale or direct deep link), send the user back to the earliest
        // incomplete step instead of rendering — and, just as importantly,
        // instead of ever calling calculateSplit with data it isn't ready
        // for (an unassigned item would throw).
        if (data.itemRows.length === 0) {
          router.replace(`/bill/${billId}/receipt-review`);
          return;
        }
        if (!hasMinimumParticipants(data.participantRows.length)) {
          router.replace(`/bill/${billId}/participants`);
          return;
        }
        const { unassignedItems } = partitionLineItemsByAssignment(
          data.itemRows,
          data.assignmentRows,
        );
        if (unassignedItems.length > 0) {
          router.replace(`/bill/${billId}/assignments`);
          return;
        }

        const { splitResult: nextSplitResult, reconciliation: nextReconciliation } =
          computeSplitAndReconciliation(data);
        setBill(data.billRow);
        setParticipants(data.participantRows);
        setAdjustments(data.adjustmentRows);
        setSplitResult(nextSplitResult);
        setReconciliation(nextReconciliation);
        setState('ready');
      } catch {
        // Covers both a genuine load failure and calculateSplit's
        // SplitInvariantError (spec 10.7) — either way this is not a
        // user-fixable validation case, so it surfaces as the same generic
        // error state as any other unexpected failure, never silently.
        setState('error');
      }
    })();
  }, [billId, router]);

  // Reloads everything and recomputes the split after an adjustment is
  // added, edited, or deleted. Deliberately re-fetches participants/items/
  // assignments too, not just adjustments — mirrors the same
  // reload-everything-on-refresh convention as the assignments and
  // participants screens, and keeps computeSplitAndReconciliation fed with a
  // fully consistent snapshot rather than a partially-stale one.
  async function refresh() {
    try {
      const data = await fetchAdjustmentsData(billId);
      if (!data.billRow) {
        setState('error');
        return;
      }
      const { splitResult: nextSplitResult, reconciliation: nextReconciliation } =
        computeSplitAndReconciliation(data);
      setBill(data.billRow);
      setParticipants(data.participantRows);
      setAdjustments(data.adjustmentRows);
      setSplitResult(nextSplitResult);
      setReconciliation(nextReconciliation);
    } catch {
      setState('error');
    }
  }

  async function handleOpenEditor(adjustment: Adjustment) {
    const allocations =
      adjustment.allocationMethod === 'CUSTOM'
        ? await adjustmentAllocationsRepository.listByAdjustmentId(adjustment.id)
        : [];
    setEditingCustomAllocations(allocations);
    setEditingAdjustment(adjustment);
  }

  function handleOpenNewEditor() {
    setEditingCustomAllocations([]);
    setEditingAdjustment('new');
  }

  async function handleSaveAdjustment(draft: AdjustmentDraft) {
    setActionError(null);
    try {
      const timestamp = nowIso();
      let adjustmentId: string;

      if (editingAdjustment === 'new') {
        const created = await adjustmentsRepository.create({
          id: createId(),
          billId,
          sortOrder: adjustments.length,
          type: draft.type,
          label: draft.label,
          amountCentavos: draft.amountCentavos,
          allocationMethod: draft.allocationMethod,
          source: 'MANUAL',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        adjustmentId = created.id;
      } else if (editingAdjustment) {
        adjustmentId = editingAdjustment.id;
        await adjustmentsRepository.update(adjustmentId, {
          type: draft.type,
          label: draft.label,
          amountCentavos: draft.amountCentavos,
          allocationMethod: draft.allocationMethod,
          updatedAt: timestamp,
        });
      } else {
        return;
      }

      // Custom allocations only ever exist for a CUSTOM adjustment (spec 9.6) —
      // clearing them out here whenever the saved method isn't CUSTOM keeps a
      // stale set from lingering if the user switches an adjustment away from
      // custom allocation.
      await adjustmentAllocationsRepository.setForAdjustment(
        adjustmentId,
        draft.allocationMethod === 'CUSTOM' ? (draft.customAllocations ?? []) : [],
      );

      setEditingAdjustment(null);
      await refresh();
    } catch {
      setEditingAdjustment(null);
      setActionError(copy.global.storageFailure);
    }
  }

  function handleRequestDelete() {
    if (editingAdjustment && editingAdjustment !== 'new') {
      setDeletingAdjustment(editingAdjustment);
    }
    setEditingAdjustment(null);
  }

  async function handleConfirmDelete() {
    if (!deletingAdjustment) return;
    setDeletingAdjustment(null);
    setActionError(null);
    try {
      await adjustmentsRepository.remove(deletingAdjustment.id);
      await refresh();
    } catch {
      setActionError(copy.global.storageFailure);
    }
  }

  async function handleAddDifference() {
    if (!reconciliation || reconciliation.differenceCentavos === null) return;
    setActionError(null);
    try {
      const timestamp = nowIso();
      await adjustmentsRepository.create({
        id: createId(),
        billId,
        sortOrder: adjustments.length,
        type: 'OTHER',
        label: copy.adjustments.autoAdjustmentLabel,
        amountCentavos: reconciliation.differenceCentavos,
        allocationMethod: 'PROPORTIONAL',
        source: 'RECONCILIATION',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await refresh();
    } catch {
      setActionError(copy.global.storageFailure);
    }
  }

  function handleReviewItems() {
    router.push(`/bill/${billId}/receipt-review`);
  }

  function handleContinuePress() {
    if (!reconciliation || reconciliation.matches) {
      // Payments (post-MVP, spec section 15's draft-progression order
      // extended one step) is now the actual next step — Summary is one step
      // further, reached via Payments' own Continue/Skip.
      router.push(`/bill/${billId}/payments`);
      return;
    }
    setShowContinueWithDifference(true);
  }

  async function handleConfirmContinueWithDifference() {
    await billsRepository.update(billId, {
      discrepancyAcknowledged: true,
      updatedAt: nowIso(),
    });
    setShowContinueWithDifference(false);
    // Same reasoning as handleContinuePress above.
    router.push(`/bill/${billId}/payments`);
  }

  function handleReviewBillFromDialog() {
    setShowContinueWithDifference(false);
    router.push(`/bill/${billId}/receipt-review`);
  }

  if (state === 'loading') {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (state === 'error' || !bill || !splitResult || !reconciliation) {
    return (
      <Screen>
        <ErrorState
          heading={copy.global.genericErrorHeading}
          body={copy.global.genericErrorBody}
          retryLabel={copy.global.retryAction}
          onRetry={() => setState('loading')}
        />
      </Screen>
    );
  }

  const editingInitial =
    editingAdjustment && editingAdjustment !== 'new'
      ? {
          type: editingAdjustment.type,
          label: editingAdjustment.label,
          amountCentavos: editingAdjustment.amountCentavos,
          allocationMethod: editingAdjustment.allocationMethod,
        }
      : null;

  return (
    <Screen scroll padded={false}>
      <View style={styles.body}>
        <View style={styles.introBlock}>
          <AppText variant="heading" style={styles.uniformText}>
            {copy.adjustments.heading}
          </AppText>
          <AppText variant="body" color="textSecondary" style={styles.uniformText}>
            {copy.adjustments.body}
          </AppText>

          {/* Shared by every write path below (save/delete an adjustment, add
              the reconciliation difference) — mirrors participants.tsx's and
              receipt-review.tsx's own actionError. */}
          {actionError ? <InlineError message={actionError} /> : null}
        </View>

        <Divider />

        {adjustments.length === 0 ? (
          <EmptyState
            heading={copy.adjustments.emptyHeading}
            body={copy.adjustments.emptyBody}
            actionLabel={copy.adjustments.addAction}
            onAction={handleOpenNewEditor}
          />
        ) : (
          <View style={styles.listBlock}>
            <FlatList
              data={adjustments}
              keyExtractor={(adjustment) => adjustment.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.itemGap} />}
              renderItem={({ item }) => (
                <AdjustmentRow adjustment={item} onPress={() => handleOpenEditor(item)} />
              )}
            />
            <AppButton
              variant="secondary"
              label={copy.adjustments.addAction}
              onPress={handleOpenNewEditor}
              icon={(color) => <Feather name="plus" size={18} color={color} />}
            />
          </View>
        )}

        <Divider />

        <ReconciliationCard
          itemSubtotalCentavos={splitResult.itemSubtotalCentavos}
          adjustmentsTotalCentavos={splitResult.adjustmentTotalCentavos}
          computedTotalCentavos={splitResult.computedTotalCentavos}
          detectedReceiptTotalCentavos={reconciliation.detectedReceiptTotalCentavos}
          differenceCentavos={reconciliation.differenceCentavos}
          matches={reconciliation.matches}
          onAddDifference={handleAddDifference}
          onReviewItems={handleReviewItems}
        />

        {/* Was a sticky BottomActionBar footer — moved inline, per the
            user's own explicit request (2026-08-27) to drop sticky nav
            footers in favor of plain in-flow buttons. Trailing arrow-right:
            this is a linear wizard step (spec section 15), whether or not a
            reconciliation difference is still outstanding. */}
        <AppButton
          label={
            reconciliation.matches
              ? copy.adjustments.continueButton
              : copy.adjustments.continueWithDifferenceAction
          }
          onPress={handleContinuePress}
          icon={(color) => <Feather name="arrow-right" size={18} color={color} />}
          iconPosition="trailing"
        />
      </View>

      <AdjustmentEditorSheet
        visible={editingAdjustment !== null}
        initial={editingInitial}
        initialCustomAllocations={editingCustomAllocations}
        participants={participants}
        onSave={handleSaveAdjustment}
        onDelete={editingInitial ? handleRequestDelete : undefined}
        onCancel={() => setEditingAdjustment(null)}
      />

      <ConfirmationDialog
        visible={deletingAdjustment !== null}
        heading={copy.adjustmentEditor.deleteConfirmHeading}
        body={copy.adjustmentEditor.deleteConfirmBody}
        confirmLabel={copy.adjustmentEditor.deleteAction}
        cancelLabel={copy.global.cancelAction}
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingAdjustment(null)}
      />

      <ConfirmationDialog
        visible={showContinueWithDifference}
        heading={copy.continueWithDifference.heading}
        body={copy.continueWithDifference.body.replace(
          '{difference}',
          reconciliation.differenceCentavos !== null
            ? formatCentavos(Math.abs(reconciliation.differenceCentavos))
            : '',
        )}
        confirmLabel={copy.continueWithDifference.continueAction}
        cancelLabel={copy.continueWithDifference.reviewAction}
        onConfirm={handleConfirmContinueWithDifference}
        onCancel={handleReviewBillFromDialog}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.lg,
    // The Continue button used to sit in a sticky footer, which Screen.tsx
    // pads above the global nav bar automatically — now that it's plain
    // in-flow content, this screen reserves that space itself.
    paddingBottom: spacing.lg + TAB_BAR_CONTENT_CLEARANCE,
    // Section-to-section rhythm (intro block / adjustments list / the
    // reconciliation card / the continue button each read as their own
    // distinct block) — spacing.md is reserved for tight, within-section
    // grouping instead (see introBlock/listBlock below).
    gap: spacing.xl,
  },
  introBlock: {
    gap: spacing.sm,
  },
  listBlock: {
    gap: spacing.md,
  },
  itemGap: {
    height: spacing.sm,
  },
  // Matches the `caption` variant's own size — every AppText directly in
  // this screen now reads at one uniform size (see BillListItem.tsx's own
  // titleText/totalText for the same treatment); each variant's own
  // font-weight (and, for `amount`, tabular-nums) is what still distinguishes
  // headings/money from body text.
  uniformText: {
    fontSize: 13,
    lineHeight: 18,
  },
});
