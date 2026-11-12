import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, memo, useCallback, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, Switch, View } from 'react-native';

import { AssignmentStatus } from '@/components/bill/AssignmentStatus';
import { ParticipantChip } from '@/components/bill/ParticipantChip';
import { ParticipantPickerSheet } from '@/components/bill/ParticipantPickerSheet';
import { ActionRow } from '@/components/ui/ActionRow';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { ErrorState } from '@/components/ui/ErrorState';
import { GroupedCard, GroupedSeparator, SectionHeader } from '@/components/ui/GroupedSection';
import { InlineError } from '@/components/ui/InlineError';
import { LoadingState } from '@/components/ui/LoadingState';
import { ReceiptImage } from '@/components/ui/ReceiptImage';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { copy } from '@/constants/copy';
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
  applyLineItemAssignmentUpdatesSequentially,
  computeEqualSplitAssignmentUpdates,
} from '@/features/assignments/computeEqualSplitAssignmentUpdates';
import { createSerialQueue } from '@/features/assignments/createSerialQueue';
import { getBulkAssignLabel } from '@/features/assignments/getBulkAssignLabel';
import {
  groupAssignedParticipantIdsByLineItem,
  partitionLineItemsByAssignment,
} from '@/features/assignments/partitionLineItemsByAssignment';
import {
  buildEqualSplitAssignmentRows,
  hasSameIds,
  mergeRefreshedAssignments,
  replaceLineItemAssignments,
  toggleParticipantId,
} from '@/features/assignments/toggleParticipantAssignment';
import { resolvePostAssignmentsRoute } from '@/features/bills/resolvePostAssignmentsRoute';
import { useEnsureBillEditable } from '@/features/bills/useEnsureBillEditable';
import {
  findMeParticipant,
  resolveQuickAddMeName,
} from '@/features/participants/validateParticipantName';
import { authClient } from '@/lib/authClient';
import { nowIso } from '@/lib/date';
import { formatCentavos } from '@/lib/money';
import { tint } from '@/theme/tint';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type LoadState = 'loading' | 'ready' | 'error';

// The picker sheet is only used for the bulk "Assign all unassigned" pass
// when the bill has no "Me" participant — single items are assigned by
// tapping chips directly on their row.
type PickerState = { lineItemIds: string[] } | null;

const EMPTY_IDS: string[] = [];

function idsForLineItem(rows: ItemAssignment[], lineItemId: string): string[] {
  return rows.filter((row) => row.lineItemId === lineItemId).map((row) => row.participantId);
}

async function fetchAssignmentsData(billId: string) {
  // Adjustments are only read here to decide where Continue goes (see
  // resolvePostAssignmentsRoute) — this screen never edits them.
  const [billRow, itemRows, participantRows, assignmentRows, adjustmentRows] = await Promise.all([
    billsRepository.getById(billId),
    lineItemsRepository.listByBillId(billId),
    participantsRepository.listByBillId(billId),
    itemAssignmentsRepository.listByBillId(billId),
    adjustmentsRepository.listByBillId(billId),
  ]);
  return { billRow, itemRows, participantRows, assignmentRows, adjustmentRows };
}

// Not from the spec — the post-MVP "split evenly" toggle's self-healing
// invariant (see PLAN.md and computeEqualSplitAssignmentUpdates.ts): while a
// bill's splitMode is EQUAL, every line item must always be assigned to
// every current participant. Called every time this screen loads or
// refreshes so the invariant is re-checked constantly (idempotent — safe and
// cheap when nothing has drifted), which is what makes a quick-split bill
// "just work" without any special-casing elsewhere: if a participant is
// added or removed on the Participants screen and the user lands back here,
// this brings every item's assignments back in sync automatically.
async function syncEqualSplitAssignments(
  itemRows: LineItem[],
  participantRows: Participant[],
  assignmentRows: ItemAssignment[],
): Promise<boolean> {
  const updates = computeEqualSplitAssignmentUpdates(itemRows, participantRows, assignmentRows);
  if (updates.length === 0) return false;

  // Sequential, never Promise.all — see applyLineItemAssignmentUpdatesSequentially.
  await applyLineItemAssignmentUpdatesSequentially(updates, (lineItemId, participantIds) =>
    itemAssignmentsRepository.setForLineItem(lineItemId, participantIds),
  );
  return true;
}

// Wraps fetchAssignmentsData with the EQUAL-split self-heal above: whenever
// the loaded bill's splitMode is EQUAL, this brings assignments back in sync
// first and re-reads them so the screen never renders a stale, pre-sync
// snapshot.
async function loadAssignmentsData(billId: string) {
  const data = await fetchAssignmentsData(billId);
  if (data.billRow?.splitMode !== 'EQUAL') return data;

  const didSync = await syncEqualSplitAssignments(
    data.itemRows,
    data.participantRows,
    data.assignmentRows,
  );
  if (!didSync) return data;

  const assignmentRows = await itemAssignmentsRepository.listByBillId(billId);
  return { ...data, assignmentRows };
}

type ItemRowProps = {
  lineItemId: string;
  name: string;
  lineTotalCentavos: number;
  // Assigned participant ids joined with ',' — a primitive so memo() only
  // re-renders the row whose assignment actually changed (ids are UUIDs, so
  // they never contain a comma).
  assignedIdsKey: string;
  participants: Participant[];
  onToggle: (lineItemId: string, participantId: string) => void;
};

type AssignmentChipProps = {
  lineItemId: string;
  participantId: string;
  name: string;
  itemName: string;
  selected: boolean;
  onToggle: (lineItemId: string, participantId: string) => void;
};

// Memoized wrapper (RN perf rule) taking only primitives plus the one stable
// onToggle, so ParticipantChip's own memo() isn't defeated by a fresh inline
// onPress/label on every row render — only the tapped chip re-renders.
const AssignmentChip = memo(function AssignmentChip({
  lineItemId,
  participantId,
  name,
  itemName,
  selected,
  onToggle,
}: AssignmentChipProps) {
  const handlePress = useCallback(
    () => onToggle(lineItemId, participantId),
    [lineItemId, participantId, onToggle],
  );
  const accessibilityLabel = useMemo(
    () =>
      copy.assignments.chipAccessibilityLabel
        .replace('{name}', () => name)
        .replace('{item}', () => itemName),
    [name, itemName],
  );
  return (
    <ParticipantChip
      name={name}
      selected={selected}
      onPress={handlePress}
      accessibilityLabel={accessibilityLabel}
    />
  );
});

// Memoized (RN perf rule) — one per line item, every participant shown as a
// tappable chip; a tap toggles that person for this item.
const AssignmentItemRow = memo(function AssignmentItemRow({
  lineItemId,
  name,
  lineTotalCentavos,
  assignedIdsKey,
  participants,
  onToggle,
}: ItemRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const assignedIdSet = useMemo(
    () => new Set(assignedIdsKey === '' ? [] : assignedIdsKey.split(',')),
    [assignedIdsKey],
  );
  const assignedNames = participants
    .filter((participant) => assignedIdSet.has(participant.id))
    .map((participant) => participant.name);

  return (
    <View style={styles.itemRow}>
      <View style={styles.itemMain}>
        <AppText variant="body" numberOfLines={1} style={styles.uniformText}>
          {name}
        </AppText>
        <View style={styles.itemMeta}>
          <AppText variant="caption" color="textSecondary" style={styles.uniformText}>
            {formatCentavos(lineTotalCentavos)}
          </AppText>
          <AssignmentStatus names={assignedNames} />
        </View>
      </View>
      {participants.length > 0 ? (
        <View style={styles.chipWrap}>
          {participants.map((participant) => (
            <AssignmentChip
              key={participant.id}
              lineItemId={lineItemId}
              participantId={participant.id}
              name={participant.name}
              itemName={name}
              selected={assignedIdSet.has(participant.id)}
              onToggle={onToggle}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

export default function AssignmentsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: session } = authClient.useSession();
  const meName = resolveQuickAddMeName(session?.user.name);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { billId } = useLocalSearchParams<{ billId: string }>();
  // Back in edit mode if the bill was re-completed underneath this screen.
  useEnsureBillEditable(billId);

  const [state, setState] = useState<LoadState>('loading');
  const [bill, setBill] = useState<Bill | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [assignmentRows, setAssignmentRows] = useState<ItemAssignment[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [picker, setPicker] = useState<PickerState>(null);
  const [showBlockingError, setShowBlockingError] = useState(false);
  const [showReceiptImage, setShowReceiptImage] = useState(false);
  // One shared error slot for this screen's own write paths (chip taps, bulk
  // assign, the "Split everything equally" toggle) — mirrors
  // participants.tsx's/adjustments.tsx's own actionError.
  const [actionError, setActionError] = useState<string | null>(null);

  // Every write on this screen goes through this one serial queue so chip
  // taps, bulk assigns, split-mode changes and refreshes never overlap (web's
  // setForLineItem is an async delete-then-insert) and land in tap order.
  const [writeQueue] = useState(createSerialQueue);
  // Synchronous mirrors of the state above, so quick successive taps and
  // queued writes always read the latest optimistic values instead of a
  // stale render's closure.
  const billRef = useRef<Bill | null>(null);
  const itemsRef = useRef<LineItem[]>([]);
  const participantsRef = useRef<Participant[]>([]);
  const rowsRef = useRef<ItemAssignment[]>([]);
  // Last participant ids confirmed written to the DB per line item — what a
  // failed write reverts that item back to.
  const persistedIdsRef = useRef<Map<string, string[]>>(new Map());
  // Queued-but-unfinished writes per line item; its keys are the "dirty"
  // items a refresh must not overwrite.
  const pendingWritesRef = useRef<Map<string, number>>(new Map());
  // Queued-but-unfinished splitMode writes; while > 0 a refresh keeps the
  // optimistic splitMode instead of the DB's.
  const pendingSplitModeWritesRef = useRef(0);
  const isContinuingRef = useRef(false);

  const commitBill = useCallback((next: Bill) => {
    billRef.current = next;
    setBill(next);
  }, []);

  const commitRows = useCallback((next: ItemAssignment[]) => {
    rowsRef.current = next;
    setAssignmentRows(next);
  }, []);

  const commitLoadedData = useCallback(
    (
      billRow: Bill,
      itemRows: LineItem[],
      participantRows: Participant[],
      rows: ItemAssignment[],
      adjustmentRows: Adjustment[],
    ) => {
      commitBill(
        pendingSplitModeWritesRef.current > 0 && billRef.current
          ? { ...billRow, splitMode: billRef.current.splitMode }
          : billRow,
      );
      itemsRef.current = itemRows;
      setItems(itemRows);
      participantsRef.current = participantRows;
      setParticipants(participantRows);
      setAdjustments(adjustmentRows);
      persistedIdsRef.current = groupAssignedParticipantIdsByLineItem(rows);
      commitRows(
        mergeRefreshedAssignments(rows, rowsRef.current, new Set(pendingWritesRef.current.keys())),
      );
    },
    [commitBill, commitRows],
  );

  // Queued behind every write already enqueued, so it reads what those
  // writes left in the DB; line items with taps still queued behind it keep
  // their optimistic rows (see mergeRefreshedAssignments).
  const enqueueRefresh = useCallback(
    () =>
      writeQueue.enqueue(async () => {
        try {
          const {
            billRow,
            itemRows,
            participantRows,
            assignmentRows: rows,
            adjustmentRows,
          } = await loadAssignmentsData(billId);
          if (!billRow) {
            setState('error');
            return;
          }
          commitLoadedData(billRow, itemRows, participantRows, rows, adjustmentRows);
          setState('ready');
        } catch {
          // Nothing to show before the first successful load; after it, keep
          // the screen and surface the failure inline instead.
          if (billRef.current) {
            setActionError(copy.global.storageFailure);
          } else {
            setState('error');
          }
        }
      }),
    [billId, commitLoadedData, writeQueue],
  );

  // Runs on every focus, not just mount: the adjustments screen (opened via
  // "Edit fees and discounts") can change the adjustments that decide where
  // Continue goes, so coming back re-reads them instead of keeping a stale
  // label/route. Goes through the write queue like every other refresh, so
  // it never overlaps (or clobbers) chip-tap writes still in flight.
  useFocusEffect(
    useCallback(() => {
      void enqueueRefresh();
    }, [enqueueRefresh]),
  );

  // On failure, a refresh puts the screen back on the DB's real splitMode
  // (and, if that's still EQUAL, re-runs the equal-split sync).
  const persistSplitMode = useCallback(
    (splitMode: Bill['splitMode']) => {
      pendingSplitModeWritesRef.current += 1;
      void writeQueue.enqueue(async () => {
        try {
          await billsRepository.update(billId, { splitMode, updatedAt: nowIso() });
        } catch {
          setActionError(copy.global.storageFailure);
          void enqueueRefresh();
        } finally {
          pendingSplitModeWritesRef.current -= 1;
        }
      });
    },
    [billId, enqueueRefresh, writeQueue],
  );

  // Writes whatever the line item's latest optimistic assignment is when the
  // task actually runs — so a burst of taps on one item collapses into
  // writes of the final state, and later no-op tasks skip the DB entirely.
  const persistLineItem = useCallback(
    (lineItemId: string) => {
      const pending = pendingWritesRef.current;
      pending.set(lineItemId, (pending.get(lineItemId) ?? 0) + 1);
      void writeQueue.enqueue(async () => {
        const desiredIds = idsForLineItem(rowsRef.current, lineItemId);
        const persistedIds = persistedIdsRef.current.get(lineItemId) ?? [];
        try {
          if (!hasSameIds(desiredIds, persistedIds)) {
            await itemAssignmentsRepository.setForLineItem(lineItemId, desiredIds);
            persistedIdsRef.current.set(lineItemId, desiredIds);
          }
        } catch {
          // Reverted inside the task (not in a caller-side .catch) so the
          // next queued task already sees the reverted rows.
          commitRows(replaceLineItemAssignments(rowsRef.current, lineItemId, persistedIds));
          setActionError(copy.global.storageFailure);
        } finally {
          const remaining = (pending.get(lineItemId) ?? 1) - 1;
          if (remaining > 0) {
            pending.set(lineItemId, remaining);
          } else {
            pending.delete(lineItemId);
          }
        }
      });
    },
    [commitRows, writeQueue],
  );

  // Optimistic: the row updates in place right away, then the write queues.
  // Any per-item assignment change (chip tap, bulk assign, picker save) on
  // an equally-split bill means the user wants to itemize: switch splitMode
  // to ITEMIZED first (queued ahead of the assignment write) and apply the
  // change on top of the current all-participants assignment. Existing
  // assignments are kept, same as turning the toggle off.
  const applyAssignment = useCallback(
    (lineItemId: string, participantIds: string[]) => {
      const currentBill = billRef.current;
      if (currentBill?.splitMode === 'EQUAL') {
        commitBill({ ...currentBill, splitMode: 'ITEMIZED' });
        persistSplitMode('ITEMIZED');
      }
      commitRows(replaceLineItemAssignments(rowsRef.current, lineItemId, participantIds));
      persistLineItem(lineItemId);
    },
    [commitBill, commitRows, persistLineItem, persistSplitMode],
  );

  // One stable callback for every chip on every row (RN perf rule).
  const handleToggleParticipant = useCallback(
    (lineItemId: string, participantId: string) => {
      setActionError(null);
      const nextIds = toggleParticipantId(
        idsForLineItem(rowsRef.current, lineItemId),
        participantId,
        participantsRef.current.map((participant) => participant.id),
      );
      applyAssignment(lineItemId, nextIds);
    },
    [applyAssignment],
  );

  function handleToggleSplitEqually(nextEnabled: boolean) {
    setActionError(null);
    const currentBill = billRef.current;
    if (!currentBill) return;
    const splitMode = nextEnabled ? 'EQUAL' : 'ITEMIZED';
    commitBill({ ...currentBill, splitMode });
    if (nextEnabled) {
      // Optimistically show what the queued refresh's equal-split sync will
      // write (every item x every participant), so the chips, unassigned
      // count and an immediate chip tap all work on those rows right away.
      // A tap made before the refresh lands marks its item dirty, so the
      // refresh's merge keeps that tap rather than clobbering it.
      commitRows(
        buildEqualSplitAssignmentRows(
          itemsRef.current.map((item) => item.id),
          participantsRef.current.map((participant) => participant.id),
        ),
      );
    }
    persistSplitMode(splitMode);
    // Turning it ON: the refresh -> loadAssignmentsData sees the now-EQUAL
    // splitMode and runs syncEqualSplitAssignments itself, so every current
    // item gets assigned to every current participant without this handler
    // needing its own duplicate sync logic. Turning it OFF: splitMode goes
    // back to ITEMIZED and the refresh just re-reads whatever assignments
    // already exist, unmodified — turning the toggle off never clears
    // anyone's existing item assignments.
    void enqueueRefresh();
  }

  function handleBulkAssign(unassignedItemIds: string[]) {
    if (unassignedItemIds.length === 0) return;

    // Prefer the user's name; fall back to the legacy 'Me' from older bills.
    const meParticipant = findMeParticipant(participants, meName);

    setActionError(null);
    if (meParticipant) {
      for (const lineItemId of unassignedItemIds) {
        applyAssignment(lineItemId, [meParticipant.id]);
      }
      return;
    }

    setPicker({ lineItemIds: unassignedItemIds });
  }

  function handleSavePicker(selectedParticipantIds: string[]) {
    if (!picker) return;
    const selectedIds = participants
      .map((participant) => participant.id)
      .filter((id) => selectedParticipantIds.includes(id));
    for (const lineItemId of picker.lineItemIds) {
      applyAssignment(lineItemId, selectedIds);
    }
    setPicker(null);
  }

  if (state === 'loading') {
    return (
      <Screen tabBarHidden>
        <LoadingState />
      </Screen>
    );
  }

  if (state === 'error' || !bill) {
    return (
      <Screen tabBarHidden>
        <ErrorState
          heading={copy.global.genericErrorHeading}
          body={copy.global.genericErrorBody}
          retryLabel={copy.global.retryAction}
          onRetry={() => {
            setState('loading');
            void enqueueRefresh();
          }}
        />
      </Screen>
    );
  }

  const assignedIdsByItem = groupAssignedParticipantIdsByLineItem(assignmentRows);
  const { unassignedItems } = partitionLineItemsByAssignment(items, assignmentRows);
  const unassignedCount = unassignedItems.length;
  const isBlocked = unassignedCount > 0;
  // Same participant handleBulkAssign assigns to, so the label names exactly
  // who one tap will assign the rest to.
  const bulkAssignLabel = getBulkAssignLabel(findMeParticipant(participants, meName), meName);

  const itemWord =
    unassignedCount === 1 ? copy.assignments.itemWordSingular : copy.assignments.itemWordPlural;
  const assignmentWord =
    unassignedCount === 1
      ? copy.assignments.assignmentWordSingular
      : copy.assignments.assignmentWordPlural;
  const blockingErrorBody = copy.assignments.blockingErrorBody
    .replace('{count}', String(unassignedCount))
    .replace('{itemWord}', itemWord)
    .replace('{assignmentWord}', assignmentWord);

  // Skips the adjustments screen when there's no unresolved receipt
  // discrepancy — the same rule payments.tsx's own guard enforces, so a
  // skipped bill is never bounced back.
  const nextRoute = resolvePostAssignmentsRoute({
    items,
    adjustments,
    detectedReceiptTotalCentavos: bill.detectedReceiptTotalCentavos,
    discrepancyAcknowledged: bill.discrepancyAcknowledged,
    acknowledgedDiscrepancyCentavos: bill.acknowledgedDiscrepancyCentavos,
  });
  const skipsAdjustments = nextRoute === 'payments';

  async function handleContinue() {
    // Guards against a second press while the drain below is still awaiting.
    if (isContinuingRef.current) return;
    isContinuingRef.current = true;
    try {
      // Let every queued write land first — including taps made while this
      // is awaiting — so the next screen never reads a pre-tap snapshot;
      // then re-check from the latest rows (a failed write may have
      // reverted an item back to unassigned).
      do {
        await writeQueue.whenIdle();
      } while (pendingWritesRef.current.size > 0 || pendingSplitModeWritesRef.current > 0);
      const { unassignedItems: stillUnassigned } = partitionLineItemsByAssignment(
        itemsRef.current,
        rowsRef.current,
      );
      if (stillUnassigned.length > 0) {
        setShowBlockingError(true);
        return;
      }
      setShowBlockingError(false);
      // nextRoute depends only on items, adjustments and the bill's
      // receipt-total fields — none of which a chip tap changes.
      router.push(`/bill/${billId}/${nextRoute}`);
    } finally {
      isContinuingRef.current = false;
    }
  }

  return (
    <Screen tabBarHidden scroll padded={false}>
      <View style={styles.body}>
        <ScreenHeader icon="trello" heading={copy.assignments.heading} body={copy.assignments.body}>
          <AppText variant="caption" color="textSecondary" style={styles.uniformText}>
            {copy.assignments.sharedNote}
          </AppText>
          {actionError ? <InlineError message={actionError} /> : null}
        </ScreenHeader>

        {/* Same tile-row shape as receipt-review.tsx's view-action rows. */}
        <View style={styles.toggleRow}>
          <View
            style={styles.iconTile}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Feather name="divide" size={18} color={colors.primary} />
          </View>
          <AppText variant="subheading" style={[styles.uniformText, styles.toggleLabel]}>
            {copy.assignments.splitEquallyToggleLabel}
          </AppText>
          <Switch
            value={bill.splitMode === 'EQUAL'}
            onValueChange={handleToggleSplitEqually}
            // Off: a mid-grey thumb on a stronger track, so the switch stays
            // visible on the card (a surface-colored thumb vanished into it).
            trackColor={{ false: colors.borderStrong, true: colors.primary }}
            ios_backgroundColor={colors.borderStrong}
            thumbColor={bill.splitMode === 'EQUAL' ? colors.onPrimary : colors.textSecondary}
            accessibilityLabel={copy.assignments.splitEquallyToggleLabel}
          />
        </View>

        {/* One card, every item in receipt order (sortOrder) — rows never
            move or change card while people are being toggled; unassigned
            rows just show their "Not assigned" status in place. */}
        {items.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title={
                unassignedCount > 0
                  ? copy.assignments.itemsSectionWithUnassignedCount.replace('{count}', () =>
                      String(unassignedCount),
                    )
                  : copy.assignments.itemsSectionTitle
              }
              caption={copy.assignments.itemsCaption}
              action={
                unassignedCount > 0 ? (
                  <AppButton
                    variant="text"
                    label={bulkAssignLabel}
                    icon={(color) => <Feather name="users" size={18} color={color} />}
                    onPress={() => handleBulkAssign(unassignedItems.map((item) => item.id))}
                  />
                ) : null
              }
            />
            <GroupedCard>
              {items.map((item, index) => (
                <Fragment key={item.id}>
                  {index > 0 ? <GroupedSeparator /> : null}
                  <AssignmentItemRow
                    lineItemId={item.id}
                    name={item.name}
                    lineTotalCentavos={item.lineTotalCentavos}
                    assignedIdsKey={(assignedIdsByItem.get(item.id) ?? EMPTY_IDS).join(',')}
                    participants={participants}
                    onToggle={handleToggleParticipant}
                  />
                </Fragment>
              ))}
            </GroupedCard>
          </View>
        ) : null}

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

        {/* Was a sticky BottomActionBar footer — moved inline, per the
            user's own explicit request (2026-08-27) to drop sticky nav
            footers in favor of plain in-flow buttons. */}
        <View style={styles.actionsBlock}>
          {showBlockingError && isBlocked ? (
            <View style={styles.blockingError} accessibilityLiveRegion="assertive">
              <Feather
                name="alert-triangle"
                size={20}
                color={colors.danger}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <View style={styles.blockingErrorText}>
                <AppText variant="subheading" color="danger" style={styles.uniformText}>
                  {copy.assignments.blockingErrorHeading}
                </AppText>
                <AppText variant="caption" color="textSecondary" style={styles.uniformText}>
                  {blockingErrorBody}
                </AppText>
              </View>
            </View>
          ) : null}
          <AppButton
            large
            label={
              skipsAdjustments
                ? copy.assignments.continueToPaymentsButton
                : copy.assignments.continueButton
            }
            trailingArrow
            onPress={handleContinue}
          />
          {/* Keeps the skipped adjustments screen reachable. Hidden while
              items are unassigned — its own guard would just send the user
              straight back here. */}
          {skipsAdjustments && !isBlocked ? (
            <AppButton
              variant="secondary"
              label={copy.assignments.editAdjustmentsAction}
              icon={(color) => <Feather name="percent" size={16} color={color} />}
              onPress={() => router.push(`/bill/${billId}/adjustments`)}
            />
          ) : null}
        </View>
      </View>

      <ParticipantPickerSheet
        visible={picker !== null}
        mode="bulk"
        participants={participants}
        initialSelectedIds={EMPTY_IDS}
        onSave={handleSavePicker}
        onCancel={() => setPicker(null)}
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

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    // Every AppText on this screen (and AssignmentItemRow above, which shares
    // this same createStyles) renders at this one uniform size — matches the
    // `caption` variant's own size exactly. `variant="heading"`/`"subheading"`
    // still carry their bold font-weight, which is now the only thing
    // distinguishing a heading from body text.
    uniformText: {
      fontSize: 14,
      lineHeight: 19,
    },
    body: {
      padding: spacing.lg,
      // Section-to-section rhythm (header / toggle row / items section /
      // receipt row / actionsBlock) — spacing.lg, the same
      // rhythm receipt-review.tsx uses between its blocks.
      gap: spacing.lg,
      // No tab-bar clearance: the global BottomTabBar is hidden on /bill/**.
      paddingBottom: spacing.lg,
    },
    actionsBlock: {
      gap: spacing.md,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: touchTarget.preferred,
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.button,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    toggleLabel: {
      flex: 1,
    },
    iconTile: {
      width: 40,
      height: 40,
      borderRadius: radius.tile,
      borderCurve: 'continuous',
      backgroundColor: tint(colors.primary),
      alignItems: 'center',
      justifyContent: 'center',
    },
    section: {
      gap: spacing.sm,
    },
    // Borderless — the section's GroupedCard draws the card and the
    // hairline separators between rows. Stacked: item name/price/status on
    // top, the wrapping row of person chips underneath.
    itemRow: {
      gap: spacing.sm,
      minHeight: touchTarget.preferred,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    itemMain: {
      gap: spacing.xs,
    },
    // Same wrapping chip layout as ParticipantPickerSheet's chip list; each
    // ParticipantChip already meets touchTarget.min on its own.
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    itemMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    // Danger-tinted status card, same shape as receipt-review.tsx's own.
    blockingError: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.button,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: tint(colors.danger),
    },
    blockingErrorText: {
      flex: 1,
      gap: 2,
    },
    receiptImage: {
      flex: 1,
    },
  });
}
