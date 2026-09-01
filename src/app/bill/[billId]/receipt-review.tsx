import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, View } from 'react-native';

import { LineItemEditorSheet, type LineItemDraft } from '@/components/bill/LineItemEditorSheet';
import { LineItemRow } from '@/components/bill/LineItemRow';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { TAB_BAR_CONTENT_CLEARANCE } from '@/components/ui/BottomTabBar';
import { Divider } from '@/components/ui/Divider';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { InlineError } from '@/components/ui/InlineError';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { copy } from '@/constants/copy';
import type { Bill } from '@/db/repositories/bills.repository';
import { billsRepository } from '@/db/repositories/bills.repository';
import { adjustmentsRepository } from '@/db/repositories/adjustments.repository';
import type { LineItem } from '@/db/repositories/lineItems.repository';
import { lineItemsRepository } from '@/db/repositories/lineItems.repository';
import { nowIso } from '@/lib/date';
import { createId } from '@/lib/ids';
import { formatCentavos } from '@/lib/money';
import type { ColorTokens } from '@/theme/tokens';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type LoadState = 'loading' | 'ready' | 'error';

// Matches spec section 9.1's documented receiptDate shape exactly.
const RECEIPT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

async function fetchReviewData(billId: string) {
  const [billRow, itemRows, adjustmentRows] = await Promise.all([
    billsRepository.getById(billId),
    lineItemsRepository.listByBillId(billId),
    adjustmentsRepository.listByBillId(billId),
  ]);
  return { billRow, itemRows, adjustmentRows };
}

export default function ReceiptReviewScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { billId, ocrSource, fallbackReason } = useLocalSearchParams<{
    billId: string;
    ocrSource?: 'backend' | 'on-device';
    fallbackReason?: 'rate_limited';
  }>();

  const [state, setState] = useState<LoadState>('loading');
  const [bill, setBill] = useState<Bill | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [adjustmentTotalCentavos, setAdjustmentTotalCentavos] = useState(0);
  const [merchantName, setMerchantName] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [editingItem, setEditingItem] = useState<LineItem | 'new' | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  // One shared error slot for this screen's write paths (merchant/date
  // autosave, item save/delete) — mirrors participants.tsx's own
  // actionError, and is distinct from dateError above, which is a field
  // validation message, not a storage failure.
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { billRow, itemRows, adjustmentRows } = await fetchReviewData(billId);
        if (!billRow) {
          setState('error');
          return;
        }
        setBill(billRow);
        setItems(itemRows);
        setAdjustmentTotalCentavos(adjustmentRows.reduce((sum, a) => sum + a.amountCentavos, 0));
        setMerchantName(billRow.merchantName ?? '');
        setReceiptDate(billRow.receiptDate ?? '');
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [billId]);

  async function refreshItems() {
    const itemRows = await lineItemsRepository.listByBillId(billId);
    setItems(itemRows);
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

  async function handleDeleteItem() {
    setActionError(null);
    try {
      if (editingItem && editingItem !== 'new') {
        await lineItemsRepository.remove(editingItem.id);
      }
      setEditingItem(null);
      await refreshItems();
    } catch {
      setEditingItem(null);
      setActionError(copy.global.storageFailure);
    }
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

  const itemSubtotalCentavos = items.reduce((sum, item) => sum + item.lineTotalCentavos, 0);
  const computedTotalCentavos = itemSubtotalCentavos + adjustmentTotalCentavos;
  const hasDetectedTotal = bill.detectedReceiptTotalCentavos != null;
  const totalDifference = hasDetectedTotal
    ? computedTotalCentavos - bill.detectedReceiptTotalCentavos!
    : 0;

  return (
    <Screen scroll padded={false}>
      <View style={styles.body}>
        <View style={styles.headerBlock}>
          <AppText variant="heading" style={styles.uniformText}>
            {copy.receiptReview.heading}
          </AppText>
          <AppText variant="body" color="textSecondary" style={styles.uniformText}>
            {copy.receiptReview.body}
          </AppText>

          {/* Shared by every write path below (merchant/date autosave, item
              save/delete) — mirrors participants.tsx's own actionError. */}
          {actionError ? <InlineError message={actionError} /> : null}

          {ocrSource ? (
            <StatusBadge
              label={
                ocrSource === 'backend'
                  ? copy.receiptReview.ocrSourceBackend
                  : copy.receiptReview.ocrSourceOnDevice
              }
              tone={
                ocrSource === 'backend'
                  ? 'success'
                  : fallbackReason === 'rate_limited'
                    ? 'warning'
                    : 'neutral'
              }
            />
          ) : null}

          {ocrSource === 'backend' ? (
            <AppText variant="caption" color="textSecondary" style={styles.uniformText}>
              {copy.receiptReview.handwritingNote}
            </AppText>
          ) : null}

          {fallbackReason === 'rate_limited' ? (
            <AppText variant="caption" color="warning" style={styles.uniformText}>
              {copy.receiptReview.rateLimitedNote}
            </AppText>
          ) : null}
        </View>

        <View style={styles.fieldsBlock}>
          <AppTextInput
            label={copy.receiptReview.merchantLabel}
            placeholder={copy.receiptReview.merchantPlaceholder}
            value={merchantName}
            onChangeText={setMerchantName}
            onEndEditing={handleMerchantBlur}
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
          />
        </View>

        <Divider />

        <View style={styles.itemsBlock}>
          <View style={styles.sectionHeader}>
            <AppText variant="subheading" style={styles.uniformText}>
              {copy.receiptReview.itemsSection}
            </AppText>
            {items.length > 0 ? (
              <AppText variant="caption" color="textSecondary" style={styles.uniformText}>
                {items.length === 1
                  ? copy.receiptReview.detectedCountSingular
                  : copy.receiptReview.detectedCountPlural.replace(
                      '{count}',
                      String(items.length),
                    )}
              </AppText>
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
            <>
              <FlatList
                data={items}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.itemGap} />}
                renderItem={({ item }) => (
                  <LineItemRow item={item} onPress={() => setEditingItem(item)} />
                )}
              />
              <AppButton
                variant="secondary"
                label={copy.receiptReview.addItem}
                icon={(color) => <Feather name="plus" size={18} color={color} />}
                onPress={() => setEditingItem('new')}
              />
            </>
          )}
        </View>

        <Divider />

        <View style={styles.totalsBlock}>
          {bill.detectedSubtotalCentavos != null ? (
            <View style={styles.totalRow}>
              <AppText color="textSecondary" style={styles.uniformText}>
                {copy.receiptReview.detectedSubtotalLabel}
              </AppText>
              <AppText style={styles.uniformText}>
                {formatCentavos(bill.detectedSubtotalCentavos)}
              </AppText>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <AppText color="textSecondary" style={styles.uniformText}>
              {copy.receiptReview.itemSubtotalLabel}
            </AppText>
            <AppText style={styles.uniformText}>{formatCentavos(itemSubtotalCentavos)}</AppText>
          </View>
          {hasDetectedTotal ? (
            <View style={styles.totalRow}>
              <AppText color="textSecondary" style={styles.uniformText}>
                {copy.receiptReview.detectedTotalLabel}
              </AppText>
              <AppText style={styles.uniformText}>
                {formatCentavos(bill.detectedReceiptTotalCentavos!)}
              </AppText>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <AppText variant="subheading" style={styles.uniformText}>
              {copy.receiptReview.computedTotalLabel}
            </AppText>
            <AppText variant="subheading" style={styles.uniformText}>
              {formatCentavos(computedTotalCentavos)}
            </AppText>
          </View>

          {hasDetectedTotal ? (
            <AppText
              color={totalDifference === 0 ? 'success' : 'warning'}
              style={styles.uniformText}
            >
              {totalDifference === 0
                ? copy.receiptReview.matchSuccess
                : copy.receiptReview.mismatchWarning
                    .replace('{difference}', formatCentavos(Math.abs(totalDifference)))
                    .replace(
                      '{higherOrLower}',
                      totalDifference > 0
                        ? copy.receiptReview.higherWord
                        : copy.receiptReview.lowerWord,
                    )}
            </AppText>
          ) : null}
        </View>

        {/* Was a sticky BottomActionBar footer — moved inline, directly
            below the raw-text action, per the user's own explicit request
            (2026-08-27) to drop the sticky nav here in favor of a plain
            in-flow button. */}
        <View style={styles.actionsBlock}>
          {bill.rawOcrText ? (
            <AppButton
              variant="text"
              label={copy.receiptReview.rawTextAction}
              icon={(color) => <Feather name="file-text" size={18} color={color} />}
              onPress={() => setShowRawText(true)}
            />
          ) : null}
          <AppButton
            label={copy.receiptReview.continueButton}
            disabled={items.length === 0}
            icon={(color) => <Feather name="arrow-right" size={18} color={color} />}
            iconPosition="trailing"
            onPress={() => router.push(`/bill/${billId}/participants`)}
          />
        </View>
      </View>

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
        onDelete={editingItem && editingItem !== 'new' ? handleDeleteItem : undefined}
        onCancel={() => setEditingItem(null)}
      />

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
    </Screen>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    // Every AppText on this screen renders at this one uniform size — matches
    // the `caption` variant's own size exactly. `variant="heading"`/
    // `"subheading"` still carry their bold font-weight, which is now the
    // only thing distinguishing a heading from body text.
    uniformText: {
      fontSize: 13,
      lineHeight: 18,
    },
    body: {
      padding: spacing.lg,
      // Section-to-section rhythm (headerBlock / fieldsBlock / itemsBlock /
      // totalsBlock / actionsBlock): spacing.xl between each distinct block,
      // spacing.md/sm within one — see each block's own style below.
      gap: spacing.xl,
      // The Continue button used to sit in a sticky footer, which
      // Screen.tsx pads above the global nav bar automatically — now that
      // it's plain in-flow content, this screen has to reserve that space
      // itself so the button doesn't end up hidden underneath the bar.
      paddingBottom: spacing.lg + TAB_BAR_CONTENT_CLEARANCE,
    },
    headerBlock: {
      gap: spacing.sm,
    },
    fieldsBlock: {
      gap: spacing.md,
    },
    itemsBlock: {
      gap: spacing.sm,
    },
    sectionHeader: {
      gap: 2,
    },
    itemGap: {
      height: spacing.sm,
    },
    totalsBlock: {
      gap: spacing.xs,
    },
    actionsBlock: {
      gap: spacing.md,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    rawTextScroll: {
      marginTop: spacing.md,
    },
    rawText: {
      fontFamily: 'monospace',
      color: colors.textPrimary,
    },
  });
}
