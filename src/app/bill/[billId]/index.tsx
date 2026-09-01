import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, Share, StyleSheet, View } from 'react-native';

import { PersonTotalCard } from '@/components/bill/PersonTotalCard';
import { SettlementCard } from '@/components/bill/SettlementCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { TAB_BAR_CONTENT_CLEARANCE } from '@/components/ui/BottomTabBar';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { Divider } from '@/components/ui/Divider';
import { ErrorState } from '@/components/ui/ErrorState';
import { InlineError } from '@/components/ui/InlineError';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { StatusBadge } from '@/components/ui/StatusBadge';
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
import { tripsRepository } from '@/db/repositories/trips.repository';
import {
  buildSplitAdjustments,
  buildSplitLineItems,
} from '@/features/adjustments/buildSplitInputs';
import { groupAssignedParticipantIdsByLineItem } from '@/features/assignments/partitionLineItemsByAssignment';
import { deleteBill } from '@/features/bills/bill.service';
import { buildSettlementParticipants } from '@/features/settlement/buildSettlementParticipants';
import { reconcileBillTotals } from '@/features/splitting/reconciliation';
import { computeSettlement } from '@/features/splitting/settlement';
import { buildShareText } from '@/features/splitting/shareText';
import { calculateSplit } from '@/features/splitting/splitCalculator';
import type {
  ReconciliationResult,
  SplitCalculationResult,
} from '@/features/splitting/split.types';
import {
  buildParticipantAdjustmentShareDisplay,
  buildParticipantItemShareDisplay,
  type SummaryAdjustmentInfo,
  type SummaryItemInfo,
} from '@/features/summary/buildParticipantShareDisplay';
import { nowIso } from '@/lib/date';
import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import type { ColorTokens } from '@/theme/tokens';
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

// Same shape as adjustments.tsx's/summary.tsx's own fetch functions — kept as
// its own colocated copy (matching those screens' precedent of not sharing a
// loader across screens, since each screen's guard/error handling around the
// same raw data differs).
async function fetchSavedBillDetailData(billId: string): Promise<LoadedData> {
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

// Spec 13.19/F-016 (reused for a saved bill's read-only history view) +
// F-019 (delete). Shows the same per-participant breakdown the summary
// screen shows (spec F-016/F-017) for a bill that's already COMPLETED —
// unlike adjustments.tsx/summary.tsx, this screen has no draft-progression
// redirect guard (spec section 15): a COMPLETED bill can only have reached
// that status by already passing every earlier gate, so calculateSplit below
// is always safe to call against it as-is.
export default function SavedBillDetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { billId } = useLocalSearchParams<{ billId: string }>();

  const [state, setState] = useState<LoadState>('loading');
  const [bill, setBill] = useState<Bill | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [assignmentRows, setAssignmentRows] = useState<ItemAssignment[]>([]);
  const [splitResult, setSplitResult] = useState<SplitCalculationResult | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);

  const [showReceiptImage, setShowReceiptImage] = useState(false);
  const [showRawText, setShowRawText] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Trip feature addition (not from the numbered MVP spec, see the
  // 2026-08-18 spec Amendment): set only when this bill's `tripId` is not
  // null, so the "Part of trip: {name}" link below only ever appears for a
  // bill scanned into a trip. Read from the trip row itself (never the
  // bill's own tripId route param — spec section 7's "never make navigation
  // route params the source of truth").
  const [tripLink, setTripLink] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchSavedBillDetailData(billId);
        if (!data.billRow) {
          setState('error');
          return;
        }

        if (data.billRow.tripId) {
          const trip = await tripsRepository.getById(data.billRow.tripId);
          if (trip) {
            setTripLink({ id: trip.id, name: trip.name ?? copy.trip.unknownTripTitle });
          }
        }

        const splitParticipants = data.participantRows.map((participant) => ({
          participantId: participant.id,
        }));
        const splitItems = buildSplitLineItems(data.itemRows, data.assignmentRows);
        const splitAdjustments = buildSplitAdjustments(
          data.adjustmentRows,
          data.customAllocationsByAdjustmentId,
        );
        const nextSplitResult = calculateSplit({
          participants: splitParticipants,
          items: splitItems,
          adjustments: splitAdjustments,
        });
        const nextReconciliation = reconcileBillTotals({
          itemSubtotalCentavos: nextSplitResult.itemSubtotalCentavos,
          adjustmentTotalCentavos: nextSplitResult.adjustmentTotalCentavos,
          detectedReceiptTotalCentavos: data.billRow.detectedReceiptTotalCentavos,
        });

        setBill(data.billRow);
        setParticipants(data.participantRows);
        setItems(data.itemRows);
        setAdjustments(data.adjustmentRows);
        setAssignmentRows(data.assignmentRows);
        setSplitResult(nextSplitResult);
        setReconciliation(nextReconciliation);
        setState('ready');
      } catch {
        // Covers both a genuine load failure and calculateSplit's
        // SplitInvariantError (spec 10.7) — same generic error treatment used
        // by every other screen's load effect.
        setState('error');
      }
    })();
  }, [billId]);

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

  const title = bill.merchantName ?? bill.title;
  const hasDetectedTotal = reconciliation.detectedReceiptTotalCentavos !== null;
  const hasReceiptImage = bill.receiptImageUri != null;
  const hasRawOcrText = bill.rawOcrText != null;

  const assignedIdsByItem = groupAssignedParticipantIdsByLineItem(assignmentRows);
  const itemInfoById = new Map<string, SummaryItemInfo>(
    items.map((item) => [
      item.id,
      { name: item.name, assigneeCount: (assignedIdsByItem.get(item.id) ?? []).length },
    ]),
  );
  const adjustmentInfoById = new Map<string, SummaryAdjustmentInfo>(
    adjustments.map((adjustment) => [adjustment.id, { label: adjustment.label }]),
  );
  const nameByParticipantId = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );

  // Post-MVP settlement display (see settlement.ts's header comment) —
  // built from the same already-loaded participant rows and calculateSplit
  // output this screen already has, never from route params.
  const contributionByParticipantId = new Map(
    participants.map((participant) => [
      participant.id,
      { contributedCentavos: participant.contributedCentavos },
    ]),
  );
  const settlementParticipants = buildSettlementParticipants(
    splitResult.participantShares,
    contributionByParticipantId,
  );
  const settlement = computeSettlement(settlementParticipants);
  // Same reasoning as summary.tsx's own hasAnyContribution: nobody having
  // used the (skippable) Payments screen isn't "money unaccounted for," so
  // SettlementCard stays hidden until at least one participant has a nonzero
  // contribution.
  const hasAnyContribution = participants.some(
    (participant) => participant.contributedCentavos !== 0,
  );

  async function handleShare() {
    // TypeScript doesn't retain the outer `!splitResult` narrowing above
    // across this nested function's closure boundary (same reasoning as
    // summary.tsx's own buildShareTextForBill) — re-checked here rather than
    // asserted, even though this handler is never wired up while the earlier
    // loading/error guard is still showing.
    if (!splitResult) return;

    setShareError(null);
    try {
      const text = buildShareText({
        billTitle: title,
        participants: participants.map((participant) => ({
          participantId: participant.id,
          name: participant.name,
        })),
        items: items.map((item) => ({ lineItemId: item.id, name: item.name })),
        adjustments: adjustments.map((adjustment) => ({
          adjustmentId: adjustment.id,
          label: adjustment.label,
        })),
        splitResult,
      });
      await Share.share({ message: text });
    } catch {
      // No spec-mandated share-failure copy for this screen (13.19 doesn't
      // define one of its own) — reused verbatim from the summary screen's
      // share failure text (13.18), which describes exactly the same failure
      // mode, rather than inventing new copy here.
      setShareError(copy.summary.shareFailure);
    }
  }

  // Spec 15 "Completed bill editing": opening Edit bill turns a COMPLETED
  // bill back into a DRAFT (or an edit session that behaves like one), and
  // the user must return to summary and choose "Finish and save" again. The
  // spec doesn't say exactly which screen to land on first — every field on
  // a completed bill already has a value, so any of the five draft screens
  // would technically work. receipt-review is chosen because it's the
  // earliest step in the normal draft flow (spec 15's own draft-progression
  // order), giving the user a full path back through
  // review -> participants -> assignments -> adjustments -> summary to
  // change anything before re-saving.
  async function handleEditBill() {
    await billsRepository.update(billId, {
      status: 'DRAFT',
      completedAt: null,
      updatedAt: nowIso(),
    });
    router.replace(`/bill/${billId}/receipt-review`);
  }

  function handleConfirmDelete() {
    // Same closure-narrowing note as handleShare above.
    if (!bill) return;
    setConfirmingDelete(false);
    try {
      deleteBill(bill);
    } catch {
      setDeleteError(copy.global.deleteFailure);
      return;
    }
    router.replace('/');
  }

  return (
    <Screen scroll padded={false}>
      <View style={styles.body}>
        <View style={styles.headerBlock}>
          <AppText variant="heading" style={styles.uniformText}>
            {title}
          </AppText>

          <View style={styles.totalRow}>
            <AppText color="textSecondary" style={styles.uniformText}>
              {copy.summary.totalLabel}
            </AppText>
            {/* accessibilityLabel is the spoken form (spec section 17's "520
                pesos and 25 centavos" example), distinct from the visible
                formatCentavos text. */}
            <AppText
              variant="amount"
              accessibilityLabel={formatCentavosForSpeech(splitResult.computedTotalCentavos)}
              style={styles.uniformText}
            >
              {formatCentavos(splitResult.computedTotalCentavos)}
            </AppText>
          </View>

          {hasDetectedTotal ? (
            <StatusBadge
              label={
                reconciliation.matches ? copy.summary.matchSuccess : copy.summary.mismatchStatus
              }
              tone={reconciliation.matches ? 'success' : 'warning'}
            />
          ) : null}

          {tripLink ? (
            // Deliberately obvious (secondary, full-width) — matches
            // Summary's own backToTripAction button, since this is the
            // screen "Finish and save" lands on and the user wants this
            // just as visible after saving as before.
            <AppButton
              variant="secondary"
              label={copy.savedBillDetail.tripLinkLabel.replace('{name}', tripLink.name)}
              onPress={() => router.push(`/trip/${tripLink.id}`)}
              icon={(color) => <Feather name="map-pin" size={18} color={color} />}
            />
          ) : null}
        </View>

        <View style={styles.actionsBlock}>
          {/* Edit (non-destructive, secondary) and Delete (destructive) stay
              spatially side by side but visually distinct — different
              variants/colors plus different glyphs (edit-2 vs. trash-2), not
              just the destructive-red fill alone. */}
          <View style={styles.actionsRow}>
            <AppButton
              variant="secondary"
              label={copy.savedBillDetail.editAction}
              onPress={handleEditBill}
              icon={(color) => <Feather name="edit-2" size={18} color={color} />}
            />
            <AppButton
              variant="destructive"
              label={copy.savedBillDetail.deleteAction}
              onPress={() => setConfirmingDelete(true)}
              icon={(color) => <Feather name="trash-2" size={18} color={color} />}
            />
          </View>
          {shareError ? <InlineError message={shareError} /> : null}
          {deleteError ? <InlineError message={deleteError} /> : null}
        </View>

        <View style={styles.linksBlock}>
          {hasReceiptImage ? (
            <AppButton
              variant="text"
              label={copy.savedBillDetail.receiptAction}
              onPress={() => setShowReceiptImage(true)}
              icon={(color) => <Feather name="file-text" size={18} color={color} />}
            />
          ) : null}
          {hasRawOcrText ? (
            <AppButton
              variant="text"
              label={copy.savedBillDetail.rawOcrAction}
              onPress={() => setShowRawText(true)}
              icon={(color) => <Feather name="file-text" size={18} color={color} />}
            />
          ) : null}
          {!hasReceiptImage && !hasRawOcrText ? (
            <AppText color="textSecondary" style={styles.uniformText}>
              {copy.savedBillDetail.noReceiptText}
            </AppText>
          ) : null}
        </View>

        <View style={styles.cardsBlock}>
          <Divider />
          <View style={styles.cardsList}>
            {splitResult.participantShares.map((share) => {
              const name = nameByParticipantId.get(share.participantId) ?? '';
              return (
                <PersonTotalCard
                  key={share.participantId}
                  name={name}
                  finalTotalCentavos={share.finalTotalCentavos}
                  itemShares={buildParticipantItemShareDisplay(share.itemShares, itemInfoById)}
                  adjustmentShares={buildParticipantAdjustmentShareDisplay(
                    share.adjustmentShares,
                    adjustmentInfoById,
                  )}
                  paidCentavos={
                    hasAnyContribution
                      ? contributionByParticipantId.get(share.participantId)?.contributedCentavos
                      : undefined
                  }
                />
              );
            })}
          </View>
        </View>

        {hasAnyContribution ? (
          <SettlementCard
            transactions={settlement.transactions}
            unaccountedCentavos={settlement.unaccountedCentavos}
            nameByParticipantId={nameByParticipantId}
            totalCentavos={splitResult.computedTotalCentavos}
          />
        ) : null}

        {/* Was a sticky BottomActionBar footer — moved inline, per the
            user's own explicit request (2026-08-27) to drop sticky nav
            footers in favor of plain in-flow buttons. This is a persisted
            read view, not a wizard step, so its primary action gets the
            mapping table's `share` icon rather than a "Continue"-style
            arrow-right. */}
        <AppButton
          label={copy.savedBillDetail.shareAction}
          onPress={handleShare}
          icon={(color) => <Feather name="share" size={18} color={color} />}
        />
      </View>

      <Modal
        visible={showReceiptImage}
        animationType="slide"
        onRequestClose={() => setShowReceiptImage(false)}
      >
        <Screen scroll={false}>
          <AppButton
            variant="text"
            label={copy.global.closeAccessibilityLabel}
            onPress={() => setShowReceiptImage(false)}
            icon={(color) => <Feather name="x" size={18} color={color} />}
          />
          {bill.receiptImageUri ? (
            <Image
              source={{ uri: bill.receiptImageUri }}
              style={styles.receiptImage}
              contentFit="contain"
              accessibilityLabel={copy.savedBillDetail.receiptAction}
            />
          ) : null}
        </Screen>
      </Modal>

      <Modal
        visible={showRawText}
        animationType="slide"
        onRequestClose={() => setShowRawText(false)}
      >
        <Screen scroll>
          <AppButton
            variant="text"
            label={copy.global.closeAccessibilityLabel}
            onPress={() => setShowRawText(false)}
            icon={(color) => <Feather name="x" size={18} color={color} />}
          />
          <ScrollView style={styles.rawTextScroll}>
            <AppText
              selectable
              variant="caption"
              style={[styles.uniformText, styles.rawText]}
            >
              {bill.rawOcrText}
            </AppText>
          </ScrollView>
        </Screen>
      </Modal>

      <ConfirmationDialog
        visible={confirmingDelete}
        heading={copy.savedBillDetail.deleteConfirmHeading}
        body={copy.savedBillDetail.deleteConfirmBody}
        confirmLabel={copy.savedBillDetail.deleteAction}
        cancelLabel={copy.global.cancelAction}
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </Screen>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    body: {
      padding: spacing.lg,
      // The Share button used to sit in a sticky footer, which Screen.tsx
      // pads above the global nav bar automatically — now that it's plain
      // in-flow content, this screen reserves that space itself.
      paddingBottom: spacing.lg + TAB_BAR_CONTENT_CLEARANCE,
      // Section-to-section rhythm: header block / edit+delete actions /
      // receipt+raw-text links / person cards each read as their own
      // distinct block. spacing.md/sm stays reserved for tight,
      // within-section grouping (see the block-specific styles below).
      gap: spacing.xl,
    },
    headerBlock: {
      gap: spacing.xs,
    },
    totalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
    },
    actionsBlock: {
      gap: spacing.sm,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    linksBlock: {
      gap: spacing.sm,
    },
    cardsBlock: {
      gap: spacing.md,
    },
    cardsList: {
      gap: spacing.sm,
    },
    receiptImage: {
      flex: 1,
    },
    rawTextScroll: {
      marginTop: spacing.md,
    },
    rawText: {
      fontFamily: 'monospace',
      color: colors.textPrimary,
    },
    // Matches the `caption` variant's own size — every AppText directly in
    // this screen now reads at one uniform size (see BillListItem.tsx's own
    // titleText/totalText for the same treatment); each variant's own
    // font-weight (and, for `amount`, tabular-nums) is what still
    // distinguishes the heading/total from body text.
    uniformText: {
      fontSize: 13,
      lineHeight: 18,
    },
  });
}
