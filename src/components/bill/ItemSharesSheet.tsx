import { useMemo, useState } from 'react';
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { NumberStepper } from '@/components/ui/NumberStepper';
import { useSlideUpAnimation } from '@/components/ui/useSlideUpAnimation';
import { copy } from '@/constants/copy';
import { MAX_ITEM_SHARE_WEIGHT } from '@/features/assignments/toggleParticipantAssignment';
import { allocateProportional } from '@/features/splitting/allocation';
import { formatCentavos } from '@/lib/money';
import type { ColorTokens } from '@/theme/tokens';
import { CONTENT_MAX_WIDTH, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export type ItemShareAssignee = {
  participantId: string;
  name: string;
  weight: number;
};

type Props = {
  visible: boolean;
  // The line item being edited; the draft re-seeds whenever this (or
  // `visible`) changes, so opening the sheet for another item never shows
  // the previous item's counts.
  lineItemId: string | null;
  itemName: string;
  lineTotalCentavos: number;
  // The item's current assignees in bill participant order, with their
  // current share counts.
  assignees: ItemShareAssignee[];
  onSave: (weightsByParticipantId: Map<string, number>) => void;
  onCancel: () => void;
};

// Not from the spec — the 2026-11-12 "unequal shares" amendment: sets each
// assignee's whole-number share count for one line item (e.g. 3 vs 2 of 5
// beers). Same bottom-sheet shape as ParticipantPickerSheet. Edits a local
// draft; nothing is applied until Save.
export function ItemSharesSheet({
  visible,
  lineItemId,
  itemName,
  lineTotalCentavos,
  assignees,
  onSave,
  onCancel,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translateY = useSlideUpAnimation(visible);
  const [draftWeights, setDraftWeights] = useState<Map<string, number>>(
    () => new Map(assignees.map((assignee) => [assignee.participantId, assignee.weight])),
  );
  // Re-seeds the draft during render (React's "adjust state when a prop
  // changes" pattern) the moment the sheet opens for an item — not in the
  // Modal's onShow, which fires after the first frame and left the previous
  // item's counts visible (and savable) for a moment.
  const openLineItemId = visible ? lineItemId : null;
  const [seededLineItemId, setSeededLineItemId] = useState<string | null>(openLineItemId);
  if (openLineItemId !== seededLineItemId) {
    setSeededLineItemId(openLineItemId);
    if (openLineItemId !== null) {
      setDraftWeights(
        new Map(assignees.map((assignee) => [assignee.participantId, assignee.weight])),
      );
    }
  }

  function handleChange(participantId: string, weight: number) {
    setDraftWeights((previous) => new Map(previous).set(participantId, weight));
  }

  function handleReset() {
    setDraftWeights(new Map(assignees.map((assignee) => [assignee.participantId, 1])));
  }

  const weights = assignees.map((assignee) => draftWeights.get(assignee.participantId) ?? 1);
  // Live preview of what each person pays for this item — the same
  // allocation calculateSplit uses for unequal shares.
  const previewAmounts =
    assignees.length > 0 ? allocateProportional(lineTotalCentavos, weights) : [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
      testID="item-shares-sheet"
    >
      {/* Same backdrop/Animated.View/inner-Pressable structure as
          ParticipantPickerSheet (see its comment for why). */}
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Animated.View style={[styles.sheetMaxHeight, { transform: [{ translateY }] }]}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <AppText variant="subheading">{copy.itemShares.heading}</AppText>
            <AppText variant="body" color="textSecondary">
              {copy.itemShares.body.replace('{item}', () => itemName)}
            </AppText>

            <ScrollView style={styles.list}>
              <View style={styles.rows}>
                {assignees.map((assignee, index) => (
                  <View key={assignee.participantId} style={styles.row}>
                    <View style={styles.rowText}>
                      <AppText variant="body" numberOfLines={1}>
                        {assignee.name}
                      </AppText>
                      <AppText variant="caption" color="textSecondary">
                        {formatCentavos(previewAmounts[index] ?? 0)}
                      </AppText>
                    </View>
                    <NumberStepper
                      value={weights[index] ?? 1}
                      min={1}
                      max={MAX_ITEM_SHARE_WEIGHT}
                      label={copy.itemShares.stepperLabel.replace('{name}', () => assignee.name)}
                      onChange={(weight) => handleChange(assignee.participantId, weight)}
                    />
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.quickActions}>
              <AppButton variant="text" label={copy.itemShares.resetAction} onPress={handleReset} />
            </View>

            <View style={styles.actions}>
              <AppButton variant="secondary" label={copy.global.cancelAction} onPress={onCancel} />
              <AppButton label={copy.itemShares.saveAction} onPress={() => onSave(draftWeights)} />
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
      justifyContent: 'flex-end',
    },
    sheetMaxHeight: {
      maxHeight: '80%',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.hero,
      borderTopRightRadius: radius.hero,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.md,
      width: '100%',
      maxWidth: Platform.OS === 'web' ? CONTENT_MAX_WIDTH : undefined,
      alignSelf: 'center',
    },
    list: {
      flexGrow: 0,
    },
    rows: {
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    quickActions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    actions: {
      gap: spacing.sm,
    },
  });
}
