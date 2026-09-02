import { Feather } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Animated, Modal, Pressable, StyleSheet } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { useSlideUpAnimation } from '@/components/ui/useSlideUpAnimation';
import { copy } from '@/constants/copy';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  visible: boolean;
  onDelete: () => void;
  onCancel: () => void;
};

// The trip hub's overflow menu — mirrors BillOverflowSheet.tsx's own
// Modal-backdrop-plus-sheet structure exactly, just with a single destructive
// action for now (Delete trip). Kept as its own small sheet component (not
// inlined into the hub screen) so a future trip-level action has an
// established place to go without reshaping the hub screen itself.
export function TripOverflowSheet({ visible, onDelete, onCancel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translateY = useSlideUpAnimation(visible);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      {/* Tapping the dimmed area outside the sheet dismisses it, same as
          Cancel — see BillOverflowSheet's identical treatment for why the
          inner Pressable needs its own no-op onPress and why the Modal's own
          animation is off in favor of useSlideUpAnimation. */}
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Animated.View style={{ transform: [{ translateY }] }}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <AppButton
              variant="destructive"
              label={copy.trip.deleteTripAction}
              onPress={onDelete}
              icon={(color) => <Feather name="trash" size={18} color={color} />}
            />
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
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
  });
}
