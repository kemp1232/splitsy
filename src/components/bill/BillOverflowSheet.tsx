import { Feather } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Animated, Modal, Pressable, StyleSheet } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { Divider } from '@/components/ui/Divider';
import { useSlideUpAnimation } from '@/components/ui/useSlideUpAnimation';
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
  // Modal's own `animationType="slide"` would transform the backdrop along
  // with the sheet (see useSlideUpAnimation's own header note) — the Modal
  // itself is "none" below, and only the sheet's Animated.View wrapper slides.
  const translateY = useSlideUpAnimation(visible);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      {/* Tapping the dimmed area outside the sheet dismisses it, same as
          Cancel — the inner Pressable's own no-op onPress exists only to
          claim the touch so it doesn't also fall through and count as a tap
          on the backdrop beneath it. */}
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Animated.View style={{ transform: [{ translateY }] }}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <AppButton
              variant="text"
              label={copy.home.overflowEdit}
              onPress={onEdit}
              icon={(color) => <Feather name="edit" size={18} color={color} />}
            />
            <AppButton
              variant="text"
              label={copy.home.overflowShare}
              onPress={onShare}
              icon={(color) => <Feather name="share" size={18} color={color} />}
            />
            <AppButton
              variant="destructive"
              label={copy.home.overflowDelete}
              onPress={onDelete}
              icon={(color) => <Feather name="trash" size={18} color={color} />}
            />
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
