import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { PaymentContributionRow } from '@/components/bill/PaymentContributionRow';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { TAB_BAR_CONTENT_CLEARANCE } from '@/components/ui/BottomTabBar';
import { Divider } from '@/components/ui/Divider';
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
import {
  buildSplitAdjustments,
  buildSplitLineItems,
} from '@/features/adjustments/buildSplitInputs';
import { partitionLineItemsByAssignment } from '@/features/assignments/partitionLineItemsByAssignment';
import { hasMinimumParticipants } from '@/features/participants/hasMinimumParticipants';
import { computeContributionUpdates } from '@/features/payments/computeContributionUpdates';
import { reconcileBillTotals } from '@/features/splitting/reconciliation';
import { calculateSplit } from '@/features/splitting/splitCalculator';
import type {
  ReconciliationResult,
  SplitCalculationResult,
} from '@/features/splitting/split.types';
import { nowIso } from '@/lib/date';
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
// its own colocated copy, matching those screens' precedent of not sharing a
// loader across screens.
async function fetchPaymentsData(billId: string): Promise<LoadedData> {
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

// Same calculation pass as adjustments.tsx's/summary.tsx's own
// computeSplitAndReconciliation — kept as its own colocated copy for the same
// reason those screens already document on themselves.
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

// Post-MVP scope expansion (approved 2026-08-04 — see
// src/features/splitting/settlement.ts's header comment for the full
// rationale). Inserted between Adjustments and Summary in the draft flow
// (spec section 15's draft-progression order, extended one step): lets each
// participant record what they actually contributed toward the bill, which
// the Summary/saved-bill-detail screens turn into a peer-to-peer settlement
// via computeSettlement.
//
// Bill data (items/participants/adjustments/assignments) is always read from
// the repositories here, never from route params — this screen only ever
// takes `billId` off the route (spec's "route params are never the source of
// truth for bill data" rule).
export default function PaymentsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { billId } = useLocalSearchParams<{ billId: string }>();

  const [state, setState] = useState<LoadState>('loading');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [computedTotalCentavos, setComputedTotalCentavos] = useState(0);
  // Local, in-progress form state — participant id -> their contribution in
  // centavos. Never written back to the repository until Continue is
  // pressed (Skip discards it entirely), matching this screen's own
  // "no validation needed beyond AmountInput's own structural checks" brief.
  const [contributions, setContributions] = useState<Record<string, number>>({});
  // AmountInput deliberately only seeds its displayed text from valueCentavos
  // once, at mount — it never re-syncs on a later prop change, so typing
  // isn't fought mid-keystroke by a value bouncing back from the parent.
  // "Paid in full" needs the opposite: every row's field must visibly update
  // to reflect the new externally-set amount. Bumping this on every
  // full-amount press and folding it into the FlatList's key forces every
  // PaymentContributionRow (and its AmountInput) to remount, so each one
  // re-seeds its displayed text from the just-updated `contributions` value
  // instead of silently keeping stale text next to a correctly-updated
  // underlying value.
  const [resetToken, setResetToken] = useState(0);
  const [saving, setSaving] = useState(false);
  // One shared error slot for this screen's only write path (Continue's
  // save) — mirrors participants.tsx's/adjustments.tsx's own actionError
  // convention from the Milestone 7 hardening pass.
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchPaymentsData(billId);
        if (!data.billRow) {
          setState('error');
          return;
        }

        // Draft-progression guard (spec section 15, extended one step for
        // this post-MVP screen): everything adjustments.tsx/summary.tsx
        // already require — items exist, at least two participants exist,
        // every item is assigned, and (summary.tsx's own extra rule) any
        // receipt-total mismatch is either resolved or already acknowledged.
        // Payments sits after all of that and before summary, so it applies
        // the same full guard summary.tsx does rather than a lesser one —
        // never render this screen, and never call calculateSplit, against
        // data it isn't ready for.
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

        const { splitResult, reconciliation } = computeSplitAndReconciliation(data);

        if (!reconciliation.matches && !data.billRow.discrepancyAcknowledged) {
          router.replace(`/bill/${billId}/adjustments`);
          return;
        }

        const initialContributions: Record<string, number> = {};
        for (const participant of data.participantRows) {
          initialContributions[participant.id] = participant.contributedCentavos;
        }

        setParticipants(data.participantRows);
        setComputedTotalCentavos(splitResult.computedTotalCentavos);
        setContributions(initialContributions);
        setState('ready');
      } catch {
        // Covers both a genuine load failure and calculateSplit's
        // SplitInvariantError (spec 10.7) — same generic error treatment
        // every other screen's load effect uses.
        setState('error');
      }
    })();
  }, [billId, router]);

  function handleAmountChange(participantId: string, centavos: number) {
    setContributions((current) => ({ ...current, [participantId]: centavos }));
  }

  // "Paid in full": this participant covers the whole bill, so everyone
  // else's contribution resets to zero in local form state — the "one person
  // paid it all" shortcut, distinct from manually entering a partial/split
  // payment per person. Nothing is persisted yet; Continue still owns the
  // actual save.
  function handleFullAmount(participantId: string) {
    setContributions(() => {
      const next: Record<string, number> = {};
      for (const participant of participants) {
        next[participant.id] = participant.id === participantId ? computedTotalCentavos : 0;
      }
      return next;
    });
    setResetToken((token) => token + 1);
  }

  // Leaves every contribution exactly as loaded (i.e. discards any
  // in-progress, unsaved edits in local state) and goes straight to summary.
  function handleSkip() {
    router.push(`/bill/${billId}/summary`);
  }

  async function handleContinue() {
    setActionError(null);
    setSaving(true);
    try {
      const currentByParticipantId = new Map(Object.entries(contributions));
      const updates = computeContributionUpdates(participants, currentByParticipantId);
      const timestamp = nowIso();
      await Promise.all(
        updates.map((update) =>
          participantsRepository.update(update.participantId, {
            contributedCentavos: update.contributedCentavos,
            updatedAt: timestamp,
          }),
        ),
      );
      router.push(`/bill/${billId}/summary`);
      // Expo Router keeps this screen mounted underneath the pushed Summary
      // screen rather than unmounting it, so without this the Continue
      // button would still read as loading/disabled if the user later
      // presses back into this screen.
      setSaving(false);
    } catch {
      setActionError(copy.global.storageFailure);
      setSaving(false);
    }
  }

  if (state === 'loading') {
    return (
      <Screen>
        <LoadingState />
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
          onRetry={() => setState('loading')}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll padded={false}>
      <View style={styles.body}>
        <View style={styles.introBlock}>
          {/* Full-size heading (no uniformText override) + leading icon —
              matches every other draft-wizard step's own header treatment. */}
          <View style={styles.headingRow}>
            <Feather name="credit-card" size={24} color={colors.primary} />
            <AppText variant="heading">{copy.payments.heading}</AppText>
          </View>
          <AppText variant="body" color="textSecondary">
            {copy.payments.body}
          </AppText>
        </View>

        <Divider />

        <FlatList
          data={participants}
          keyExtractor={(participant) => `${participant.id}-${resetToken}`}
          extraData={contributions}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={styles.itemGap} />}
          renderItem={({ item }) => (
            <PaymentContributionRow
              name={item.name}
              valueCentavos={contributions[item.id] ?? 0}
              onChangeCentavos={(centavos) => handleAmountChange(item.id, centavos)}
              onFullAmount={() => handleFullAmount(item.id)}
            />
          )}
        />

        {/* Was a sticky BottomActionBar footer — moved inline, per the
            user's own explicit request (2026-08-27) to drop sticky nav
            footers in favor of plain in-flow buttons. Skip stays icon-less
            (skipping isn't a forward wizard action worth an arrow-right, per
            the polish-pass icon-mapping table). */}
        <View style={styles.actionsBlock}>
          {actionError ? <InlineError message={actionError} /> : null}
          <AppButton
            variant="text"
            label={copy.payments.skipAction}
            icon={(color) => <Feather name="skip-forward" size={18} color={color} />}
            onPress={handleSkip}
          />
          <AppButton
            label={copy.payments.continueButton}
            onPress={handleContinue}
            loading={saving}
            disabled={saving}
            icon={(color) => <Feather name="arrow-right-circle" size={18} color={color} />}
            iconPosition="trailing"
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.lg,
    // The Skip/Continue buttons used to sit in a sticky footer, which
    // Screen.tsx pads above the global nav bar automatically — now that
    // they're plain in-flow content, this screen reserves that space itself.
    paddingBottom: spacing.lg + TAB_BAR_CONTENT_CLEARANCE,
    // Section-to-section rhythm (intro block / the contribution rows list /
    // the skip+continue actions each read as their own distinct block).
    gap: spacing.xl,
  },
  introBlock: {
    gap: spacing.sm,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionsBlock: {
    gap: spacing.sm,
  },
  itemGap: {
    height: spacing.sm,
  },
});
