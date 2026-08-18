import { useMemo } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { Divider } from '@/components/ui/Divider';
import { copy } from '@/constants/copy';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  visible: boolean;
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
  onCancel: () => void;
};

// Spec 13.2's per-row overflow actions ("Overflow edit"/"Overflow
// share"/"Overflow delete") — a small slide-up action sheet, mirroring the
// same Modal-backdrop-plus-sheet structure already established by
// ParticipantPickerSheet/LineItemEditorSheet/etc., just without any
// selection state of its own: each row is a single tap-to-close-and-act
// button rather than a form. Works identically for a DRAFT or a COMPLETED
// bill — the caller (home screen) decides what each action actually does for
// the specific bill the sheet was opened for.
export function BillOverflowSheet({ visible, onEdit, onShare, onDelete, onCancel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <AppButton variant="text" label={copy.home.overflowEdit} onPress={onEdit} />
          <AppButton variant="text" label={copy.home.overflowShare} onPress={onShare} />
          <AppButton variant="destructive" label={copy.home.overflowDelete} onPress={onDelete} />
          <Divider />
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
