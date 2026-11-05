import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  PARTICIPANT_NAME_ERROR_BY_REASON,
  ParticipantEditorSheet,
  type ParticipantDraft,
} from '@/components/bill/ParticipantEditorSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { InlineError } from '@/components/ui/InlineError';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import type { Participant } from '@/db/repositories/participants.repository';
import { participantsRepository } from '@/db/repositories/participants.repository';
import { removeParticipant } from '@/features/bills/bill.service';
import { hasMinimumParticipants } from '@/features/participants/hasMinimumParticipants';
import {
  MAX_PARTICIPANT_NAME_LENGTH,
  normalizeParticipantName,
  resolveQuickAddMeName,
  validateParticipantName,
} from '@/features/participants/validateParticipantName';
import { authClient } from '@/lib/authClient';
import { nowIso } from '@/lib/date';
import { createId } from '@/lib/ids';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type LoadState = 'loading' | 'ready' | 'error';

export default function ParticipantsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: session } = authClient.useSession();
  const meName = resolveQuickAddMeName(session?.user.name);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { billId } = useLocalSearchParams<{ billId: string }>();

  const [state, setState] = useState<LoadState>('loading');
  const [participants, setParticipants] = useState<Participant[]>([]);
  // The sheet is edit-only now — new people are added via the inline field.
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [removingParticipant, setRemovingParticipant] = useState<Participant | null>(null);
  // One shared error slot for this screen's three write paths below (save,
  // quick-add, remove) rather than one state variable per handler — none of
  // them can fire at the same time as another (each is gated behind its own
  // sheet/dialog being open), so there is never a case where two would need
  // to be shown at once.
  const [actionError, setActionError] = useState<string | null>(null);
  // Inline "Add a name" field — always visible; submitting adds the person,
  // clears the field and keeps it focused (submitBehavior="submit").
  const [newName, setNewName] = useState('');
  const [newNameError, setNewNameError] = useState<string | null>(null);
  // In-flight guard for inline adds — a ref, not state, so a rapid double
  // submit (before the next render) can't slip past it and add twice.
  const addingRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const rows = await participantsRepository.listByBillId(billId);
        setParticipants(rows);
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [billId]);

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }

  async function refreshParticipants() {
    const rows = await participantsRepository.listByBillId(billId);
    setParticipants(rows);
  }

  // The one create path for a new participant — shared by the inline
  // "Add a name" field and "Add me".
  async function createParticipant(name: string) {
    const timestamp = nowIso();
    await participantsRepository.create({
      id: createId(),
      billId,
      sortOrder: participants.length,
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await refreshParticipants();
  }

  async function handleSaveParticipant(draft: ParticipantDraft) {
    setActionError(null);
    try {
      if (editingParticipant) {
        await participantsRepository.update(editingParticipant.id, {
          name: draft.name,
          updatedAt: nowIso(),
        });
      }
      setEditingParticipant(null);
      await refreshParticipants();
    } catch {
      setEditingParticipant(null);
      setActionError(copy.global.storageFailure);
    }
  }

  // Adds whatever is typed in the inline field. Resolves true when there was
  // nothing to add or it was added; false when validation or storage failed
  // (the error is shown) or another add is still in flight.
  async function addTypedName(): Promise<boolean> {
    // A blank field is nothing to add (keeps focus, no error) — the field is
    // always visible, so pressing return on it empty isn't a mistake.
    if (!newName.trim()) return true;
    if (addingRef.current) return false;
    const result = validateParticipantName(
      newName,
      participants.map((participant) => participant.name),
    );
    if (!result.valid) {
      setNewNameError(PARTICIPANT_NAME_ERROR_BY_REASON[result.reason]);
      return false;
    }
    setNewNameError(null);
    setActionError(null);
    addingRef.current = true;
    try {
      await createParticipant(result.name);
      setNewName('');
      return true;
    } catch {
      setActionError(copy.global.storageFailure);
      return false;
    } finally {
      addingRef.current = false;
    }
  }

  async function handleInlineAdd() {
    await addTypedName();
  }

  // A typed-but-unsubmitted name is added first rather than silently
  // dropped; if it can't be (e.g. duplicate), its error shows and we stay.
  async function handleContinue() {
    if (await addTypedName()) router.push(`/bill/${billId}/assignments`);
  }

  function handleNewNameChange(text: string) {
    setNewName(text);
    if (newNameError) setNewNameError(null);
  }

  async function handleQuickAddMe() {
    setActionError(null);
    try {
      await createParticipant(meName);
    } catch {
      setActionError(copy.global.storageFailure);
    }
  }

  async function handleConfirmRemove() {
    if (!removingParticipant) return;
    setRemovingParticipant(null);
    setActionError(null);
    try {
      // Not a plain participantsRepository.remove() — this also repairs any
      // CUSTOM adjustment that referenced the removed participant so it can't
      // be left permanently unbalanced (spec 10.7 invariant, see bill.service.ts).
      await removeParticipant(billId, removingParticipant.id);
      await refreshParticipants();
    } catch {
      setActionError(copy.global.storageFailure);
    }
  }

  if (state === 'loading') {
    return (
      <Screen tabBarHidden>
        <LoadingState />
      </Screen>
    );
  }

  if (state === 'error') {
    return (
      <Screen tabBarHidden>
        <ErrorState
          heading={copy.global.genericErrorHeading}
          body={copy.global.genericErrorBody}
          retryLabel={copy.global.retryAction}
          onRetry={() => setState('loading')}
        />
      </Screen>
    );
  }

  const normalizedMeName = normalizeParticipantName(meName);
  const meAlreadyExists = participants.some(
    (participant) => normalizeParticipantName(participant.name) === normalizedMeName,
  );
  const meetsMinimumParticipants = hasMinimumParticipants(participants.length);
  const editingParticipantId = editingParticipant ? editingParticipant.id : null;
  const existingNamesForEditor = participants
    .filter((participant) => participant.id !== editingParticipantId)
    .map((participant) => participant.name);

  const isEmpty = participants.length === 0;
  const countText = String(participants.length);

  return (
    // "handled": with the inline name field focused, the first tap on "+",
    // Continue, Add me or a row acts instead of only dismissing the keyboard.
    <Screen tabBarHidden scroll padded={false} keyboardShouldPersistTaps="handled">
      <View style={styles.body}>
        <View style={styles.headerBlock}>
          <View style={styles.headingRow}>
            <IconButton
              accessibilityLabel={copy.participants.backAccessibilityLabel}
              onPress={handleBack}
              icon={<Feather name="arrow-left" size={22} color={colors.textPrimary} />}
            />
            <Feather name="users" size={24} color={colors.primary} />
            <AppText variant="heading" style={styles.headingText} accessibilityRole="header">
              {copy.participants.heading}
            </AppText>
          </View>
          <AppText variant="body" color="textSecondary" style={styles.uniformText}>
            {copy.participants.body}
          </AppText>

          {/* Shared by all three write paths (save/quick-add/remove) below —
              each closes its own sheet/dialog before this can ever render, so
              it's always visible here rather than hidden behind a modal. */}
          {actionError ? <InlineError message={actionError} /> : null}
        </View>

        <AppTextInput
          value={newName}
          onChangeText={handleNewNameChange}
          placeholder={copy.participants.inlineAddPlaceholder}
          accessibilityLabel={copy.participants.inlineAddPlaceholder}
          maxLength={MAX_PARTICIPANT_NAME_LENGTH}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={handleInlineAdd}
          error={newNameError ?? undefined}
          trailingIcon={(color) => (
            <Pressable
              onPress={handleInlineAdd}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={copy.participants.addAction}
            >
              <Feather name="plus-circle" size={20} color={color} />
            </Pressable>
          )}
        />

        <View style={styles.sectionCard}>
          {isEmpty ? (
            <EmptyState
              heading={copy.participants.emptyHeading}
              body={copy.participants.emptyBody}
            />
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <AppText
                  variant="subheading"
                  style={styles.sectionTitle}
                  accessibilityRole="header"
                  accessibilityLabel={copy.participants.sectionAccessibilityLabel.replace(
                    '{count}',
                    countText,
                  )}
                >
                  {copy.participants.sectionWithCount.replace('{count}', countText)}
                </AppText>
              </View>
              {participants.map((item) => (
                <View key={item.id} style={styles.row}>
                  <View style={styles.avatarCircle} accessibilityElementsHidden>
                    <Feather name="user" size={18} color={colors.primary} />
                  </View>
                  <Pressable
                    onPress={() => setEditingParticipant(item)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
                  >
                    <AppText variant="body" numberOfLines={1} style={styles.uniformText}>
                      {item.name}
                    </AppText>
                  </Pressable>
                  <IconButton
                    accessibilityLabel={copy.participants.removeAccessibilityLabel.replace(
                      '{name}',
                      item.name,
                    )}
                    onPress={() => setRemovingParticipant(item)}
                    icon={<Feather name="trash" size={20} color={colors.danger} />}
                  />
                </View>
              ))}
            </>
          )}
        </View>

        {!meAlreadyExists ? (
          <AppButton
            variant="secondary"
            label={copy.participants.quickAddMe}
            icon={(color) => <Feather name="plus-circle" size={18} color={color} />}
            onPress={handleQuickAddMe}
          />
        ) : null}

        {/* Was a sticky BottomActionBar footer — moved inline, per the
            user's own explicit request (2026-08-27) to drop sticky nav
            footers in favor of plain in-flow buttons. */}
        <View style={styles.continueBlock}>
          {!meetsMinimumParticipants ? (
            <InlineError message={copy.participants.minimumError} />
          ) : null}
          <AppButton
            label={copy.participants.continueButton}
            disabled={!meetsMinimumParticipants}
            icon={(color) => <Feather name="arrow-right-circle" size={18} color={color} />}
            iconPosition="trailing"
            onPress={handleContinue}
          />
        </View>
      </View>

      <ParticipantEditorSheet
        visible={editingParticipant !== null}
        initial={editingParticipant ? { name: editingParticipant.name } : null}
        existingNames={existingNamesForEditor}
        onSave={handleSaveParticipant}
        onCancel={() => setEditingParticipant(null)}
      />

      <ConfirmationDialog
        visible={removingParticipant !== null}
        heading={copy.participants.removeConfirmHeading.replace(
          '{name}',
          removingParticipant?.name ?? '',
        )}
        body={copy.participants.removeConfirmBody}
        confirmLabel={copy.participants.removeAction}
        cancelLabel={copy.global.cancelAction}
        destructive
        onConfirm={handleConfirmRemove}
        onCancel={() => setRemovingParticipant(null)}
      />
    </Screen>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    // Every AppText on this screen renders at this one uniform size — matches
    // the `caption` variant's own size exactly. `variant="heading"`/
    // `"subheading"` still carry their bold font-weight, which is now the
    // only thing distinguishing a heading from body text.
    uniformText: {
      fontSize: 14,
      lineHeight: 19,
    },
    body: {
      padding: spacing.lg,
      // Section-to-section rhythm (headerBlock / roster list / continue
      // block): spacing.xl between each distinct block, spacing.md/sm
      // within one — see each block's own style below.
      gap: spacing.xl,
      // No tab-bar clearance: the global BottomTabBar is hidden on /bill/**.
    },
    headerBlock: {
      gap: spacing.md,
    },
    headingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    headingText: {
      flex: 1,
    },
    sectionCard: {
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingLeft: spacing.md,
      paddingRight: spacing.sm,
      // Was sized by the (removed) "Add person" button beside the title.
      minHeight: touchTarget.min,
    },
    sectionTitle: {
      flexShrink: 1,
    },
    continueBlock: {
      gap: spacing.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.xs,
      paddingLeft: spacing.md,
      paddingRight: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    // Same treatment as Home's own avatar circle (src/app/index.tsx).
    avatarCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderCurve: 'continuous',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowMain: {
      flex: 1,
      minHeight: touchTarget.min,
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.7,
    },
  });
}
