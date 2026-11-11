import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Modal, StyleSheet, View } from 'react-native';

import { AdjustmentEditorSheet } from '@/components/bill/AdjustmentEditorSheet';
import { AdjustmentRow } from '@/components/bill/AdjustmentRow';
import { ReconciliationCard } from '@/components/bill/ReconciliationCard';
import { ActionRow } from '@/components/ui/ActionRow';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GroupedCard, GroupedSeparator, SectionHeader } from '@/components/ui/GroupedSection';
import { InlineError } from '@/components/ui/InlineError';
import { LoadingState } from '@/components/ui/LoadingState';
import { ReceiptImage } from '@/components/ui/ReceiptImage';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
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
import { useAdjustmentEditor } from '@/features/adjustments/useAdjustmentEditor';
import { useEnsureBillEditable } from '@/features/bills/useEnsureBillEditable';
import { hasMinimumParticipants } from '@/features/participants/hasMinimumParticipants';
import { calculateSplit } from '@/features/splitting/splitCalculator';
import { reconcileBillTotals } from '@/features/splitting/reconciliation';
import type {
  SplitCalculationResult,
  ReconciliationResult,
} from '@/features/splitting/split.types';
import { nowIso } from '@/lib/date';
import { createId } from '@/lib/ids';
import { getNegativeTotalWarning } from '@/features/receipt-review/buildTotalsSummary';
import { formatCentavos } from '@/lib/money';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

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
  const { colors } = useTheme();
  const { billId } = useLocalSearchParams<{ billId: string }>();
  // Back in edit mode if the bill was re-completed underneath this screen.
  useEnsureBillEditable(billId);

  const [state, setState] = useState<LoadState>('loading');
  const [bill, setBill] = useState<Bill | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [splitResult, setSplitResult] = useState<SplitCalculationResult | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  const [showContinueWithDifference, setShowContinueWithDifference] = useState(false);
  const [showReceiptImage, setShowReceiptImage] = useState(false);
  // One shared error slot for this screen's write paths (save/delete an
  // adjustment, add the reconciliation difference) — mirrors participants.tsx
  // and receipt-review.tsx's own actionError.
  const [actionError, setActionError] = useState<string | null>(null);
  // Add/edit/delete an adjustment (shared with receipt-review.tsx).
  const adjustmentEditor = useAdjustmentEditor({
    billId,
    adjustmentCount: adjustments.length,
    refresh,
    setActionError,
  });

  // Runs on every focus, not just mount: "Review items" pushes
  // receipt-review.tsx on top of this screen, and that screen can now add,
  // edit, or delete adjustments (and items) too — so coming back must
  // re-read everything (guards included) rather than show a stale
  // reconciliation that "Add difference" or "Continue with difference"
  // would then act on.
  // Also called directly by the error state's Retry — setting state back to
  // 'loading' alone never re-runs the focus effect below.
  const loadScreen = useCallback(async () => {
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
  }, [billId, router]);

  useFocusEffect(
    useCallback(() => {
      void loadScreen();
    }, [loadScreen]),
  );

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
      <Screen tabBarHidden>
        <LoadingState />
      </Screen>
    );
  }

  if (state === 'error' || !bill || !splitResult || !reconciliation) {
    return (
      <Screen tabBarHidden>
        <ErrorState
          heading={copy.global.genericErrorHeading}
          body={copy.global.genericErrorBody}
          retryLabel={copy.global.retryAction}
          onRetry={() => {
            setState('loading');
            void loadScreen();
          }}
        />
      </Screen>
    );
  }

  const negativeTotalWarning = getNegativeTotalWarning(splitResult.computedTotalCentavos);

  return (
    <Screen tabBarHidden scroll padded={false}>
      <View style={styles.body}>
        <ScreenHeader
          icon="percent"
          heading={copy.adjustments.heading}
          body={copy.adjustments.body}
        >
          {/* Shared by every write path below (save/delete an adjustment, add
              the reconciliation difference) — mirrors participants.tsx's and
              receipt-review.tsx's own actionError. */}
          {actionError ? <InlineError message={actionError} /> : null}
        </ScreenHeader>

        <View style={styles.listBlock}>
          <SectionHeader
            title={copy.adjustments.sectionWithCount.replace('{count}', () =>
              String(adjustments.length),
            )}
            caption={copy.adjustments.sectionCaption}
            action={
              // Hidden with no adjustments — EmptyState below carries its own
              // Add action then, so the screen never shows two (same rule as
              // receipt-review.tsx's Add item button).
              adjustments.length > 0 ? (
                <AppButton
                  variant="secondary"
                  label={copy.adjustments.addAction}
                  onPress={adjustmentEditor.openNewEditor}
                  icon={(color) => <Feather name="plus" size={16} color={color} />}
                />
              ) : null
            }
          />
          {adjustments.length === 0 ? (
            <EmptyState
              heading={copy.adjustments.emptyHeading}
              body={copy.adjustments.emptyBody}
              actionLabel={copy.adjustments.addAction}
              onAction={adjustmentEditor.openNewEditor}
            />
          ) : (
            <GroupedCard>
              <FlatList
                data={adjustments}
                keyExtractor={(adjustment) => adjustment.id}
                scrollEnabled={false}
                ItemSeparatorComponent={GroupedSeparator}
                renderItem={({ item }) => (
                  <AdjustmentRow adjustment={item} onPress={adjustmentEditor.openEditor} />
                )}
              />
            </GroupedCard>
          )}
        </View>

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

        {/* Same warning as receipt-review's totals card — a warning only,
            Continue stays enabled (icon + text, not color alone). */}
        {negativeTotalWarning ? (
          <View style={styles.warningRow}>
            <Feather name="alert-triangle" size={18} color={colors.warning} />
            <AppText variant="caption" style={styles.warningText}>
              {negativeTotalWarning}
            </AppText>
          </View>
        ) : null}

        {/* Was a sticky BottomActionBar footer — moved inline, per the
            user's own explicit request (2026-08-27) to drop sticky nav
            footers in favor of plain in-flow buttons. Trailing arrow-right-circle:
            this is a linear wizard step (spec section 15), whether or not a
            reconciliation difference is still outstanding. */}
        <View style={styles.actionsBlock}>
          {/* Quick access back to the original receipt image without
              backtracking to receipt-review.tsx — same modal shape that
              screen already uses for its own "View receipt" row. */}
          {bill.receiptImageUri ? (
            <ActionRow
              icon="image"
              title={copy.receiptReview.viewReceiptTitle}
              caption={copy.receiptReview.viewReceiptCaption}
              onPress={() => setShowReceiptImage(true)}
            />
          ) : null}
          <AppButton
            large
            label={
              reconciliation.matches
                ? copy.adjustments.continueButton
                : copy.adjustments.continueWithDifferenceAction
            }
            onPress={handleContinuePress}
            icon={(color) => <Feather name="arrow-right-circle" size={18} color={color} />}
            iconPosition="trailing"
          />
        </View>
      </View>

      <AdjustmentEditorSheet
        visible={adjustmentEditor.isEditorVisible}
        initial={adjustmentEditor.editingInitial}
        initialCustomAllocations={adjustmentEditor.editingCustomAllocations}
        participants={participants}
        onSave={adjustmentEditor.saveAdjustment}
        onDelete={adjustmentEditor.editingInitial ? adjustmentEditor.requestDelete : undefined}
        onCancel={adjustmentEditor.cancelEditor}
      />

      <ConfirmationDialog
        visible={adjustmentEditor.isDeleteConfirmVisible}
        heading={copy.adjustmentEditor.deleteConfirmHeading}
        body={copy.adjustmentEditor.deleteConfirmBody}
        confirmLabel={copy.adjustmentEditor.deleteAction}
        cancelLabel={copy.global.cancelAction}
        destructive
        onConfirm={adjustmentEditor.confirmDelete}
        onCancel={adjustmentEditor.cancelDelete}
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

      {/* Mirrors receipt-review.tsx's own receipt-image modal. */}
      <Modal
        visible={showReceiptImage}
        animationType="slide"
        onRequestClose={() => setShowReceiptImage(false)}
      >
        <Screen tabBarHidden scroll={false}>
          <AppButton
            variant="text"
            label={copy.global.closeAccessibilityLabel}
            onPress={() => setShowReceiptImage(false)}
          />
          {bill.receiptImageUri ? (
            <ReceiptImage
              uri={bill.receiptImageUri}
              style={styles.receiptImage}
              contentFit="contain"
              accessibilityLabel={copy.receiptReview.receiptAction}
            />
          ) : null}
        </Screen>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.lg,
    // No tab-bar clearance: the global BottomTabBar is hidden on /bill/**.
    paddingBottom: spacing.lg,
    // Section-to-section rhythm (header / adjustments list / the
    // reconciliation card / the continue block) — spacing.lg, the same
    // rhythm receipt-review.tsx uses between its blocks.
    gap: spacing.lg,
  },
  actionsBlock: {
    gap: spacing.md,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  warningText: {
    flex: 1,
  },
  listBlock: {
    gap: spacing.sm,
  },
  receiptImage: {
    flex: 1,
  },
});
