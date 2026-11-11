import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppButton } from './AppButton';
import { AppText } from './AppText';

type Props = {
  visible: boolean;
  heading: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  // Forwarded to RN's Modal, which only calls it on iOS, once the dialog has
  // fully dismissed — for callers that must open another native screen
  // (e.g. the image picker) only after this one is gone.
  onDismiss?: () => void;
  // Optional extra content between the body and the actions (e.g.
  // DeleteAccountDialog's password field + inline error). Omitted by every
  // plain confirm/cancel caller, which therefore render exactly as before.
  children?: ReactNode;
  // Spinner on (and disables) the confirm button while its action runs.
  confirmLoading?: boolean;
  // Disables the cancel button (e.g. while that action is in flight).
  cancelDisabled?: boolean;
};

export function ConfirmationDialog({
  visible,
  heading,
  body,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
  onDismiss,
  children,
  confirmLoading,
  cancelDisabled,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      onDismiss={onDismiss}
    >
      {/* Tapping the dimmed area outside the dialog dismisses it, same as
          Cancel — see BillOverflowSheet's identical treatment for why the
          inner Pressable needs its own no-op onPress. */}
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.dialog} accessibilityRole="alert" onPress={() => {}}>
          <AppText variant="cardTitle">{heading}</AppText>
          <AppText variant="body" color="textSecondary">
            {body}
          </AppText>
          {children}
          <View style={styles.actions}>
            <AppButton
              label={cancelLabel}
              variant="secondary"
              onPress={onCancel}
              disabled={cancelDisabled}
            />
            <AppButton
              label={confirmLabel}
              variant={destructive ? 'destructive' : 'primary'}
              onPress={onConfirm}
              loading={confirmLoading}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    dialog: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl20,
      gap: spacing.md,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
    },
  });
}
