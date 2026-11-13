import { memo, useCallback, useMemo, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { PARTICIPANT_NAME_ERROR_BY_REASON } from '@/components/bill/ParticipantEditorSheet';
import { ParticipantChip } from '@/components/bill/ParticipantChip';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { useSlideUpAnimation } from '@/components/ui/useSlideUpAnimation';
import { copy } from '@/constants/copy';
import type { SavedPerson } from '@/db/repositories/savedPeople.repository';
import {
  MAX_PARTICIPANT_NAME_LENGTH,
  validateParticipantName,
} from '@/features/participants/validateParticipantName';
import type { ColorTokens } from '@/theme/tokens';
import { CONTENT_MAX_WIDTH, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export type SavedGroupDraft = { name: string; memberIds: string[] };

type Props = {
  visible: boolean;
  // The group being edited; null creates a new one.
  initial: SavedGroupDraft | null;
  savedPeople: SavedPerson[];
  // Every other group's name, for the case-insensitive duplicate check.
  existingGroupNames: string[];
  onSave: (draft: SavedGroupDraft) => void;
  onCancel: () => void;
};

// Create/edit sheet for a saved group (#6): its name plus which saved people
// belong to it. Same Modal/slide-up/keyboard structure as
// ParticipantEditorSheet; the member toggles reuse ParticipantChip's
// selectable pill, as ParticipantPickerSheet does. A group may be saved with
// no members (it just isn't offered on a bill).
export function SavedGroupEditorSheet({
  visible,
  initial,
  savedPeople,
  existingGroupNames,
  onSave,
  onCancel,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translateY = useSlideUpAnimation(visible);
  const [name, setName] = useState(initial?.name ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(initial?.memberIds ?? []);
  const [nameError, setNameError] = useState<string | null>(null);

  // Re-seeds local state every time the sheet opens (mirrors
  // ParticipantEditorSheet).
  function handleShow() {
    setName(initial?.name ?? '');
    setMemberIds(initial?.memberIds ?? []);
    setNameError(null);
  }

  // Stable (functional update), so the memoized MemberChip rows below only
  // re-render when their own selection changes.
  const toggle = useCallback((savedPersonId: string) => {
    setMemberIds((previous) =>
      previous.includes(savedPersonId)
        ? previous.filter((id) => id !== savedPersonId)
        : [...previous, savedPersonId],
    );
  }, []);

  function handleSave() {
    const result = validateParticipantName(name, existingGroupNames);
    if (!result.valid) {
      setNameError(
        result.reason === 'duplicate'
          ? copy.savedPeople.groupDuplicateNameError
          : PARTICIPANT_NAME_ERROR_BY_REASON[result.reason],
      );
      return;
    }
    setNameError(null);
    // Drops ids of people deleted while the sheet was open.
    const knownIds = memberIds.filter((id) => savedPeople.some((person) => person.id === id));
    onSave({ name: result.name, memberIds: knownIds });
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
              <AppText variant="subheading">
                {initial ? copy.savedPeople.groupEditHeading : copy.savedPeople.groupNewHeading}
              </AppText>

              <AppTextInput
                label={copy.savedPeople.groupNameLabel}
                placeholder={copy.savedPeople.groupNamePlaceholder}
                value={name}
                onChangeText={setName}
                maxLength={MAX_PARTICIPANT_NAME_LENGTH}
                error={nameError ?? undefined}
              />

              <AppText variant="caption" color="textSecondary">
                {copy.savedPeople.groupMembersLabel}
              </AppText>
              {savedPeople.length === 0 ? (
                <AppText variant="caption" color="textSecondary">
                  {copy.savedPeople.groupNoSavedPeople}
                </AppText>
              ) : (
                <ScrollView
                  style={styles.memberScroll}
                  contentContainerStyle={styles.chipWrap}
                  keyboardShouldPersistTaps="handled"
                >
                  {savedPeople.map((person) => (
                    <MemberChip
                      key={person.id}
                      id={person.id}
                      name={person.name}
                      selected={memberIds.includes(person.id)}
                      onToggle={toggle}
                    />
                  ))}
                </ScrollView>
              )}

              <View style={styles.actions}>
                <AppButton
                  variant="secondary"
                  label={copy.global.cancelAction}
                  onPress={onCancel}
                />
                <AppButton label={copy.savedPeople.groupSaveAction} onPress={handleSave} />
              </View>
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

type MemberChipProps = {
  id: string;
  name: string;
  selected: boolean;
  onToggle: (id: string) => void;
};

// Receives the id and one shared toggle callback instead of a per-chip
// closure (list-performance-callbacks); wraps ParticipantChip's selectable
// pill.
const MemberChip = memo(function MemberChip({ id, name, selected, onToggle }: MemberChipProps) {
  const handlePress = useCallback(() => onToggle(id), [onToggle, id]);
  return <ParticipantChip name={name} selected={selected} onPress={handlePress} />;
});

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
    },
    // See ParticipantEditorSheet's avoidingView for why flex: 1 lives here.
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
    memberScroll: {
      maxHeight: 280,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    actions: {
      gap: spacing.sm,
    },
  });
}
