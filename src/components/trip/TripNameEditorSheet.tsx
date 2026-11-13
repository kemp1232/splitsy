import { useMemo, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { useSlideUpAnimation } from '@/components/ui/useSlideUpAnimation';
import { copy } from '@/constants/copy';
import type { ColorTokens } from '@/theme/tokens';
import { CONTENT_MAX_WIDTH, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  visible: boolean;
  initialName: string;
  // Receives the raw text; the caller normalizes (trim / blank -> null).
  onSave: (name: string) => void;
  onCancel: () => void;
};

// Rename sheet for the trip hub — same Modal/KeyboardAvoidingView structure
// as ParticipantEditorSheet (see its comments for the layout rationale).
export function TripNameEditorSheet({ visible, initialName, onSave, onCancel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translateY = useSlideUpAnimation(visible);
  const [name, setName] = useState(initialName);

  // Re-seeds every time the sheet opens so it always shows the current name.
  function handleShow() {
    setName(initialName);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onShow={handleShow}
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.avoidingView}
        >
          <Animated.View style={{ transform: [{ translateY }] }}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <AppText variant="subheading">{copy.trip.renameTripTitle}</AppText>

              <AppTextInput
                label={copy.trip.nameLabel}
                placeholder={copy.trip.namePlaceholder}
                value={name}
                onChangeText={setName}
              />

              <View style={styles.actions}>
                <AppButton
                  variant="secondary"
                  label={copy.global.cancelAction}
                  onPress={onCancel}
                />
                <AppButton label={copy.trip.renameSave} onPress={() => onSave(name)} />
              </View>
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
    },
    avoidingView: {
      flex: 1,
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
      gap: spacing.md,
      width: '100%',
      maxWidth: Platform.OS === 'web' ? CONTENT_MAX_WIDTH : undefined,
      alignSelf: 'center',
    },
    actions: {
      gap: spacing.sm,
    },
  });
}
