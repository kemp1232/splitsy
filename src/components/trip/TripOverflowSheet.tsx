import { useMemo } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <AppButton variant="destructive" label={copy.trip.deleteTripAction} onPress={onDelete} />
          <AppButton variant="secondary" label={copy.global.cancelAction} onPress={onCancel} />
        </View>
      </View>
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
