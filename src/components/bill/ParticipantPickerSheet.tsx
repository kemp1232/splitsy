import { useMemo, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ParticipantChip } from '@/components/bill/ParticipantChip';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { InlineError } from '@/components/ui/InlineError';
import { useSlideUpAnimation } from '@/components/ui/useSlideUpAnimation';
import { copy } from '@/constants/copy';
import type { Participant } from '@/db/repositories/participants.repository';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

// Distinguishes a single line item's assignment from a bulk "assign all
// unassigned" pass — both flows share this one sheet component rather than
// two near-duplicate sheets. The spec gives identical copy for both cases, so
// this currently only tags the sheet for testing/telemetry purposes.
export type ParticipantPickerMode = 'single' | 'bulk';

type Props = {
  visible: boolean;
  mode: ParticipantPickerMode;
  participants: Participant[];
  initialSelectedIds: string[];
  onSave: (selectedParticipantIds: string[]) => void;
  onCancel: () => void;
};

export function ParticipantPickerSheet({
  visible,
  mode,
  participants,
  initialSelectedIds,
  onSave,
  onCancel,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translateY = useSlideUpAnimation(visible);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [error, setError] = useState<string | null>(null);

  // Re-seeds local state every time the sheet opens (mirrors
  // LineItemEditorSheet / ParticipantEditorSheet).
  function handleShow() {
    setSelectedIds(initialSelectedIds);
    setError(null);
  }

  function toggle(participantId: string) {
    setSelectedIds((previous) =>
      previous.includes(participantId)
        ? previous.filter((id) => id !== participantId)
        : [...previous, participantId],
    );
    setError(null);
  }

  function handleSelectAll() {
    setSelectedIds(participants.map((participant) => participant.id));
    setError(null);
  }

  function handleClear() {
    setSelectedIds([]);
  }

  function handleSave() {
    if (selectedIds.length === 0) {
      setError(copy.participantPicker.requiredError);
      return;
    }
    onSave(selectedIds);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onShow={handleShow}
      onRequestClose={onCancel}
      testID={`participant-picker-sheet-${mode}`}
    >
      {/* Tapping the dimmed area outside the sheet dismisses it, same as
          Cancel — see BillOverflowSheet's identical treatment for why the
          inner Pressable needs its own no-op onPress and why the Modal's own
          animation is off in favor of useSlideUpAnimation. `maxHeight` lives
          on this Animated.View, not the inner `sheet` Pressable — a
          percentage height needs to resolve against `backdrop`'s real
          (screen-height) size, which this wrapper sits directly inside;
          `sheet` itself has no defined height of its own to resolve against. */}
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Animated.View style={[styles.sheetMaxHeight, { transform: [{ translateY }] }]}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <AppText variant="subheading">{copy.participantPicker.heading}</AppText>
          <AppText variant="body" color="textSecondary">
            {copy.participantPicker.body}
          </AppText>

          <View style={styles.quickActions}>
            <AppButton
              variant="text"
              label={copy.participantPicker.selectAll}
              onPress={handleSelectAll}
            />
            <AppButton variant="text" label={copy.participantPicker.clear} onPress={handleClear} />
          </View>

          {error ? <InlineError message={error} /> : null}

          <ScrollView style={styles.list}>
            <View style={styles.chipWrap}>
              {participants.map((participant) => (
                <ParticipantChip
                  key={participant.id}
                  name={participant.name}
                  selected={selectedIds.includes(participant.id)}
                  onPress={() => toggle(participant.id)}
                />
              ))}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <AppButton variant="secondary" label={copy.global.cancelAction} onPress={onCancel} />
            <AppButton label={copy.participantPicker.saveAction} onPress={handleSave} />
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
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    // On the Animated.View wrapper, not `sheet` below — see this file's own
    // render-side comment on why a percentage height has to resolve there.
    sheetMaxHeight: {
      maxHeight: '80%',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.md,
    },
    quickActions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    list: {
      flexGrow: 0,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    actions: {
      gap: spacing.sm,
    },
  });
}
