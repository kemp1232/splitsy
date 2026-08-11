import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import {
  ParticipantEditorSheet,
  type ParticipantDraft,
} from '@/components/bill/ParticipantEditorSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { Divider } from '@/components/ui/Divider';
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
  normalizeParticipantName,
  QUICK_ADD_ME_NAME,
} from '@/features/participants/validateParticipantName';
import { nowIso } from '@/lib/date';
import { createId } from '@/lib/ids';
import { colors, radius, spacing, touchTarget } from '@/theme/tokens';

type LoadState = 'loading' | 'ready' | 'error';

export default function ParticipantsScreen() {
  const router = useRouter();
  const { billId } = useLocalSearchParams<{ billId: string }>();

  const [state, setState] = useState<LoadState>('loading');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [editingParticipant, setEditingParticipant] = useState<Participant | 'new' | null>(null);
  const [removingParticipant, setRemovingParticipant] = useState<Participant | null>(null);
  // One shared error slot for this screen's three write paths below (save,
  // quick-add, remove) rather than one state variable per handler — none of
  // them can fire at the same time as another (each is gated behind its own
  // sheet/dialog being open), so there is never a case where two would need
  // to be shown at once.
  const [actionError, setActionError] = useState<string | null>(null);

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

  async function refreshParticipants() {
    const rows = await participantsRepository.listByBillId(billId);
    setParticipants(rows);
  }

  async function handleSaveParticipant(draft: ParticipantDraft) {
    setActionError(null);
    try {
      const timestamp = nowIso();
      if (editingParticipant === 'new') {
        await participantsRepository.create({
          id: createId(),
          billId,
          sortOrder: participants.length,
          name: draft.name,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      } else if (editingParticipant) {
        await participantsRepository.update(editingParticipant.id, {
          name: draft.name,
          updatedAt: timestamp,
        });
      }
      setEditingParticipant(null);
      await refreshParticipants();
    } catch {
      setEditingParticipant(null);
      setActionError(copy.global.storageFailure);
    }
  }

  async function handleQuickAddMe() {
    setActionError(null);
    try {
      const timestamp = nowIso();
      await participantsRepository.create({
        id: createId(),
        billId,
        sortOrder: participants.length,
        name: QUICK_ADD_ME_NAME,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await refreshParticipants();
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
      removeParticipant(billId, removingParticipant.id);
      await refreshParticipants();
    } catch {
      setActionError(copy.global.storageFailure);
    }
  }

  if (state === 'loading') {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (state === 'error') {
    return (
      <Screen>
        <ErrorState
          heading={copy.global.genericErrorHeading}
          body={copy.global.genericErrorBody}
          retryLabel={copy.global.retryAction}
          onRetry={() => setState('loading')}
        />
      </Screen>
    );
  }

  const normalizedMeName = normalizeParticipantName(QUICK_ADD_ME_NAME);
  const meAlreadyExists = participants.some(
    (participant) => normalizeParticipantName(participant.name) === normalizedMeName,
  );
  const meetsMinimumParticipants = hasMinimumParticipants(participants.length);
  const editingParticipantId =
    editingParticipant && editingParticipant !== 'new' ? editingParticipant.id : null;
  const existingNamesForEditor = participants
    .filter((participant) => participant.id !== editingParticipantId)
    .map((participant) => participant.name);

  return (
    <Screen
      scroll
      padded={false}
      footer={
        <BottomActionBar>
          {!meetsMinimumParticipants ? (
            <InlineError message={copy.participants.minimumError} />
          ) : null}
          <AppButton
            label={copy.participants.continueButton}
            disabled={!meetsMinimumParticipants}
            onPress={() => router.push(`/bill/${billId}/assignments`)}
          />
        </BottomActionBar>
      }
    >
      <View style={styles.body}>
        <AppText variant="heading">{copy.participants.heading}</AppText>
        <AppText variant="body" color="textSecondary">
          {copy.participants.body}
        </AppText>

        {/* Shared by all three write paths (save/quick-add/remove) below —
            each closes its own sheet/dialog before this can ever render, so
            it's always visible here rather than hidden behind a modal. */}
        {actionError ? <InlineError message={actionError} /> : null}

        <AppButton
          variant="secondary"
          label={copy.participants.quickAddMe}
          disabled={meAlreadyExists}
          onPress={handleQuickAddMe}
        />

        <Divider />

        {participants.length === 0 ? (
          <EmptyState
            heading={copy.participants.emptyHeading}
            body={copy.participants.emptyBody}
            actionLabel={copy.participants.addAction}
            onAction={() => setEditingParticipant('new')}
          />
        ) : (
          <>
            <FlatList
              data={participants}
              keyExtractor={(participant) => participant.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.itemGap} />}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <Pressable
                    onPress={() => setEditingParticipant(item)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.rowMain, pressed && styles.rowMainPressed]}
                  >
                    <AppText variant="body" numberOfLines={1}>
                      {item.name}
                    </AppText>
                  </Pressable>
                  <IconButton
                    accessibilityLabel={copy.participants.removeConfirmHeading.replace(
                      '{name}',
                      item.name,
                    )}
                    onPress={() => setRemovingParticipant(item)}
                    icon={<AppText color="danger">✕</AppText>}
                  />
                </View>
              )}
            />
            <AppButton
              variant="secondary"
              label={copy.participants.addAction}
              onPress={() => setEditingParticipant('new')}
            />
          </>
        )}
      </View>

      <ParticipantEditorSheet
        visible={editingParticipant !== null}
        initial={
          editingParticipant && editingParticipant !== 'new'
            ? { name: editingParticipant.name }
            : null
        }
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

const styles = StyleSheet.create({
  body: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
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
