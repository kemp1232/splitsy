import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { PersonTotalCard } from '@/components/bill/PersonTotalCard';
import { SettlementCard } from '@/components/bill/SettlementCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
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
import {
  buildSplitAdjustments,
  buildSplitLineItems,
} from '@/features/adjustments/buildSplitInputs';
import {
  groupAssignedParticipantIdsByLineItem,
  partitionLineItemsByAssignment,
} from '@/features/assignments/partitionLineItemsByAssignment';
import { hasMinimumParticipants } from '@/features/participants/hasMinimumParticipants';
import {
  buildParticipantAdjustmentShareDisplay,
  buildParticipantItemShareDisplay,
  type SummaryAdjustmentInfo,
  type SummaryItemInfo,
} from '@/features/summary/buildParticipantShareDisplay';
import { buildSettlementParticipants } from '@/features/settlement/buildSettlementParticipants';
import { buildShareText } from '@/features/splitting/shareText';
import { calculateSplit } from '@/features/splitting/splitCalculator';
import { computeSettlement } from '@/features/splitting/settlement';
import { reconcileBillTotals } from '@/features/splitting/reconciliation';
import type {
  ReconciliationResult,
  SplitCalculationResult,
} from '@/features/splitting/split.types';
import { formatBillListDate, nowIso } from '@/lib/date';
import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import { colors, radius, spacing } from '@/theme/tokens';

type LoadState = 'loading' | 'ready' | 'error';

// How long the bottom-of-screen toast banner stays visible before clearing
// itself (spec F-016's "Save as completed"/"Copy text" both need some
// lightweight confirmation — this codebase has no toast/snackbar primitive
// yet, so this screen builds the smallest thing that works rather than
// pulling in a new dependency).
const TOAST_VISIBLE_MS = 2000;
// How long "Bill saved." stays on screen before navigating to the saved-bill
// detail screen — short enough not to feel like a stall, long enough that
// the confirmation is actually readable before the screen changes.
const SAVE_NAVIGATE_DELAY_MS = 700;

type LoadedData = {
  billRow: Bill | undefined;
  itemRows: LineItem[];
  participantRows: Participant[];
  adjustmentRows: Adjustment[];
  assignmentRows: ItemAssignment[];
  customAllocationsByAdjustmentId: Map<string, AdjustmentAllocation[]>;
};

async function fetchSummaryData(billId: string): Promise<LoadedData> {
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

// Same calculation pass as adjustments.tsx's own computeSplitAndReconciliation
// — kept as its own colocated copy (matching that screen's precedent of not
// sharing a loader/calculator function across screens) rather than exported
// and imported from there, since each screen's fetch shape and draft-guard
// ordering differs slightly.
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

export default function SummaryScreen() {
  const router = useRouter();
  const { billId } = useLocalSearchParams<{ billId: string }>();

  const [state, setState] = useState<LoadState>('loading');
  const [bill, setBill] = useState<Bill | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [assignmentRows, setAssignmentRows] = useState<ItemAssignment[]>([]);
  const [splitResult, setSplitResult] = useState<SplitCalculationResult | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  function showToast(message: string) {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), TOAST_VISIBLE_MS);
  }

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchSummaryData(billId);
        if (!data.billRow) {
          setState('error');
          return;
        }

        // Draft-progression guard (spec section 15), the same one
        // adjustments.tsx already applies plus one more rule: this is the
        // "otherwise -> summary" terminal step, so every earlier condition
        // must already be satisfied, and (rule 4) a receipt-total mismatch
        // must be either resolved or explicitly acknowledged before this
        // screen is reachable at all — never render it, and never call
        // calculateSplit, against data it isn't ready for.
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

        if (!nextReconciliation.matches && !data.billRow.discrepancyAcknowledged) {
          router.replace(`/bill/${billId}/adjustments`);
          return;
        }

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
        // SplitInvariantError (spec 10.7) — either way not a user-fixable
        // validation case, so it's the same generic error state as any other
        // unexpected failure.
        setState('error');
      }
    })();
  }, [billId, router]);

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
  // Nobody has used the Payments screen for this bill yet — every
  // contribution defaults to 0, which would otherwise make
  // unaccountedCentavos equal the entire bill total and render as a warning
  // ("X hasn't been marked as paid yet") on every bill that simply never
  // engaged the (skippable) Payments feature. That's "unused feature," not
  // "money unaccounted for," so SettlementCard stays hidden entirely until at
  // least one participant has a nonzero contribution.
  const hasAnyContribution = participants.some(
    (participant) => participant.contributedCentavos !== 0,
  );

  function buildShareTextForBill(): string {
    if (!splitResult) throw new Error('buildShareTextForBill: split result not loaded');
    return buildShareText({
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
  }

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      const timestamp = nowIso();
      await billsRepository.update(billId, {
        status: 'COMPLETED',
        completedAt: timestamp,
        updatedAt: timestamp,
      });
      showToast(copy.summary.savedToast);
      setTimeout(() => {
        router.replace(`/bill/${billId}`);
      }, SAVE_NAVIGATE_DELAY_MS);
    } catch {
      // No spec-mandated copy for a bill-save failure on this screen (spec
      // 14's "Storage failure" row hasn't been added to copy.ts yet) — reused
      // as the closest already-approved generic fallback rather than
      // inventing new copy text here.
      setSaveError(copy.global.genericErrorBody);
      setSaving(false);
    }
  }

  async function handleShare() {
    setShareError(null);
    try {
      await Share.share({ message: buildShareTextForBill() });
    } catch {
      setShareError(copy.summary.shareFailure);
    }
  }

  async function handleCopy() {
    setCopyError(null);
    try {
      await Clipboard.setStringAsync(buildShareTextForBill());
      showToast(copy.summary.copiedToast);
    } catch {
      // Same reasoning as handleSave's fallback above — expo-clipboard's
      // setStringAsync always resolves on iOS/Android per its own docs, so
      // this only ever fires from some unexpected native failure, and there
      // is no spec-mandated copy string for it.
      setCopyError(copy.global.genericErrorBody);
    }
  }

  function handleEdit() {
    router.push(`/bill/${billId}/receipt-review`);
  }

  return (
    <Screen
      scroll
      padded={false}
      footer={
        <>
          {toastMessage ? (
            <View style={styles.toast} accessibilityLiveRegion="polite">
              <AppText color="onPrimary">{toastMessage}</AppText>
            </View>
          ) : null}
          <BottomActionBar>
            {saveError ? <InlineError message={saveError} /> : null}
            <AppButton
              label={copy.summary.saveAction}
              onPress={handleSave}
              loading={saving}
              disabled={saving}
            />
          </BottomActionBar>
        </>
      }
    >
      <View style={styles.body}>
        <View style={styles.headerBlock}>
          <AppText variant="heading">{copy.summary.heading}</AppText>
          <AppText variant="subheading">{title}</AppText>
          {bill.receiptDate ? (
            <AppText variant="caption" color="textSecondary">
              {formatBillListDate(bill.receiptDate)}
            </AppText>
          ) : null}

          <View style={styles.totalRow}>
            <AppText color="textSecondary">{copy.summary.totalLabel}</AppText>
            {/* accessibilityLabel is the spoken form (spec section 17's "520
                pesos and 25 centavos" example), distinct from the visible
                formatCentavos text. */}
            <AppText
              variant="amount"
              accessibilityLabel={formatCentavosForSpeech(splitResult.computedTotalCentavos)}
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
        </View>

        <View style={styles.actionsRow}>
          <View style={styles.actionColumn}>
            <AppButton variant="secondary" label={copy.summary.shareAction} onPress={handleShare} />
            {shareError ? <InlineError message={shareError} /> : null}
          </View>
          <View style={styles.actionColumn}>
            <AppButton variant="secondary" label={copy.summary.copyAction} onPress={handleCopy} />
            {copyError ? <InlineError message={copyError} /> : null}
          </View>
        </View>
        <AppButton variant="text" label={copy.summary.editAction} onPress={handleEdit} />

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
              />
            );
          })}
        </View>

        {hasAnyContribution ? (
          <SettlementCard
            transactions={settlement.transactions}
            unaccountedCentavos={settlement.unaccountedCentavos}
            nameByParticipantId={nameByParticipantId}
          />
        ) : null}

        {/* Direct entry point to Payments regardless of draft-progression
            state (resolveNextRoute.ts has no concept of this screen —
            "Skip for now" being a one-tap action means most drafts never
            pass through it again otherwise). */}
        <AppButton
          variant="text"
          label={copy.payments.editAction}
          onPress={() => router.push(`/bill/${billId}/payments`)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.lg,
    gap: spacing.md,
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
  toast: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.textPrimary,
  },
});
