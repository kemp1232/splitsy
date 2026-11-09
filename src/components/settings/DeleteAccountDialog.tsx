import { useState } from 'react';

import { AppTextInput } from '@/components/ui/AppTextInput';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { InlineError } from '@/components/ui/InlineError';
import { copy } from '@/constants/copy';

type Props = {
  visible: boolean;
  // Runs the deletion with the entered password; resolves to an error message
  // to show inline, or null on success (the caller closes the dialog).
  onConfirm: (password: string) => Promise<string | null>;
  onCancel: () => void;
};

/**
 * Password-confirmed "Delete account" dialog: the shared ConfirmationDialog
 * with a password field and inline error between its body and actions.
 * Better Auth verifies the password server-side before deleting.
 */
export function DeleteAccountDialog({ visible, onConfirm, onCancel }: Props) {
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
    if (submitting) return;
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
    <ConfirmationDialog
      visible={visible}
      heading={copy.auth.deleteAccountHeading}
      body={copy.auth.deleteAccountBody}
      confirmLabel={copy.auth.deleteAccountConfirm}
      cancelLabel={copy.auth.deleteAccountCancel}
      destructive
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      confirmLoading={submitting}
      cancelDisabled={submitting}
    >
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
    </ConfirmationDialog>
  );
}
