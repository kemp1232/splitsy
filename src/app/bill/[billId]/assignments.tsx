import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Switch, View } from 'react-native';

import { AssignmentStatus } from '@/components/bill/AssignmentStatus';
import { ParticipantPickerSheet } from '@/components/bill/ParticipantPickerSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { TAB_BAR_CONTENT_CLEARANCE } from '@/components/ui/BottomTabBar';
import { Divider } from '@/components/ui/Divider';
import { ErrorState } from '@/components/ui/ErrorState';
import { InlineError } from '@/components/ui/InlineError';
import { LoadingState } from '@/components/ui/LoadingState';
import { ReceiptImage } from '@/components/ui/ReceiptImage';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import type { Bill } from '@/db/repositories/bills.repository';
import { billsRepository } from '@/db/repositories/bills.repository';
import type { ItemAssignment } from '@/db/repositories/itemAssignments.repository';
import { itemAssignmentsRepository } from '@/db/repositories/itemAssignments.repository';
import type { LineItem } from '@/db/repositories/lineItems.repository';
import { lineItemsRepository } from '@/db/repositories/lineItems.repository';
import type { Participant } from '@/db/repositories/participants.repository';
import { participantsRepository } from '@/db/repositories/participants.repository';
import { computeEqualSplitAssignmentUpdates } from '@/features/assignments/computeEqualSplitAssignmentUpdates';
import {
  groupAssignedParticipantIdsByLineItem,
  partitionLineItemsByAssignment,
} from '@/features/assignments/partitionLineItemsByAssignment';
import {
  normalizeParticipantName,
  QUICK_ADD_ME_NAME,
} from '@/features/participants/validateParticipantName';
import { nowIso } from '@/lib/date';
import { formatCentavos } from '@/lib/money';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type LoadState = 'loading' | 'ready' | 'error';

type PickerState =
  | { mode: 'single'; lineItem: LineItem; initialSelectedIds: string[] }
  | { mode: 'bulk'; lineItemIds: string[]; initialSelectedIds: string[] }
  | null;

async function fetchAssignmentsData(billId: string) {
  const [billRow, itemRows, participantRows, assignmentRows] = await Promise.all([
    billsRepository.getById(billId),
    lineItemsRepository.listByBillId(billId),
    participantsRepository.listByBillId(billId),
    itemAssignmentsRepository.listByBillId(billId),
  ]);
  return { billRow, itemRows, participantRows, assignmentRows };
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

  await Promise.all(
    updates.map((update) =>
      itemAssignmentsRepository.setForLineItem(update.lineItemId, update.participantIds),
    ),
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
  item: LineItem;
  assignedNames: string[];
  onAssign: () => void;
};

function AssignmentItemRow({ item, assignedNames, onAssign }: ItemRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemMain}>
        <AppText variant="body" numberOfLines={1} style={styles.uniformText}>
          {item.name}
        </AppText>
        <AppText variant="caption" color="textSecondary" style={styles.uniformText}>
          {formatCentavos(item.lineTotalCentavos)}
        </AppText>
        <AssignmentStatus names={assignedNames} />
      </View>
      <AppButton variant="secondary" label={copy.assignments.assignAction} onPress={onAssign} />
    </View>
  );
}

export default function AssignmentsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { billId } = useLocalSearchParams<{ billId: string }>();

  const [state, setState] = useState<LoadState>('loading');
  const [bill, setBill] = useState<Bill | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [assignmentRows, setAssignmentRows] = useState<ItemAssignment[]>([]);
  const [picker, setPicker] = useState<PickerState>(null);
  const [showBlockingError, setShowBlockingError] = useState(false);
  const [showReceiptImage, setShowReceiptImage] = useState(false);
  // One shared error slot for this screen's own write path (the "Split
  // everything equally" toggle) — mirrors participants.tsx's/adjustments.tsx's
  // own actionError.
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const {
          billRow,
          itemRows,
          participantRows,
          assignmentRows: rows,
        } = await loadAssignmentsData(billId);
        if (!billRow) {
          setState('error');
          return;
        }
        setBill(billRow);
        setItems(itemRows);
        setParticipants(participantRows);
        setAssignmentRows(rows);
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [billId]);

  async function refreshAssignments() {
    const {
      billRow,
      itemRows,
      participantRows,
      assignmentRows: rows,
    } = await loadAssignmentsData(billId);
    if (!billRow) {
      setState('error');
      return;
    }
    setBill(billRow);
    setItems(itemRows);
    setParticipants(participantRows);
    setAssignmentRows(rows);
  }

  async function handleToggleSplitEqually(nextEnabled: boolean) {
    setActionError(null);
    try {
      await billsRepository.update(billId, {
        splitMode: nextEnabled ? 'EQUAL' : 'ITEMIZED',
        updatedAt: nowIso(),
      });
      // Turning it ON: refreshAssignments -> loadAssignmentsData sees the
      // now-EQUAL splitMode and runs syncEqualSplitAssignments itself, so
      // every current item gets assigned to every current participant
      // without this handler needing its own duplicate sync logic. Turning
      // it OFF: splitMode goes back to ITEMIZED and refreshAssignments just
      // re-reads whatever assignments already exist, unmodified — turning
      // the toggle off never clears anyone's existing item assignments.
      await refreshAssignments();
    } catch {
      setActionError(copy.global.storageFailure);
    }
  }

  async function handleOpenItemPicker(item: LineItem) {
    const rows = await itemAssignmentsRepository.listByLineItemId(item.id);
    setPicker({
      mode: 'single',
      lineItem: item,
      initialSelectedIds: rows.map((row) => row.participantId),
    });
  }

  async function handleBulkAssign(unassignedItemIds: string[]) {
    if (unassignedItemIds.length === 0) return;

    const meParticipant = participants.find(
      (participant) =>
        normalizeParticipantName(participant.name) === normalizeParticipantName(QUICK_ADD_ME_NAME),
    );

    if (meParticipant) {
      await Promise.all(
        unassignedItemIds.map((lineItemId) =>
          itemAssignmentsRepository.setForLineItem(lineItemId, [meParticipant.id]),
        ),
      );
      await refreshAssignments();
      return;
    }

    setPicker({ mode: 'bulk', lineItemIds: unassignedItemIds, initialSelectedIds: [] });
  }

  async function handleSavePicker(selectedParticipantIds: string[]) {
    if (!picker) return;
    if (picker.mode === 'single') {
      await itemAssignmentsRepository.setForLineItem(picker.lineItem.id, selectedParticipantIds);
    } else {
      await Promise.all(
        picker.lineItemIds.map((lineItemId) =>
          itemAssignmentsRepository.setForLineItem(lineItemId, selectedParticipantIds),
        ),
      );
    }
    setPicker(null);
    await refreshAssignments();
  }

  if (state === 'loading') {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (state === 'error' || !bill) {
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

  const assignedIdsByItem = groupAssignedParticipantIdsByLineItem(assignmentRows);
  const { unassignedItems, assignedItems } = partitionLineItemsByAssignment(items, assignmentRows);
  const unassignedCount = unassignedItems.length;
  const isBlocked = unassignedCount > 0;

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

  function handleContinue() {
    if (isBlocked) {
      setShowBlockingError(true);
      return;
    }
    setShowBlockingError(false);
    router.push(`/bill/${billId}/adjustments`);
  }

  function assignedNamesFor(item: LineItem): string[] {
    const assignedIds = assignedIdsByItem.get(item.id) ?? [];
    return participants
      .filter((participant) => assignedIds.includes(participant.id))
      .map((participant) => participant.name);
  }

  return (
    <Screen scroll padded={false}>
      <View style={styles.body}>
        <View style={styles.headerBlock}>
          {/* Full-size heading (no uniformText override) + leading icon —
              matches receipt-review.tsx's/participants.tsx's own header
              treatment, so every step in the draft wizard reads the same. */}
          <View style={styles.headingRow}>
            <Feather name="trello" size={24} color={colors.primary} />
            <AppText variant="heading">{copy.assignments.heading}</AppText>
          </View>
          <AppText variant="body" color="textSecondary" style={styles.uniformText}>
            {copy.assignments.body}
          </AppText>
          <AppText variant="caption" color="textSecondary" style={styles.uniformText}>
            {copy.assignments.sharedNote}
          </AppText>

          {actionError ? <InlineError message={actionError} /> : null}
        </View>

        <View style={styles.toggleRow}>
          <AppText variant="body" style={[styles.uniformText, styles.toggleLabel]}>
            {copy.assignments.splitEquallyToggleLabel}
          </AppText>
          <Switch
            value={bill.splitMode === 'EQUAL'}
            onValueChange={handleToggleSplitEqually}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
            accessibilityLabel={copy.assignments.splitEquallyToggleLabel}
          />
        </View>

        <Divider />

        {unassignedItems.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppText variant="subheading" style={styles.uniformText}>
                {copy.assignments.unassignedSection}
              </AppText>
              <AppButton
                variant="text"
                label={copy.assignments.bulkAssignAction}
                icon={(color) => <Feather name="users" size={18} color={color} />}
                onPress={() => handleBulkAssign(unassignedItems.map((item) => item.id))}
              />
            </View>
            {unassignedItems.map((item) => (
              <AssignmentItemRow
                key={item.id}
                item={item}
                assignedNames={assignedNamesFor(item)}
                onAssign={() => handleOpenItemPicker(item)}
              />
            ))}
          </View>
        ) : null}

        {assignedItems.length > 0 ? (
          <View style={styles.section}>
            <AppText variant="subheading" style={styles.uniformText}>
              {copy.assignments.assignedSection}
            </AppText>
            {assignedItems.map((item) => (
              <AssignmentItemRow
                key={item.id}
                item={item}
                assignedNames={assignedNamesFor(item)}
                onAssign={() => handleOpenItemPicker(item)}
              />
            ))}
          </View>
        ) : null}

        {/* Was a sticky BottomActionBar footer — moved inline, per the
            user's own explicit request (2026-08-27) to drop sticky nav
            footers in favor of plain in-flow buttons. */}
        <View style={styles.actionsBlock}>
          {showBlockingError && isBlocked ? (
            <View style={styles.blockingError} accessibilityLiveRegion="assertive">
              <AppText variant="subheading" color="danger" style={styles.uniformText}>
                {copy.assignments.blockingErrorHeading}
              </AppText>
              <AppText variant="body" color="textSecondary" style={styles.uniformText}>
                {blockingErrorBody}
              </AppText>
            </View>
          ) : null}
          {/* Quick access back to the original receipt image without
              backtracking to receipt-review.tsx — same modal shape that
              screen already uses for its own "Receipt" button. */}
          {bill.receiptImageUri ? (
            <AppButton
              variant="secondary"
              label={copy.receiptReview.receiptAction}
              icon={(color) => <Feather name="image" size={18} color={color} />}
              onPress={() => setShowReceiptImage(true)}
            />
          ) : null}
          <AppButton
            label={copy.assignments.continueButton}
            icon={(color) => <Feather name="arrow-right-circle" size={18} color={color} />}
            iconPosition="trailing"
            onPress={handleContinue}
          />
        </View>
      </View>

      <ParticipantPickerSheet
        visible={picker !== null}
        mode={picker?.mode ?? 'single'}
        participants={participants}
        initialSelectedIds={picker?.initialSelectedIds ?? []}
        onSave={handleSavePicker}
        onCancel={() => setPicker(null)}
      />

      {/* Mirrors receipt-review.tsx's own receipt-image modal. */}
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
      // Section-to-section rhythm (headerBlock / toggle row / unassigned
      // section / assigned section / actionsBlock): spacing.xl between each
      // distinct block, spacing.md/sm within one — see each block's own
      // style below.
      gap: spacing.xl,
      // The Continue button used to sit in a sticky footer, which Screen.tsx
      // pads above the global nav bar automatically — now that it's plain
      // in-flow content, this screen reserves that space itself.
      paddingBottom: spacing.lg + TAB_BAR_CONTENT_CLEARANCE,
    },
    headerBlock: {
      gap: spacing.sm,
    },
    headingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    actionsBlock: {
      gap: spacing.md,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: touchTarget.preferred,
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    toggleLabel: {
      flex: 1,
    },
    section: {
      gap: spacing.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    itemMain: {
      flex: 1,
      gap: 2,
    },
    blockingError: {
      gap: spacing.xs / 2,
    },
    receiptImage: {
      flex: 1,
    },
  });
}
