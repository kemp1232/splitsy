import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItem,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { AdjustmentEditorSheet } from '@/components/bill/AdjustmentEditorSheet';
import { AdjustmentRow } from '@/components/bill/AdjustmentRow';
import { LineItemEditorSheet, type LineItemDraft } from '@/components/bill/LineItemEditorSheet';
import { LineItemRow } from '@/components/bill/LineItemRow';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GroupedCard, GroupedSeparator } from '@/components/ui/GroupedSection';
import { IconButton } from '@/components/ui/IconButton';
import { InlineError } from '@/components/ui/InlineError';
import { LoadingState } from '@/components/ui/LoadingState';
import { ReceiptImage } from '@/components/ui/ReceiptImage';
import { Screen } from '@/components/ui/Screen';
import { SectionCard } from '@/components/ui/SectionCard';
import { copy } from '@/constants/copy';
import type { Bill } from '@/db/repositories/bills.repository';
import { billsRepository } from '@/db/repositories/bills.repository';
import type { Adjustment } from '@/db/repositories/adjustments.repository';
import { adjustmentsRepository } from '@/db/repositories/adjustments.repository';
import type { LineItem } from '@/db/repositories/lineItems.repository';
import { lineItemsRepository } from '@/db/repositories/lineItems.repository';
import type { Participant } from '@/db/repositories/participants.repository';
import { participantsRepository } from '@/db/repositories/participants.repository';
import { useAdjustmentEditor } from '@/features/adjustments/useAdjustmentEditor';
import { deleteBill } from '@/features/bills/bill.service';
import { createGalleryBill, pickGalleryImageUri } from '@/features/bills/galleryBill';
import { buildOcrStatus, type OcrStatusTone } from '@/features/receipt-review/buildOcrStatus';
import {
  buildMismatchMessage,
  buildTotalHeadline,
  getTotalsMatch,
} from '@/features/receipt-review/buildTotalsSummary';
import { nowIso } from '@/lib/date';
import { createId } from '@/lib/ids';
import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type LoadState = 'loading' | 'ready' | 'error';

// Matches spec section 9.1's documented receiptDate shape exactly.
const RECEIPT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_ICON: Record<OcrStatusTone, keyof typeof Feather.glyphMap> = {
  success: 'check-circle',
  warning: 'alert-triangle',
  neutral: 'smartphone',
};

async function fetchReviewData(billId: string) {
  // Participants are only needed by AdjustmentEditorSheet's custom-amount
  // option — usually none yet in the forward flow, since this screen comes
  // before the participants step.
  const [billRow, itemRows, adjustmentRows, participantRows] = await Promise.all([
    billsRepository.getById(billId),
    lineItemsRepository.listByBillId(billId),
    adjustmentsRepository.listByBillId(billId),
    participantsRepository.listByBillId(billId),
  ]);
  return { billRow, itemRows, adjustmentRows, participantRows };
}

function keyExtractor(item: LineItem) {
  return item.id;
}

function ItemSeparator() {
  return <View style={separatorStyles.gap} />;
}

const separatorStyles = StyleSheet.create({
  gap: { height: spacing.sm },
});

export default function ReceiptReviewScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { billId, ocrSource, fallbackReason, truncated } = useLocalSearchParams<{
    billId: string;
    ocrSource?: 'backend' | 'on-device';
    fallbackReason?: 'rate_limited' | 'token_limit_truncated';
    // '1' when the backend scan was cut off by its token cap (processing.tsx).
    truncated?: string;
  }>();
  const isTruncated = truncated === '1';

  const [state, setState] = useState<LoadState>('loading');
  const [bill, setBill] = useState<Bill | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [merchantName, setMerchantName] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [editingItem, setEditingItem] = useState<LineItem | 'new' | null>(null);
  // The item awaiting delete confirmation — set from either a row's trash
  // icon or the editor sheet's own Delete button. Nothing is removed until
  // the ConfirmationDialog's confirm action runs.
  const [pendingDelete, setPendingDelete] = useState<LineItem | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [showReceiptImage, setShowReceiptImage] = useState(false);
  // Totals card breakdown (subtotals/receipt total) — collapsed by default.
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  // One shared error slot for this screen's write paths (merchant/date
  // autosave, item save/delete) — mirrors participants.tsx's own
  // actionError, and is distinct from dateError above, which is a field
  // validation message, not a storage failure.
  const [actionError, setActionError] = useState<string | null>(null);
  // "Choose another" (gallery bills only): the confirm dialog's visibility,
  // and a busy flag held from confirm until this screen is replaced (or the
  // attempt is abandoned) so a second tap can't start a second pick.
  const [confirmChooseAnother, setConfirmChooseAnother] = useState(false);
  const [choosingAnother, setChoosingAnother] = useState(false);
  // Set on confirm, consumed by startChooseAnother — lets the dialog's iOS
  // onDismiss (which also fires after Cancel) tell a confirm from a cancel.
  const chooseAnotherPending = useRef(false);
  // Add/edit/delete an adjustment (shared with the adjustments screen), so
  // the gap between the items subtotal and the receipt total can be
  // explained right here.
  const adjustmentEditor = useAdjustmentEditor({
    billId,
    adjustmentCount: adjustments.length,
    refresh: refreshAdjustments,
    setActionError,
  });

  useEffect(() => {
    (async () => {
      try {
        const { billRow, itemRows, adjustmentRows, participantRows } =
          await fetchReviewData(billId);
        if (!billRow) {
          setState('error');
          return;
        }
        setBill(billRow);
        setItems(itemRows);
        setAdjustments(adjustmentRows);
        setParticipants(participantRows);
        setMerchantName(billRow.merchantName ?? '');
        setReceiptDate(billRow.receiptDate ?? '');
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [billId]);

  // Stable per-row callbacks (they take the item rather than closing over
  // it) so LineItemRow's React.memo can skip unchanged rows.
  const openEditor = useCallback((item: LineItem) => setEditingItem(item), []);
  const requestDelete = useCallback((item: LineItem) => setPendingDelete(item), []);
  const renderItem = useCallback<ListRenderItem<LineItem>>(
    ({ item }) => <LineItemRow item={item} onEdit={openEditor} onDelete={requestDelete} />,
    [openEditor, requestDelete],
  );

  const scrollContentStyle = useMemo(
    () => [
      styles.body,
      // No tab-bar clearance: the global BottomTabBar is hidden on every
      // /bill/** screen, and Screen adds the bottom safe-area edge itself.
      { paddingBottom: spacing.lg },
    ],
    [styles.body],
  );

  // Straight back to Home rather than router.back(): after a scan the stack
  // is Home → capture → review (preview/processing replace themselves), so a
  // plain back would land on the camera. dismissTo pops to Home when it's in
  // the stack and otherwise replaces this screen with it.
  function handleBack() {
    router.dismissTo('/');
  }

  async function refreshItems() {
    const itemRows = await lineItemsRepository.listByBillId(billId);
    setItems(itemRows);
  }

  // Errors propagate to useAdjustmentEditor's own catch (storage failure).
  async function refreshAdjustments() {
    const adjustmentRows = await adjustmentsRepository.listByBillId(billId);
    setAdjustments(adjustmentRows);
  }

  async function handleMerchantBlur() {
    setActionError(null);
    try {
      await billsRepository.update(billId, {
        merchantName: merchantName.trim() || null,
        updatedAt: nowIso(),
      });
    } catch {
      setActionError(copy.global.storageFailure);
    }
  }

  async function handleDateBlur() {
    const trimmed = receiptDate.trim();
    if (trimmed !== '' && !RECEIPT_DATE_PATTERN.test(trimmed)) {
      setDateError(copy.receiptReview.invalidDateError);
      return;
    }
    setDateError(null);
    setActionError(null);
    try {
      await billsRepository.update(billId, {
        receiptDate: trimmed || null,
        updatedAt: nowIso(),
      });
    } catch {
      setActionError(copy.global.storageFailure);
    }
  }

  async function handleSaveItem(draft: LineItemDraft) {
    setActionError(null);
    try {
      const timestamp = nowIso();
      if (editingItem === 'new') {
        await lineItemsRepository.create({
          id: createId(),
          billId,
          sortOrder: items.length,
          name: draft.name,
          quantity: draft.quantity,
          lineTotalCentavos: draft.lineTotalCentavos,
          source: 'MANUAL',
          confidence: null,
          rawText: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      } else if (editingItem) {
        await lineItemsRepository.update(editingItem.id, {
          name: draft.name,
          quantity: draft.quantity,
          lineTotalCentavos: draft.lineTotalCentavos,
          updatedAt: timestamp,
        });
      }
      setEditingItem(null);
      await refreshItems();
    } catch {
      setEditingItem(null);
      setActionError(copy.global.storageFailure);
    }
  }

  // Only ever reached through the ConfirmationDialog's confirm action (see
  // handleConfirmDelete). Takes the target explicitly so it doesn't depend on
  // which item (if any) the editor sheet currently has open.
  async function handleDeleteItem(target: LineItem) {
    setActionError(null);
    try {
      await lineItemsRepository.remove(target.id);
      setEditingItem(null);
      await refreshItems();
    } catch {
      setEditingItem(null);
      setActionError(copy.global.storageFailure);
    }
  }

  function handleConfirmDelete() {
    const target = pendingDelete;
    // Cleared first so the dialog hides immediately and a double tap can't
    // fire a second delete.
    setPendingDelete(null);
    if (target) {
      void handleDeleteItem(target);
    }
  }

  // Confirm only closes the dialog and marks the pick as pending; the picker
  // itself is opened by startChooseAnother. On iOS that has to wait for the
  // dialog's Modal to finish dismissing (its onDismiss): iOS won't present
  // the picker while another view controller is still dismissing, so
  // launching it in the same tick can silently never show it. onDismiss
  // only fires on iOS (RN's Modal implements it there only), and Android
  // and web have no such conflict, so they start straight away.
  function handleConfirmChooseAnother() {
    setConfirmChooseAnother(false);
    if (choosingAnother) return;
    chooseAnotherPending.current = true;
    setChoosingAnother(true);
    if (Platform.OS !== 'ios') void startChooseAnother();
  }

  function handleChooseAnotherDialogDismiss() {
    if (chooseAnotherPending.current) void startChooseAnother();
  }

  // Replaces this draft with a brand-new one built from a freshly picked
  // photo, rather than re-running OCR on this bill: saveParsedReceiptDraft
  // appends line items, so re-scanning in place would stack the new
  // receipt's items on top of the old ones. Order matters — the new bill is
  // created before the old one is deleted, so a cancelled pick or a failed
  // pick/copy/create leaves this bill exactly as it was.
  async function startChooseAnother() {
    chooseAnotherPending.current = false;
    if (!bill) {
      setChoosingAnother(false);
      return;
    }
    setActionError(null);

    let newBill: Bill;
    try {
      // Permission-denied / unsupported-image Alerts are raised inside
      // pickGalleryImageUri itself; null means there's nothing to do.
      const imageUri = await pickGalleryImageUri();
      if (!imageUri) {
        setChoosingAnother(false);
        return;
      }
      // Same trip as the bill being replaced, if it belongs to one.
      newBill = await createGalleryBill(imageUri, bill.tripId);
    } catch {
      // The screen's shared inline error slot, like its other write paths
      // (an Alert would show nothing on web), with the same message
      // preview.tsx's "Use this photo" uses for this copy-then-create step.
      setActionError(copy.global.imageCopyFailure);
      setChoosingAnother(false);
      return;
    }

    try {
      // Awaited: native deleteBill is synchronous, the web one is async.
      await deleteBill(bill);
    } catch (error) {
      // The new bill already exists, so carry on to it regardless. The old
      // draft stays in the bill list, where it can still be deleted by hand.
      if (__DEV__) console.error('[ReceiptReviewScreen] deleteBill failed:', error);
    }
    router.replace({ pathname: '/bill/processing', params: { billId: newBill.id } });
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
          onRetry={() => setState('loading')}
        />
      </Screen>
    );
  }

  const itemSubtotalCentavos = items.reduce((sum, item) => sum + item.lineTotalCentavos, 0);
  const adjustmentTotalCentavos = adjustments.reduce((sum, a) => sum + a.amountCentavos, 0);
  const computedTotalCentavos = itemSubtotalCentavos + adjustmentTotalCentavos;
  const detectedTotalCentavos = bill.detectedReceiptTotalCentavos;
  const totalsMatch = getTotalsMatch(computedTotalCentavos, detectedTotalCentavos);

  const ocrStatus = buildOcrStatus(ocrSource, fallbackReason, isTruncated);
  // Only for a gallery draft that arrived here straight from processing.
  // Status alone can't tell a fresh scan from a reopened bill: "Edit bill"
  // flips a COMPLETED bill back to DRAFT before opening this screen. But
  // ocrSource is a one-time param that only processing.tsx's success path
  // sets — every other way in (summary, adjustments, Edit bill, Home) pushes
  // this screen without it, so reopened and completed bills never get the
  // option. Known, accepted gap: going on to participants and then back
  // returns to this same screen instance, params intact, so the option is
  // still offered after people may have been added — the confirm text
  // warns that people are cleared too.
  const canChooseAnother =
    bill.entryMethod === 'GALLERY' && bill.status === 'DRAFT' && ocrSource != null;
  const totalHeadline = buildTotalHeadline(
    computedTotalCentavos,
    totalsMatch.status,
    formatCentavos,
  );
  const totalHeadlineSpeech = buildTotalHeadline(
    computedTotalCentavos,
    totalsMatch.status,
    formatCentavosForSpeech,
    true,
  );
  const mismatchMessage = buildMismatchMessage(totalsMatch.differenceCentavos, formatCentavos);
  const mismatchSpeech = buildMismatchMessage(
    totalsMatch.differenceCentavos,
    formatCentavosForSpeech,
  );
  const textCaption =
    ocrSource === 'backend' && !fallbackReason
      ? copy.receiptReview.viewTextCaptionAi
      : copy.receiptReview.viewTextCaptionDevice;

  return (
    <Screen tabBarHidden scroll={false} padded={false}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={scrollContentStyle}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerBlock}>
          <View style={styles.headingRow}>
            <IconButton
              accessibilityLabel={copy.receiptReview.backAccessibilityLabel}
              onPress={handleBack}
              icon={<Feather name="arrow-left" size={22} color={colors.textPrimary} />}
            />
            <Feather name="file-text" size={24} color={colors.primary} />
            <AppText variant="heading" style={styles.headingText} accessibilityRole="header">
              {copy.receiptReview.heading}
            </AppText>
          </View>
          <AppText variant="body" color="textSecondary" style={styles.uniformText}>
            {copy.receiptReview.body}
          </AppText>

          {/* Shared by every write path below (merchant/date autosave, item
              and adjustment save/delete) — mirrors participants.tsx's own
              actionError. */}
          {actionError ? <InlineError message={actionError} /> : null}
        </View>

        {/* Non-interactive status card — derived only from processing.tsx's
            one-time route params, so a reopened draft shows nothing. */}
        {ocrStatus ? (
          <View
            accessible
            accessibilityLabel={[
              ocrStatus.title,
              ocrStatus.body,
              ...ocrStatus.notes.map((n) => n.text),
            ]
              .filter(Boolean)
              .join('. ')}
            style={[styles.statusCard, styles[ocrStatus.tone]]}
          >
            <Feather
              name={STATUS_ICON[ocrStatus.tone]}
              size={20}
              color={ocrStatus.tone === 'neutral' ? colors.textSecondary : colors[ocrStatus.tone]}
            />
            <View style={styles.statusText}>
              <AppText variant="subheading" style={styles.uniformText}>
                {ocrStatus.title}
              </AppText>
              {ocrStatus.body ? (
                <AppText variant="caption" color="textSecondary" style={styles.uniformText}>
                  {ocrStatus.body}
                </AppText>
              ) : null}
              {ocrStatus.notes.map((note) => (
                <AppText
                  key={note.text}
                  variant="caption"
                  color={note.tone}
                  style={styles.uniformText}
                >
                  {note.text}
                </AppText>
              ))}
            </View>
          </View>
        ) : null}

        <SectionCard>
          <AppTextInput
            label={copy.receiptReview.merchantLabel}
            placeholder={copy.receiptReview.merchantPlaceholder}
            value={merchantName}
            onChangeText={setMerchantName}
            onEndEditing={handleMerchantBlur}
            leadingIcon={(color) => <Feather name="shopping-bag" size={18} color={color} />}
          />
          <AppTextInput
            label={copy.receiptReview.dateLabel}
            placeholder={copy.receiptReview.datePlaceholder}
            value={receiptDate}
            onChangeText={(value) => {
              setReceiptDate(value);
              setDateError(null);
            }}
            onEndEditing={handleDateBlur}
            error={dateError ?? undefined}
            leadingIcon={(color) => <Feather name="calendar" size={18} color={color} />}
          />
        </SectionCard>

        <View style={styles.itemsBlock}>
          <View style={styles.itemsHeaderRow}>
            <View style={styles.itemsHeaderText}>
              <AppText variant="subheading" accessibilityRole="header">
                {copy.receiptReview.itemsSectionWithCount.replace('{count}', () =>
                  String(items.length),
                )}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                {copy.receiptReview.itemsCaption}
              </AppText>
            </View>
            {/* Hidden with no items — EmptyState below carries its own Add
                item action then, so the screen never shows two. */}
            {items.length > 0 ? (
              <AppButton
                variant="secondary"
                label={copy.receiptReview.addItem}
                icon={(color) => <Feather name="plus" size={16} color={color} />}
                onPress={() => setEditingItem('new')}
              />
            ) : null}
          </View>

          {items.length === 0 ? (
            <EmptyState
              heading={copy.receiptReview.noItemsHeading}
              body={copy.receiptReview.noItemsBody}
              actionLabel={copy.receiptReview.addItem}
              onAction={() => setEditingItem('new')}
            />
          ) : (
            <FlatList
              data={items}
              keyExtractor={keyExtractor}
              scrollEnabled={false}
              ItemSeparatorComponent={ItemSeparator}
              renderItem={renderItem}
            />
          )}
        </View>

        {/* Two independent stacked rows (not tabs), each hidden when its
            data is missing. */}
        {bill.receiptImageUri || bill.rawOcrText ? (
          <View style={styles.viewActions}>
            {bill.receiptImageUri ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${copy.receiptReview.viewReceiptTitle}, ${copy.receiptReview.viewReceiptCaption}`}
                onPress={() => setShowReceiptImage(true)}
                style={({ pressed }) => [styles.viewActionRow, pressed && styles.pressed]}
              >
                <View style={styles.viewActionIcon}>
                  <Feather name="image" size={18} color={colors.primary} />
                </View>
                <View style={styles.viewActionText}>
                  <AppText variant="subheading" style={styles.uniformText}>
                    {copy.receiptReview.viewReceiptTitle}
                  </AppText>
                  <AppText variant="caption" color="textSecondary">
                    {copy.receiptReview.viewReceiptCaption}
                  </AppText>
                </View>
                <Feather name="chevron-right" size={20} color={colors.textSecondary} />
              </Pressable>
            ) : null}
            {/* Sits with "View receipt photo" since it acts on that photo.
                A gallery bill always has receiptImageUri, so this block is
                always rendered when canChooseAnother is true. */}
            {canChooseAnother ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${copy.preview.chooseAnotherAction}, ${copy.receiptReview.chooseAnotherCaption}`}
                accessibilityState={{ busy: choosingAnother, disabled: choosingAnother }}
                disabled={choosingAnother}
                onPress={() => setConfirmChooseAnother(true)}
                style={({ pressed }) => [styles.viewActionRow, pressed && styles.pressed]}
              >
                <View style={styles.viewActionIcon}>
                  <Feather name="refresh-cw" size={18} color={colors.primary} />
                </View>
                <View style={styles.viewActionText}>
                  <AppText variant="subheading" style={styles.uniformText}>
                    {copy.preview.chooseAnotherAction}
                  </AppText>
                  <AppText variant="caption" color="textSecondary">
                    {copy.receiptReview.chooseAnotherCaption}
                  </AppText>
                </View>
                {choosingAnother ? (
                  <ActivityIndicator color={colors.textSecondary} />
                ) : (
                  <Feather name="chevron-right" size={20} color={colors.textSecondary} />
                )}
              </Pressable>
            ) : null}
            {bill.rawOcrText ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${copy.receiptReview.viewTextTitle}, ${textCaption}`}
                onPress={() => setShowRawText(true)}
                style={({ pressed }) => [styles.viewActionRow, pressed && styles.pressed]}
              >
                <View style={styles.viewActionIcon}>
                  <Feather name="file-text" size={18} color={colors.primary} />
                </View>
                <View style={styles.viewActionText}>
                  <AppText variant="subheading" style={styles.uniformText}>
                    {copy.receiptReview.viewTextTitle}
                  </AppText>
                  <AppText variant="caption" color="textSecondary">
                    {textCaption}
                  </AppText>
                </View>
                <Feather name="chevron-right" size={20} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Fees, tax, and discounts — sits directly above the totals so the
            gap between the items subtotal and the receipt total is visible.
            A plain map (a handful of rows) rather than a second list. With
            none yet, only a compact add action, no empty state. */}
        {adjustments.length > 0 ? (
          <View style={styles.itemsBlock}>
            <View style={styles.itemsHeaderRow}>
              <View style={styles.itemsHeaderText}>
                <AppText variant="subheading" accessibilityRole="header">
                  {copy.adjustments.sectionWithCount.replace('{count}', () =>
                    String(adjustments.length),
                  )}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  {copy.adjustments.sectionCaption}
                </AppText>
              </View>
              <AppButton
                variant="secondary"
                label={copy.adjustments.addAction}
                icon={(color) => <Feather name="plus" size={16} color={color} />}
                onPress={adjustmentEditor.openNewEditor}
              />
            </View>
            <GroupedCard>
              {adjustments.map((adjustment, index) => (
                <Fragment key={adjustment.id}>
                  {index > 0 ? <GroupedSeparator /> : null}
                  <AdjustmentRow adjustment={adjustment} onPress={adjustmentEditor.openEditor} />
                </Fragment>
              ))}
            </GroupedCard>
          </View>
        ) : (
          <AppButton
            variant="text"
            label={copy.receiptReview.addAdjustmentAction}
            icon={(color) => <Feather name="plus" size={16} color={color} />}
            onPress={adjustmentEditor.openNewEditor}
          />
        )}

        <SectionCard>
          {/* Collapsed by default to one line ("Total ₱X ✓ matches receipt");
              the subtotal/receipt-total breakdown sits behind this toggle. */}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showBreakdown }}
            accessibilityLabel={totalHeadlineSpeech}
            accessibilityHint={copy.receiptReview.breakdownToggleHint}
            onPress={() => setShowBreakdown((current) => !current)}
            style={({ pressed }) => [styles.totalToggle, pressed && styles.pressed]}
          >
            <AppText variant="subheading" style={styles.totalHeadline}>
              {totalHeadline}
            </AppText>
            <Feather
              name={showBreakdown ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>

          {showBreakdown ? (
            <View style={styles.breakdown}>
              {bill.detectedSubtotalCentavos != null ? (
                <View
                  style={styles.totalRow}
                  accessible
                  accessibilityLabel={`${copy.receiptReview.detectedSubtotalLabel}, ${formatCentavosForSpeech(bill.detectedSubtotalCentavos)}`}
                >
                  <AppText color="textSecondary" style={styles.uniformText}>
                    {copy.receiptReview.detectedSubtotalLabel}
                  </AppText>
                  <AppText style={styles.uniformText}>
                    {formatCentavos(bill.detectedSubtotalCentavos)}
                  </AppText>
                </View>
              ) : null}
              <View
                style={styles.totalRow}
                accessible
                accessibilityLabel={`${copy.receiptReview.itemSubtotalLabel}, ${formatCentavosForSpeech(itemSubtotalCentavos)}`}
              >
                <AppText color="textSecondary" style={styles.uniformText}>
                  {copy.receiptReview.itemSubtotalLabel}
                </AppText>
                <AppText style={styles.uniformText}>{formatCentavos(itemSubtotalCentavos)}</AppText>
              </View>
              {detectedTotalCentavos != null ? (
                <View
                  style={styles.totalRow}
                  accessible
                  accessibilityLabel={`${copy.receiptReview.detectedTotalLabel}, ${formatCentavosForSpeech(detectedTotalCentavos)}`}
                >
                  <AppText color="textSecondary" style={styles.uniformText}>
                    {copy.receiptReview.detectedTotalLabel}
                  </AppText>
                  <AppText style={styles.uniformText}>
                    {formatCentavos(detectedTotalCentavos)}
                  </AppText>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* A mismatch stays visible without expanding the breakdown. */}
          {totalsMatch.status === 'mismatch' ? (
            <View
              accessible
              accessibilityLabel={mismatchSpeech}
              style={[styles.reconciliationRow, styles.warning]}
            >
              <Feather name="alert-triangle" size={18} color={colors.warning} />
              <AppText variant="caption" style={styles.reconciliationText}>
                {mismatchMessage}
              </AppText>
            </View>
          ) : null}
        </SectionCard>

        {/* In-flow (not sticky), directly below the totals card. The only
            "Add people" button on this screen. */}
        <AppButton
          large
          label={copy.receiptReview.continueButton}
          disabled={items.length === 0}
          icon={(color) => <Feather name="arrow-right-circle" size={18} color={color} />}
          iconPosition="trailing"
          onPress={() => router.push(`/bill/${billId}/participants`)}
        />
      </ScrollView>

      <LineItemEditorSheet
        visible={editingItem !== null}
        initial={
          editingItem && editingItem !== 'new'
            ? {
                name: editingItem.name,
                quantity: editingItem.quantity,
                lineTotalCentavos: editingItem.lineTotalCentavos,
              }
            : null
        }
        onSave={handleSaveItem}
        onCancel={() => setEditingItem(null)}
      />

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

      {/* Opened by the row trash icon. */}
      <ConfirmationDialog
        visible={pendingDelete !== null}
        heading={copy.itemEditor.deleteConfirmHeading}
        body={copy.itemEditor.deleteConfirmBody}
        confirmLabel={copy.itemEditor.deleteAction}
        cancelLabel={copy.global.cancelAction}
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* A ConfirmationDialog rather than Alert.alert: Alert's buttons do
          nothing on react-native-web, so the confirm would never fire there. */}
      <ConfirmationDialog
        visible={confirmChooseAnother}
        heading={copy.receiptReview.chooseAnotherConfirmHeading}
        body={copy.receiptReview.chooseAnotherConfirmBody}
        confirmLabel={copy.preview.chooseAnotherAction}
        cancelLabel={copy.global.cancelAction}
        destructive
        onConfirm={handleConfirmChooseAnother}
        onCancel={() => setConfirmChooseAnother(false)}
        onDismiss={handleChooseAnotherDialogDismiss}
      />

      {/* Mirrors bill/[billId]/index.tsx's own receipt-image modal — same
          shape, new here since this screen didn't have one before. */}
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

      <Modal
        visible={showRawText}
        animationType="slide"
        onRequestClose={() => setShowRawText(false)}
      >
        <Screen tabBarHidden scroll>
          <AppButton
            variant="text"
            label={copy.global.closeAccessibilityLabel}
            onPress={() => setShowRawText(false)}
          />
          <ScrollView style={styles.rawTextScroll}>
            <AppText selectable variant="caption" style={[styles.uniformText, styles.rawText]}>
              {bill.rawOcrText}
            </AppText>
          </ScrollView>
        </Screen>
      </Modal>
    </Screen>
  );
}

// Low-alpha wash of a tone token — the same `${token}26` convention
// StatusBadge.tsx uses for its own tone fills, kept in this one place so the
// status card and reconciliation row never carry scattered hex literals.
function tint(hex: string): string {
  return `${hex}26`;
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    // Body-sized copy on this screen renders at the `caption` size; headings
    // keep their variant's weight.
    uniformText: {
      fontSize: 14,
      lineHeight: 19,
    },
    scroll: {
      flex: 1,
    },
    body: {
      padding: spacing.lg,
      gap: spacing.lg,
    },
    headerBlock: {
      gap: spacing.xs,
    },
    headingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      // Pulls the back button's own touch-target padding flush with the
      // content edge so the arrow lines up with the cards below.
      marginLeft: -spacing.md,
    },
    headingText: {
      flexShrink: 1,
    },
    statusCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      borderWidth: 1,
    },
    statusText: {
      flex: 1,
      gap: 2,
    },
    success: { backgroundColor: tint(colors.success), borderColor: colors.success },
    warning: { backgroundColor: tint(colors.warning), borderColor: colors.warning },
    neutral: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
    itemsBlock: {
      gap: spacing.sm,
    },
    itemsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    itemsHeaderText: {
      flex: 1,
      gap: 2,
    },
    viewActions: {
      gap: spacing.sm,
    },
    viewActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: touchTarget.preferred,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    viewActionIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      borderCurve: 'continuous',
      backgroundColor: tint(colors.primary),
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewActionText: {
      flex: 1,
      gap: 2,
    },
    pressed: {
      backgroundColor: colors.surfaceMuted,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
    },
    totalToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: touchTarget.preferred,
      borderRadius: radius.md,
      borderCurve: 'continuous',
    },
    totalHeadline: {
      flex: 1,
    },
    breakdown: {
      gap: spacing.sm,
    },
    reconciliationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      borderWidth: 1,
    },
    reconciliationText: {
      flex: 1,
    },
    rawTextScroll: {
      marginTop: spacing.md,
    },
    rawText: {
      fontFamily: 'monospace',
      color: colors.textPrimary,
    },
    receiptImage: {
      flex: 1,
    },
  });
}
