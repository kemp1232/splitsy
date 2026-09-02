import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { PersonTotalCard } from '@/components/bill/PersonTotalCard';
import { SettlementCard } from '@/components/bill/SettlementCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { TAB_BAR_CONTENT_CLEARANCE } from '@/components/ui/BottomTabBar';
import { Divider } from '@/components/ui/Divider';
import { ErrorState } from '@/components/ui/ErrorState';
import { GradientHeroCard } from '@/components/ui/GradientHeroCard';
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
import { tripsRepository } from '@/db/repositories/trips.repository';
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
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

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

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Trip feature addition (not from the numbered MVP spec, see the
  // 2026-08-18 spec Amendment): set only when this bill's `tripId` is not
  // null. Read from the trip row itself, never the bill's own `tripId` route
  // param (spec section 7's "never make navigation route params the source
  // of truth") — same pattern as bill/[billId]/index.tsx's own tripLink.
  const [tripLink, setTripLink] = useState<{ id: string; name: string } | null>(null);

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

        if (data.billRow.tripId) {
          const trip = await tripsRepository.getById(data.billRow.tripId);
          if (trip) {
            setTripLink({ id: trip.id, name: trip.name ?? copy.trip.unknownTripTitle });
          }
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
        paidCentavos: hasAnyContribution ? participant.contributedCentavos : undefined,
      })),
      items: items.map((item) => ({ lineItemId: item.id, name: item.name })),
      adjustments: adjustments.map((adjustment) => ({
        adjustmentId: adjustment.id,
        label: adjustment.label,
      })),
      splitResult,
      // Same hasAnyContribution gate as the on-screen SettlementCard — a
      // bill that never touched Payments shouldn't get a "Settle up" block
      // (or "Paid" lines) in its shared text either.
      settlementTransactions: hasAnyContribution ? settlement.transactions : undefined,
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
    <Screen scroll padded={false}>
      <View style={styles.headerRow}>
        {/* Full-size heading (no uniformText override) + leading icon —
            matches every other draft-wizard step's own header treatment. */}
        <View style={styles.headingRow}>
          <Feather name="share-2" size={24} color={colors.primary} />
          <AppText variant="heading">{copy.summary.heading}</AppText>
        </View>
        <AppText variant="body" color="textSecondary">
          {copy.summary.body}
        </AppText>
      </View>

      {/* Gradient hero card (reference UI's rounded-bottom-corner "hero
          panel", screenshot 2) — this screen's one genuinely single running
          total. roundTopCorners/sideInset: unlike the trip screens' own hero
          cards, this one renders below the heading above it rather than
          flush against the screen's actual edges, so it now matches
          PersonTotalCard's own inset and corner treatment below it. */}
      <GradientHeroCard
        label={copy.summary.totalLabel}
        amountCentavos={splitResult.computedTotalCentavos}
        subtitle={title}
        meta={bill.receiptDate ? formatBillListDate(bill.receiptDate) : undefined}
        icon={(color) => <Feather name="file-text" size={18} color={color} />}
        roundTopCorners
        sideInset
        statusBadge={
          hasDetectedTotal ? (
            <StatusBadge
              label={
                reconciliation.matches ? copy.summary.matchSuccess : copy.summary.mismatchStatus
              }
              tone={reconciliation.matches ? 'success' : 'warning'}
              solid
            />
          ) : undefined
        }
      />

      <View style={styles.body}>
        <View style={styles.statusBlock}>
          {/* Deliberately obvious (secondary, full-width), not the quieter
              text-styled link used on the saved-bill-detail screen — finishing
              a bill is exactly the moment someone wants to jump back and scan
              the trip's next one. */}
          {tripLink ? (
            <AppButton
              variant="secondary"
              label={copy.summary.backToTripAction.replace('{name}', tripLink.name)}
              onPress={() => router.push(`/trip/${tripLink.id}`)}
              icon={(color) => <Feather name="map-pin" size={18} color={color} />}
            />
          ) : null}
        </View>

        <View style={styles.shareBlock}>
          <View style={styles.actionsRow}>
            <View style={styles.actionColumn}>
              <AppButton
                variant="secondary"
                label={copy.summary.shareAction}
                onPress={handleShare}
                icon={(color) => <Feather name="share" size={18} color={color} />}
              />
              {shareError ? <InlineError message={shareError} /> : null}
            </View>
            <View style={styles.actionColumn}>
              <AppButton
                variant="secondary"
                label={copy.summary.copyAction}
                onPress={handleCopy}
                icon={(color) => <Feather name="copy" size={18} color={color} />}
              />
              {copyError ? <InlineError message={copyError} /> : null}
            </View>
          </View>
          <AppButton
            variant="text"
            label={copy.summary.editAction}
            onPress={handleEdit}
            icon={(color) => <Feather name="edit" size={18} color={color} />}
          />
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

        <View style={styles.finishBlock}>
          {/* Direct entry point to Payments regardless of draft-progression
              state (resolveNextRoute.ts has no concept of this screen —
              "Skip for now" being a one-tap action means most drafts never
              pass through it again otherwise). */}
          <AppButton
            variant="text"
            label={copy.payments.editAction}
            onPress={() => router.push(`/bill/${billId}/payments`)}
            icon={(color) => <Feather name="edit" size={18} color={color} />}
          />

          {/* Was a sticky BottomActionBar footer — moved inline, per the
              user's own explicit request (2026-08-27) to drop sticky nav
              footers in favor of plain in-flow buttons. */}
          {toastMessage ? (
            <View style={styles.toast} accessibilityLiveRegion="polite">
              <AppText color="onPrimary" style={styles.uniformText}>
                {toastMessage}
              </AppText>
            </View>
          ) : null}
          {saveError ? <InlineError message={saveError} /> : null}
          {/* The reference UI's prominent bottom-of-screen pill primary action
              (screenshot 2's "Bill Splitting" breakdown screen). Leading
              check-circle rather than arrow-right: unlike adjustments.tsx/
              payments.tsx, this doesn't advance to another wizard step — it's
              the "fully done" action that marks the bill COMPLETED (mapping
              table's own "Mark trip settled" example is the same kind of
              action). */}
          <AppButton
            pill
            label={copy.summary.saveAction}
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            icon={(color) => <Feather name="check-circle" size={18} color={color} />}
          />
        </View>
      </View>
    </Screen>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    body: {
      padding: spacing.lg,
      // The Save button used to sit in a sticky footer, which Screen.tsx
      // pads above the global nav bar automatically — now that it's plain
      // in-flow content, this screen reserves that space itself.
      paddingBottom: spacing.lg + TAB_BAR_CONTENT_CLEARANCE,
      // Section-to-section rhythm: the hero card above already sits outside
      // this View entirely, so the first gap here separates the status
      // badge/trip-link block from the share/copy/edit block, then that from
      // the person cards, the settlement card, and the finishing (payments
      // link + save) block. spacing.md/sm stays reserved for tight,
      // within-section grouping (see the block-specific styles below).
      gap: spacing.xl,
    },
    headerRow: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      // Larger than the usual spacing.sm bottom padding — doubles as the
      // margin above the hero card directly below this block.
      paddingBottom: spacing.lg,
      gap: spacing.sm,
    },
    headingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    statusBlock: {
      gap: spacing.sm,
    },
    shareBlock: {
      gap: spacing.sm,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    actionColumn: {
      flex: 1,
      gap: spacing.xs / 2,
    },
    cardsBlock: {
      gap: spacing.md,
    },
    cardsList: {
      gap: spacing.sm,
    },
    finishBlock: {
      gap: spacing.sm,
    },
    // Deliberately an inverted chip (textPrimary as the fill, onPrimary as
    // the label) rather than a fixed literal — both tokens flip together
    // between light and dark (see tokens.ts's header comment on why
    // `onPrimary` flips dark-mode direction), so this keeps reading as a
    // solid, high-contrast toast in either theme without its own
    // theme-conditional branch.
    toast: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: colors.textPrimary,
    },
    // Matches the `caption` variant's own size — every AppText directly in
    // this screen now reads at one uniform size (see BillListItem.tsx's own
    // titleText/totalText for the same treatment); each variant's own
    // font-weight is what still distinguishes the heading from body text.
    uniformText: {
      fontSize: 14,
      lineHeight: 19,
    },
  });
}
