import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { PaymentContributionRow } from '@/components/bill/PaymentContributionRow';
import { AppButton } from '@/components/ui/AppButton';
import { ErrorState } from '@/components/ui/ErrorState';
import { GroupedCard, GroupedSeparator, SectionHeader } from '@/components/ui/GroupedSection';
import { InlineError } from '@/components/ui/InlineError';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { WarningNote } from '@/components/ui/WarningNote';
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
import { hasUnresolvedDiscrepancy } from '@/features/bills/hasUnresolvedDiscrepancy';
import { useEnsureBillEditable } from '@/features/bills/useEnsureBillEditable';
import { hasMinimumParticipants } from '@/features/participants/hasMinimumParticipants';
import { resolveQuickAddMeName } from '@/features/participants/validateParticipantName';
import {
  buildInitialContributions,
  followWholeBillPayer,
} from '@/features/payments/buildInitialContributions';
import { computeContributionUpdates } from '@/features/payments/computeContributionUpdates';
import { computeOverpaymentCentavos } from '@/features/payments/computeOverpaymentCentavos';
import { getNegativeTotalWarning } from '@/features/receipt-review/buildTotalsSummary';
import { reconcileBillTotals } from '@/features/splitting/reconciliation';
import { calculateSplit } from '@/features/splitting/splitCalculator';
import type {
  ReconciliationResult,
  SplitCalculationResult,
} from '@/features/splitting/split.types';
import { authClient } from '@/lib/authClient';
import { nowIso } from '@/lib/date';
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
  const { billId } = useLocalSearchParams<{ billId: string }>();
  // Back in edit mode if the bill was re-completed underneath this screen.
  useEnsureBillEditable(billId);
  // Identifies the signed-in user's participant for the "nothing paid yet"
  // pre-fill — same name rule as participants.tsx's "Add me".
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const meName = resolveQuickAddMeName(session?.user.name);

  const [state, setState] = useState<LoadState>('loading');
  // Bumped by the error state's Retry so the load effect below runs again —
  // setting state back to 'loading' alone never re-triggers it.
  const [reloadKey, setReloadKey] = useState(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [computedTotalCentavos, setComputedTotalCentavos] = useState(0);
  // Local, in-progress form state — participant id -> their contribution in
  // centavos. Never written back to the repository until Continue is
  // pressed (Skip discards it entirely). Beyond AmountInput's own structural
  // checks, the only validation is the total: entering more than the bill's
  // computed total shows an inline error and disables Continue
  // (computeOverpaymentCentavos); exactly the total is allowed.
  const [contributions, setContributions] = useState<Record<string, number>>({});
  // AmountInput deliberately only seeds its displayed text from valueCentavos
  // once, at mount — it never re-syncs on a later prop change, so typing
  // isn't fought mid-keystroke by a value bouncing back from the parent.
  // "Paid the whole bill" needs the opposite: every row's field must visibly update
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
  // "Nothing paid yet" pre-fill bookkeeping: applied at most once per mount,
  // and never over the user's own edits.
  const [prefillChecked, setPrefillChecked] = useState(false);
  const [hasEdited, setHasEdited] = useState(false);
  // The bill total the current contributions were last lined up with — lets a
  // whole-bill payer follow a total that changed while this screen stayed
  // mounted (see followWholeBillPayer below). null until the pre-fill ran.
  const [totalBasisCentavos, setTotalBasisCentavos] = useState<number | null>(null);

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

        if (hasUnresolvedDiscrepancy(reconciliation, data.billRow)) {
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
  }, [billId, router, reloadKey]);

  // This screen stays mounted under Summary (and Summary's own Edit bill), so
  // coming back re-reads just the bill total — the negative-total warning and
  // "Paid the whole bill" then match the current items/discounts — without
  // touching the contributions being typed (other than a single whole-bill
  // payer, which follows the new total — see followWholeBillPayer below, so
  // a stale pre-filled amount never trips the overpayment block on its own).
  // Skips the first focus (the load effect above already read it).
  const hasFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        return;
      }
      let active = true;
      (async () => {
        try {
          const data = await fetchPaymentsData(billId);
          if (!data.billRow) return;
          const { splitResult } = computeSplitAndReconciliation(data);
          if (!active) return;
          setComputedTotalCentavos(splitResult.computedTotalCentavos);
        } catch {
          // Incomplete bill (calculateSplit threw) or a read failure: keep
          // the last total; the load effect's guards handle real problems.
        }
      })();
      return () => {
        active = false;
      };
    }, [billId]),
  );

  // Once the data is loaded and the session has resolved (so meName is the
  // real user, not the pending-state 'Me' fallback): if nothing is saved yet
  // (or the signed-in user's saved whole-bill amount is stale against the
  // current total), pre-fill them as having paid the whole bill. Local only —
  // computeContributionUpdates persists it on Continue. Done during render
  // (React's "adjust state on change" pattern) rather than in an effect, and
  // kept out of the load effect so a session refresh never reloads the
  // screen over unsaved edits. Bumping resetToken re-seeds the AmountInputs.
  if (!prefillChecked && state === 'ready' && !isSessionPending) {
    setPrefillChecked(true);
    if (!hasEdited) {
      const prefilled = buildInitialContributions(participants, computedTotalCentavos, meName);
      if (
        participants.some(
          (participant) => prefilled[participant.id] !== contributions[participant.id],
        )
      ) {
        setContributions(prefilled);
        setResetToken((token) => token + 1);
      }
    }
  }

  // The total changed after the pre-fill (items edited while this screen
  // stayed mounted under Summary): a single "paid the whole bill" amount at
  // the old total moves to the new one, so it can't go stale. Splits and
  // partial amounts are left alone. Same render-time adjustment pattern as
  // the pre-fill above; resetToken re-seeds the AmountInputs.
  if (prefillChecked && state === 'ready' && totalBasisCentavos !== computedTotalCentavos) {
    setTotalBasisCentavos(computedTotalCentavos);
    if (totalBasisCentavos !== null) {
      const followed = followWholeBillPayer(
        contributions,
        totalBasisCentavos,
        computedTotalCentavos,
      );
      if (followed !== contributions) {
        setContributions(followed);
        setResetToken((token) => token + 1);
      }
    }
  }

  function handleAmountChange(participantId: string, centavos: number) {
    setHasEdited(true);
    setContributions((current) => ({ ...current, [participantId]: centavos }));
  }

  // "Paid the whole bill": this participant covers the whole bill, so everyone
  // else's contribution resets to zero in local form state — the "one person
  // paid it all" shortcut, distinct from manually entering a partial/split
  // payment per person. Nothing is persisted yet; Continue still owns the
  // actual save.
  function handleFullAmount(participantId: string) {
    setHasEdited(true);
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
    // Continue is disabled while overpaid; this also covers a stale press.
    if (computeOverpaymentCentavos(contributions, computedTotalCentavos) > 0) return;
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
      // This screen stays mounted under Summary, so a later Continue must diff
      // against what is now persisted, not what was first loaded (otherwise
      // clearing a saved overpayment back to 0 would look unchanged).
      setParticipants((current) =>
        current.map((participant) => {
          const saved = updates.find((update) => update.participantId === participant.id);
          return saved
            ? { ...participant, contributedCentavos: saved.contributedCentavos }
            : participant;
        }),
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
      <Screen tabBarHidden>
        <LoadingState />
      </Screen>
    );
  }

  if (state === 'error') {
    return (
      <Screen tabBarHidden>
        <ErrorState
          heading={copy.global.genericErrorHeading}
          body={copy.global.genericErrorBody}
          retryLabel={copy.global.retryAction}
          onRetry={() => {
            setState('loading');
            setReloadKey((key) => key + 1);
          }}
        />
      </Screen>
    );
  }

  const negativeTotalWarning = getNegativeTotalWarning(computedTotalCentavos);
  const overpaymentCentavos = computeOverpaymentCentavos(contributions, computedTotalCentavos);

  return (
    <Screen tabBarHidden scroll padded={false}>
      <View style={styles.body}>
        <ScreenHeader icon="credit-card" heading={copy.payments.heading} body={copy.payments.body}>
          {/* Derived from the current total, so it goes away once fixed. */}
          {negativeTotalWarning ? <WarningNote message={negativeTotalWarning} /> : null}
        </ScreenHeader>

        <View style={styles.listBlock}>
          <SectionHeader
            title={copy.payments.sectionWithCount.replace('{count}', () =>
              String(participants.length),
            )}
            accessibilityLabel={copy.payments.sectionAccessibilityLabel.replace('{count}', () =>
              String(participants.length),
            )}
            caption={copy.payments.sectionCaption}
          />
          <GroupedCard>
            <FlatList
              data={participants}
              keyExtractor={(participant) => `${participant.id}-${resetToken}`}
              extraData={contributions}
              scrollEnabled={false}
              ItemSeparatorComponent={GroupedSeparator}
              renderItem={({ item }) => (
                <PaymentContributionRow
                  name={item.name}
                  valueCentavos={contributions[item.id] ?? 0}
                  onChangeCentavos={(centavos) => handleAmountChange(item.id, centavos)}
                  onFullAmount={() => handleFullAmount(item.id)}
                />
              )}
            />
          </GroupedCard>
        </View>

        {/* Was a sticky BottomActionBar footer — moved inline, per the
            user's own explicit request (2026-08-27) to drop sticky nav
            footers in favor of plain in-flow buttons. Skip stays icon-less
            (skipping isn't a forward wizard action worth an arrow-right-circle, per
            the polish-pass icon-mapping table). */}
        <View style={styles.actionsBlock}>
          {actionError ? <InlineError message={actionError} /> : null}
          {overpaymentCentavos > 0 ? (
            <InlineError
              message={copy.payments.overpaidError.replace('{amount}', () =>
                formatCentavos(overpaymentCentavos),
              )}
            />
          ) : null}
          <AppButton
            variant="text"
            label={copy.payments.skipAction}
            icon={(color) => <Feather name="skip-forward" size={18} color={color} />}
            onPress={handleSkip}
          />
          <AppButton
            large
            label={copy.payments.continueButton}
            onPress={handleContinue}
            loading={saving}
            disabled={saving || overpaymentCentavos > 0}
            trailingArrow
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.lg,
    // No tab-bar clearance: the global BottomTabBar is hidden on /bill/**.
    paddingBottom: spacing.lg,
    // Section-to-section rhythm (header / the contribution rows list /
    // the skip+continue actions) — spacing.lg, the same rhythm
    // receipt-review.tsx uses between its blocks.
    gap: spacing.lg,
  },
  listBlock: {
    gap: spacing.sm,
  },
  actionsBlock: {
    gap: spacing.sm,
  },
});
