import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { copy } from '@/constants/copy';
import {
  MAX_PARTICIPANT_NAME_LENGTH,
  validateParticipantName,
} from '@/features/participants/validateParticipantName';
import { colors, radius, spacing } from '@/theme/tokens';

export type ParticipantDraft = {
  name: string;
};

type Props = {
  visible: boolean;
  initial: ParticipantDraft | null; // null = adding a new participant
  // Every other participant's name currently in the bill (excluding the one
  // being edited, if editing) — used for the case-insensitive duplicate check.
  // Reading from the repository/store and passing names down keeps this
  // sheet's validation self-contained without it hitting the repository itself.
  existingNames: string[];
  onSave: (draft: ParticipantDraft) => void;
  onCancel: () => void;
};

export function ParticipantEditorSheet({
  visible,
  initial,
  existingNames,
  onSave,
  onCancel,
}: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [nameError, setNameError] = useState<string | null>(null);

  // Re-seeds local state every time the sheet opens, mirroring
  // LineItemEditorSheet, so reopening for a different participant always
  // starts clean.
  function reset(next: ParticipantDraft | null) {
    setName(next?.name ?? '');
    setNameError(null);
  }

  function handleShow() {
    reset(initial);
  }

  function handleSave() {
    const result = validateParticipantName(name, existingNames);
    if (!result.valid) {
      const errorByReason = {
        required: copy.participantEditor.requiredNameError,
        tooLong: copy.participantEditor.tooLongNameError,
        duplicate: copy.participantEditor.duplicateNameError,
      } as const;
      setNameError(errorByReason[result.reason]);
      return;
    }

    setNameError(null);
    onSave({ name: result.name });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={handleShow}
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        {/* A Modal's content sits in its own native window on Android and
            isn't a descendant of any screen-level KeyboardAvoidingView
            (Screen.tsx), so the name field above this sheet's Save/Cancel
            buttons needs its own instance to keep those buttons reachable
            above the keyboard (spec section 17). Behavior matches
            Screen.tsx's iOS branch ("padding"); Android uses "height" here
            instead of Screen.tsx's `undefined`, because a transparent Modal
            is a separate Dialog window that doesn't reliably inherit the
            hosting Activity's `android:windowSoftInputMode=adjustResize`
            behavior the way a normal screen does. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.avoidingView}
        >
          <View style={styles.sheet}>
            <AppText variant="subheading">
              {initial ? copy.participantEditor.editHeading : copy.participantEditor.addHeading}
            </AppText>

            <AppTextInput
              label={copy.participantEditor.nameLabel}
              placeholder={copy.participantEditor.namePlaceholder}
              value={name}
              onChangeText={setName}
              maxLength={MAX_PARTICIPANT_NAME_LENGTH}
              error={nameError ?? undefined}
            />

            <View style={styles.actions}>
              <AppButton
                variant="secondary"
                label={copy.participantEditor.cancelAction}
                onPress={onCancel}
              />
              <AppButton label={copy.participantEditor.saveAction} onPress={handleSave} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  // flex: 1 (rather than sizing to content) plus justifyContent: 'flex-end'
  // here — not on `backdrop` — is what makes the "height" behavior above
  // actually push the sheet above the keyboard on Android: this view spans
  // the full backdrop from the top, so shrinking its own height (what
  // "height" behavior does) eats space from the bottom, exactly where the
  // keyboard appears, while its flex-end-anchored child (the sheet) stays
  // pinned to whatever is now its bottom edge. If `backdrop` itself carried
  // justifyContent: 'flex-end' instead, this view would keep shrinking while
  // staying bottom-anchored within an unchanged-height backdrop, which would
  // leave its bottom (and the sheet inside it) sitting exactly behind the
  // keyboard instead of above it.
  avoidingView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  actions: {
    gap: spacing.sm,
  },
});
