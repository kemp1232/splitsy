import Feather from '@expo/vector-icons/Feather';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { copy } from '@/constants/copy';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export type SavedPersonSuggestion = { id: string; name: string };
export type SavedGroupSuggestion = { id: string; name: string; addableCount: number };

type Props = {
  people: SavedPersonSuggestion[];
  // Only groups with at least one member not already on the bill.
  groups: SavedGroupSuggestion[];
  onAddPerson: (id: string) => void;
  onAddGroup: (id: string) => void;
};

// One-tap "add" chips for a standalone bill's participants screen (#6):
// saved groups first, then saved people. Renders nothing when there's
// nothing to suggest.
export function SavedPeopleSuggestions({ people, groups, onAddPerson, onAddGroup }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (people.length === 0 && groups.length === 0) return null;

  return (
    <View style={styles.container}>
      {groups.length > 0 ? (
        <View style={styles.block}>
          <AppText variant="caption" color="textSecondary" accessibilityRole="header">
            {copy.savedPeople.groupsHeading}
          </AppText>
          <View style={styles.chipWrap}>
            {groups.map((group) => (
              <SuggestionChip
                key={group.id}
                id={group.id}
                icon="users"
                label={copy.savedPeople.groupChipLabel
                  .replace('{name}', () => group.name)
                  .replace('{count}', String(group.addableCount))}
                accessibilityLabel={
                  group.addableCount === 1
                    ? copy.savedPeople.addGroupAccessibilityLabelSingular.replace(
                        '{name}',
                        () => group.name,
                      )
                    : copy.savedPeople.addGroupAccessibilityLabel
                        .replace('{count}', String(group.addableCount))
                        .replace('{name}', () => group.name)
                }
                onPress={onAddGroup}
              />
            ))}
          </View>
        </View>
      ) : null}
      {people.length > 0 ? (
        <View style={styles.block}>
          <AppText variant="caption" color="textSecondary" accessibilityRole="header">
            {copy.savedPeople.suggestionsHeading}
          </AppText>
          <View style={styles.chipWrap}>
            {people.map((person) => (
              <SuggestionChip
                key={person.id}
                id={person.id}
                icon="plus"
                label={person.name}
                accessibilityLabel={copy.savedPeople.addPersonAccessibilityLabel.replace(
                  '{name}',
                  () => person.name,
                )}
                onPress={onAddPerson}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

type ChipProps = {
  id: string;
  icon: 'plus' | 'users';
  label: string;
  accessibilityLabel: string;
  // Receives the id, so the screen passes one hoisted handler for every chip.
  onPress: (id: string) => void;
};

// Memoized (RN perf rule) — rendered in a loop. Same pill tokens as
// ParticipantChip, but a plain "add" button rather than a checkbox.
const SuggestionChip = memo(function SuggestionChip({
  id,
  icon,
  label,
  accessibilityLabel,
  onPress,
}: ChipProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      onPress={() => onPress(id)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
    >
      <Feather name={icon} size={16} color={colors.primary} />
      <AppText variant="body" numberOfLines={1} style={styles.chipLabel}>
        {label}
      </AppText>
    </Pressable>
  );
});

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      gap: spacing.md,
    },
    block: {
      gap: spacing.sm,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chip: {
      minHeight: touchTarget.min,
      maxWidth: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    chipPressed: {
      opacity: 0.85,
    },
    chipLabel: {
      flexShrink: 1,
      fontSize: 14,
      lineHeight: 19,
    },
  });
}
