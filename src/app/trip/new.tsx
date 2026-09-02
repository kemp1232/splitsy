import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import {
  ParticipantEditorSheet,
  type ParticipantDraft,
} from '@/components/bill/ParticipantEditorSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { TAB_BAR_CONTENT_CLEARANCE } from '@/components/ui/BottomTabBar';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { Divider } from '@/components/ui/Divider';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { InlineError } from '@/components/ui/InlineError';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import { hasMinimumParticipants } from '@/features/participants/hasMinimumParticipants';
import {
  normalizeParticipantName,
  QUICK_ADD_ME_NAME,
} from '@/features/participants/validateParticipantName';
import { createTrip } from '@/features/trips/trip.service';
import { createId } from '@/lib/ids';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

// A local draft roster row before the trip exists in the database — keyed by
// a client-only id that's never persisted, purely so this screen's list/edit/
// remove UX has a stable key before createTrip mints real tripParticipants
// rows in one shot. Mirrors bill/[billId]/participants.tsx's own roster UX
// (same ParticipantEditorSheet/validateParticipantName), just against local
// state instead of a bill that already exists.
type DraftRosterMember = { draftId: string; name: string };

export default function NewTripScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [roster, setRoster] = useState<DraftRosterMember[]>([]);
  const [editingMember, setEditingMember] = useState<DraftRosterMember | 'new' | null>(null);
  const [removingMember, setRemovingMember] = useState<DraftRosterMember | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const meetsMinimumParticipants = hasMinimumParticipants(roster.length);
  const normalizedMeName = normalizeParticipantName(QUICK_ADD_ME_NAME);
  const meAlreadyExists = roster.some(
    (member) => normalizeParticipantName(member.name) === normalizedMeName,
  );

  const editingDraftId = editingMember && editingMember !== 'new' ? editingMember.draftId : null;
  const existingNamesForEditor = roster
    .filter((member) => member.draftId !== editingDraftId)
    .map((member) => member.name);

  function handleSaveMember(draft: ParticipantDraft) {
    if (editingMember === 'new') {
      setRoster((current) => [...current, { draftId: createId(), name: draft.name }]);
    } else if (editingMember) {
      const editingId = editingMember.draftId;
      setRoster((current) =>
        current.map((member) =>
          member.draftId === editingId ? { ...member, name: draft.name } : member,
        ),
      );
    }
    setEditingMember(null);
  }

  function handleQuickAddMe() {
    setRoster((current) => [...current, { draftId: createId(), name: QUICK_ADD_ME_NAME }]);
  }

  function handleConfirmRemove() {
    if (!removingMember) return;
    const removingId = removingMember.draftId;
    setRoster((current) => current.filter((member) => member.draftId !== removingId));
    setRemovingMember(null);
  }

  async function handleStartTrip() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const trip = await createTrip({
        name: name.trim() || null,
        rosterNames: roster.map((member) => member.name),
      });
      router.replace(`/trip/${trip.id}`);
    } catch {
      setSubmitError(copy.global.storageFailure);
      setSubmitting(false);
    }
  }

  return (
    <Screen scroll padded={false}>
      <View style={styles.body}>
        <View style={styles.headerBlock}>
          <AppText variant="heading">{copy.trip.newHeading}</AppText>
          <AppText variant="body" color="textSecondary">
            {copy.trip.newBody}
          </AppText>
        </View>

        <AppTextInput
          label={copy.trip.nameLabel}
          placeholder={copy.trip.namePlaceholder}
          value={name}
          onChangeText={setName}
        />

        <View style={styles.rosterSection}>
          <Divider />

          <AppText variant="subheading">{copy.trip.rosterHeading}</AppText>

          <AppButton
            variant="secondary"
            label={copy.trip.quickAddMe}
            disabled={meAlreadyExists}
            onPress={handleQuickAddMe}
            icon={(color) => <Feather name="plus-circle" size={18} color={color} />}
          />

          {roster.length === 0 ? (
            <EmptyState
              heading={copy.trip.emptyHeading}
              body={copy.trip.emptyBody}
              actionLabel={copy.trip.addAction}
              onAction={() => setEditingMember('new')}
            />
          ) : (
            <>
              <FlatList
                data={roster}
                keyExtractor={(member) => member.draftId}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.itemGap} />}
                renderItem={({ item }) => (
                  <View style={styles.row}>
                    <Pressable
                      onPress={() => setEditingMember(item)}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.rowMain, pressed && styles.rowMainPressed]}
                    >
                      <AppText variant="body" numberOfLines={1}>
                        {item.name}
                      </AppText>
                    </Pressable>
                    <IconButton
                      accessibilityLabel={copy.trip.removeConfirmHeading.replace(
                        '{name}',
                        item.name,
                      )}
                      onPress={() => setRemovingMember(item)}
                      icon={<Feather name="x" size={20} color={colors.danger} />}
                    />
                  </View>
                )}
              />
              <AppButton
                variant="secondary"
                label={copy.trip.addAction}
                onPress={() => setEditingMember('new')}
                icon={(color) => <Feather name="plus-circle" size={18} color={color} />}
              />
            </>
          )}
        </View>

        {/* Was a sticky BottomActionBar footer — moved inline, per the
            user's own explicit request (2026-08-27) to drop sticky nav
            footers in favor of plain in-flow buttons. */}
        <View style={styles.actionsBlock}>
          {!meetsMinimumParticipants ? <InlineError message={copy.trip.minimumError} /> : null}
          {submitError ? <InlineError message={submitError} /> : null}
          <AppButton
            label={copy.trip.startTripAction}
            disabled={!meetsMinimumParticipants}
            loading={submitting}
            onPress={handleStartTrip}
          />
        </View>
      </View>

      <ParticipantEditorSheet
        visible={editingMember !== null}
        initial={editingMember && editingMember !== 'new' ? { name: editingMember.name } : null}
        existingNames={existingNamesForEditor}
        onSave={handleSaveMember}
        onCancel={() => setEditingMember(null)}
      />

      <ConfirmationDialog
        visible={removingMember !== null}
        heading={copy.trip.removeConfirmHeading.replace('{name}', removingMember?.name ?? '')}
        body={copy.trip.removeConfirmBody}
        confirmLabel={copy.trip.removeAction}
        cancelLabel={copy.global.cancelAction}
        destructive
        onConfirm={handleConfirmRemove}
        onCancel={() => setRemovingMember(null)}
      />
    </Screen>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    body: {
      padding: spacing.lg,
      // The Start Trip button used to sit in a sticky footer, which
      // Screen.tsx pads above the global nav bar automatically — now that
      // it's plain in-flow content, this screen reserves that space itself.
      paddingBottom: spacing.lg + TAB_BAR_CONTENT_CLEARANCE,
      // Section-to-section rhythm (name field vs. roster section vs. the
      // final actions block) — spacing.xl, distinct from the tighter
      // spacing.md/sm used within each of those sections below.
      gap: spacing.xl,
    },
    headerBlock: {
      gap: spacing.sm,
    },
    rosterSection: {
      gap: spacing.md,
    },
    actionsBlock: {
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowMain: {
      flex: 1,
      minHeight: touchTarget.min,
      justifyContent: 'center',
    },
    rowMainPressed: {
      opacity: 0.7,
    },
    itemGap: {
      height: spacing.sm,
    },
  });
}
