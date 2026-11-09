import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { InlineError } from '@/components/ui/InlineError';
import { copy } from '@/constants/copy';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  visible: boolean;
  // Runs the deletion with the entered password; resolves to an error message
  // to show inline, or null on success (the caller closes the dialog).
  onConfirm: (password: string) => Promise<string | null>;
  onCancel: () => void;
};

/**
 * Password-confirmed "Delete account" dialog. Same transparent-Modal shape as
 * ConfirmationDialog (backdrop tap / back button cancels), plus a password
 * field — Better Auth verifies the password server-side before deleting.
 */
export function DeleteAccountDialog({ visible, onConfirm, onCancel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setPassword('');
    setError(null);
    setSubmitting(false);
  }

  function handleCancel() {
    if (submitting) return;
    reset();
    onCancel();
  }

  async function handleConfirm() {
    if (!password) {
      setError(copy.auth.deleteAccountPasswordRequired);
      return;
    }
    setError(null);
    setSubmitting(true);
    const message = await onConfirm(password);
    if (message) {
      setError(message);
      setSubmitting(false);
      return;
    }
    reset();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <Pressable style={styles.backdrop} onPress={handleCancel}>
        <Pressable style={styles.dialog} accessibilityRole="alert" onPress={() => {}}>
          <AppText variant="subheading">{copy.auth.deleteAccountHeading}</AppText>
          <AppText variant="body" color="textSecondary">
            {copy.auth.deleteAccountBody}
          </AppText>
          <AppTextInput
            label={copy.auth.deleteAccountPasswordLabel}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (error) setError(null);
            }}
            secureTextEntry
            textContentType="password"
            autoComplete="current-password"
            autoCapitalize="none"
            editable={!submitting}
            onSubmitEditing={handleConfirm}
          />
          {error ? <InlineError message={error} /> : null}
          <View style={styles.actions}>
            <AppButton
              label={copy.auth.deleteAccountCancel}
              variant="secondary"
              onPress={handleCancel}
              disabled={submitting}
            />
            <AppButton
              label={copy.auth.deleteAccountConfirm}
              variant="destructive"
              onPress={handleConfirm}
              loading={submitting}
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
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    dialog: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      padding: spacing.lg,
      gap: spacing.md,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
    },
  });
}
