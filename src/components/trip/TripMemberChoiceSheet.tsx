import Feather from '@expo/vector-icons/Feather';
import { useMemo } from 'react';
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Divider } from '@/components/ui/Divider';
import { useSlideUpAnimation } from '@/components/ui/useSlideUpAnimation';
import { copy } from '@/constants/copy';
import type { TripParticipant } from '@/db/repositories/tripParticipants.repository';
import type { BillToTripChoice } from '@/features/trips/buildBillToTripMapping';
import type { ColorTokens } from '@/theme/tokens';
import { CONTENT_MAX_WIDTH, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  visible: boolean;
  // The bill participant being matched (shown in the heading).
  participantName: string;
  // Active trip roster.
  roster: TripParticipant[];
  // Roster member ids already matched to a *different* bill participant —
  // shown disabled, since one trip person can only be one bill person.
  takenMemberIds: ReadonlySet<string>;
  selected: BillToTripChoice | null;
  onSelect: (choice: BillToTripChoice) => void;
  onCancel: () => void;
};

// Single-select sheet for the move-to-trip mapping step: one of the trip's
// roster members, or "Add to trip as new person". Same Modal-backdrop-plus-
// sheet structure as BillOverflowSheet/TripOverflowSheet; tapping an option
// selects it and closes.
export function TripMemberChoiceSheet({
  visible,
  participantName,
  roster,
  takenMemberIds,
  selected,
  onSelect,
  onCancel,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translateY = useSlideUpAnimation(visible);
  const isNewSelected = selected?.kind === 'new';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      {/* Backdrop tap = Cancel; the inner no-op Pressable claims touches on
          the sheet itself (see BillOverflowSheet). */}
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Animated.View style={{ transform: [{ translateY }] }}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <AppText variant="cardTitle">
              {copy.moveToTrip.choiceSheetHeading.replace('{name}', () => participantName)}
            </AppText>
            <ScrollView style={styles.options} contentContainerStyle={styles.optionsContent}>
              {roster.map((member) => {
                const isSelected =
                  selected?.kind === 'existing' && selected.tripParticipantId === member.id;
                const isTaken = takenMemberIds.has(member.id);
                return (
                  <AppButton
                    key={member.id}
                    variant="text"
                    label={
                      isTaken ? `${member.name} · ${copy.moveToTrip.memberTakenHint}` : member.name
                    }
                    disabled={isTaken}
                    onPress={() => onSelect({ kind: 'existing', tripParticipantId: member.id })}
                    icon={(color) => (
                      <Feather
                        name={isSelected ? 'check-circle' : 'circle'}
                        size={18}
                        color={color}
                      />
                    )}
                  />
                );
              })}
              <AppButton
                variant="text"
                label={copy.moveToTrip.addNewOption}
                onPress={() => onSelect({ kind: 'new' })}
                icon={(color) => (
                  <Feather
                    name={isNewSelected ? 'check-circle' : 'user-plus'}
                    size={18}
                    color={color}
                  />
                )}
              />
            </ScrollView>
            <Divider />
            <AppButton variant="secondary" label={copy.global.cancelAction} onPress={onCancel} />
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
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.hero,
      borderTopRightRadius: radius.hero,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
      // Web desktop widening — same as BillOverflowSheet.
      width: '100%',
      maxWidth: Platform.OS === 'web' ? CONTENT_MAX_WIDTH : undefined,
      alignSelf: 'center',
    },
    options: {
      maxHeight: 360,
    },
    optionsContent: {
      gap: spacing.xs,
    },
  });
}
