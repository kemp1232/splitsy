import Feather from '@expo/vector-icons/Feather';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import {
  ParticipantEditorSheet,
  type ParticipantDraft,
} from '@/components/bill/ParticipantEditorSheet';
import {
  SavedGroupEditorSheet,
  type SavedGroupDraft,
} from '@/components/settings/SavedGroupEditorSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { TAB_BAR_CONTENT_CLEARANCE } from '@/components/ui/BottomTabBar';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { GroupedCard, GroupedSeparator, SectionHeader } from '@/components/ui/GroupedSection';
import { IconButton } from '@/components/ui/IconButton';
import { InlineError } from '@/components/ui/InlineError';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { copy } from '@/constants/copy';
import {
  savedGroupsRepository,
  type SavedGroupWithMembers,
} from '@/db/repositories/savedGroups.repository';
import { savedPeopleRepository, type SavedPerson } from '@/db/repositories/savedPeople.repository';
import { diffGroupMembers } from '@/features/saved-people/savedPeopleSelection';
import { nowIso } from '@/lib/date';
import { createId } from '@/lib/ids';
import type { ColorTokens } from '@/theme/tokens';
import { spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type LoadState = 'loading' | 'ready' | 'error';

async function fetchSavedData(): Promise<{
  people: SavedPerson[];
  groups: SavedGroupWithMembers[];
}> {
  const [people, groups] = await Promise.all([
    savedPeopleRepository.listAll(),
    savedGroupsRepository.listWithMembers(),
  ]);
  // Alphabetical for management (suggestions use recency instead).
  return { people: [...people].sort((a, b) => a.name.localeCompare(b.name)), groups };
}

// Saved people & groups management (#6), opened from Settings. Rename and
// delete saved people; create, rename, edit members of and delete groups.
// Nothing here touches existing bills: bill participants are never linked
// to saved people.
export default function SavedPeopleScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [state, setState] = useState<LoadState>('loading');
  const [people, setPeople] = useState<SavedPerson[]>([]);
  const [groups, setGroups] = useState<SavedGroupWithMembers[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [renamingPerson, setRenamingPerson] = useState<SavedPerson | null>(null);
  const [deletingPerson, setDeletingPerson] = useState<SavedPerson | null>(null);
  // null: sheet closed; 'new': creating; otherwise the group being edited.
  const [editingGroup, setEditingGroup] = useState<SavedGroupWithMembers | 'new' | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<SavedGroupWithMembers | null>(null);

  // Bumped by the error state's Retry so the load effect runs again (same
  // pattern as participants.tsx).
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    const data = await fetchSavedData();
    setPeople(data.people);
    setGroups(data.groups);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [reloadKey, load]);

  // Shared by every write below: on failure show the storage error and
  // reload, so the lists always reflect what was actually saved.
  async function runWrite(write: () => Promise<void>) {
    setActionError(null);
    try {
      await write();
    } catch {
      setActionError(copy.global.storageFailure);
    }
    try {
      await load();
    } catch {
      setActionError(copy.global.storageFailure);
    }
  }

  // Hoisted, id-based row callbacks (list-performance rule).
  const handleRenamePerson = useCallback(
    (id: string) => setRenamingPerson(people.find((person) => person.id === id) ?? null),
    [people],
  );
  const handleDeletePerson = useCallback(
    (id: string) => setDeletingPerson(people.find((person) => person.id === id) ?? null),
    [people],
  );
  const handleEditGroup = useCallback(
    (id: string) => setEditingGroup(groups.find((entry) => entry.group.id === id) ?? null),
    [groups],
  );
  const handleDeleteGroup = useCallback(
    (id: string) => setDeletingGroup(groups.find((entry) => entry.group.id === id) ?? null),
    [groups],
  );

  function handleSaveRename(draft: ParticipantDraft) {
    const person = renamingPerson;
    setRenamingPerson(null);
    if (!person) return;
    void runWrite(() => savedPeopleRepository.rename(person.id, draft.name, nowIso()));
  }

  function handleConfirmDeletePerson() {
    const person = deletingPerson;
    setDeletingPerson(null);
    if (!person) return;
    void runWrite(() => savedPeopleRepository.remove(person.id));
  }

  // Not one transaction (native and web transaction APIs differ, see
  // itemAssignments.repository.web.ts): a failure part-way leaves a valid
  // but partly edited group, the error shows and the list reloads.
  function handleSaveGroup(draft: SavedGroupDraft) {
    const target = editingGroup;
    setEditingGroup(null);
    if (!target) return;
    void runWrite(async () => {
      const timestamp = nowIso();
      if (target === 'new') {
        const id = createId();
        await savedGroupsRepository.create({ id, name: draft.name, timestamp });
        try {
          await savedGroupsRepository.addMembers(id, draft.memberIds);
        } catch (error) {
          // Best-effort undo of the just-created group, so retrying with the
          // same name doesn't hit the duplicate-name error.
          await savedGroupsRepository.remove(id).catch(() => {});
          throw error;
        }
        return;
      }
      const groupId = target.group.id;
      if (draft.name !== target.group.name) {
        await savedGroupsRepository.rename(groupId, draft.name, timestamp);
      }
      const { added, removed } = diffGroupMembers(target.memberIds, draft.memberIds);
      await savedGroupsRepository.addMembers(groupId, added);
      await savedGroupsRepository.removeMembers(groupId, removed);
    });
  }

  function handleConfirmDeleteGroup() {
    const entry = deletingGroup;
    setDeletingGroup(null);
    if (!entry) return;
    void runWrite(() => savedGroupsRepository.remove(entry.group.id));
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
          onRetry={() => {
            setState('loading');
            setReloadKey((key) => key + 1);
          }}
        />
      </Screen>
    );
  }

  const renamingId = renamingPerson ? renamingPerson.id : null;
  const otherPeopleNames = people
    .filter((person) => person.id !== renamingId)
    .map((person) => person.name);
  const editingGroupId =
    editingGroup !== null && editingGroup !== 'new' ? editingGroup.group.id : null;
  const otherGroupNames = groups
    .filter((entry) => entry.group.id !== editingGroupId)
    .map((entry) => entry.group.name);

  return (
    <Screen scroll>
      <View style={styles.body}>
        <ScreenHeader icon="users" heading={copy.savedPeople.heading} body={copy.savedPeople.body}>
          {actionError ? <InlineError message={actionError} /> : null}
        </ScreenHeader>

        <View style={styles.section}>
          <SectionHeader
            title={copy.savedPeople.groupsSection.replace('{count}', String(groups.length))}
            caption={copy.savedPeople.groupsCaption}
            action={
              <AppButton
                variant="secondary"
                label={copy.savedPeople.newGroupAction}
                icon={(color) => <Feather name="plus" size={18} color={color} />}
                onPress={() => setEditingGroup('new')}
              />
            }
          />
          {groups.length > 0 ? (
            <GroupedCard>
              <FlatList
                data={groups}
                keyExtractor={(entry) => entry.group.id}
                scrollEnabled={false}
                ItemSeparatorComponent={GroupedSeparator}
                renderItem={({ item }) => (
                  <GroupRow entry={item} onEdit={handleEditGroup} onDelete={handleDeleteGroup} />
                )}
              />
            </GroupedCard>
          ) : null}
        </View>

        <View style={styles.section}>
          <SectionHeader
            title={copy.savedPeople.peopleSection.replace('{count}', String(people.length))}
          />
          {people.length === 0 ? (
            <EmptyState heading={copy.savedPeople.emptyHeading} body={copy.savedPeople.emptyBody} />
          ) : (
            <GroupedCard>
              <FlatList
                data={people}
                keyExtractor={(person) => person.id}
                scrollEnabled={false}
                ItemSeparatorComponent={GroupedSeparator}
                renderItem={({ item }) => (
                  <PersonRow
                    person={item}
                    onRename={handleRenamePerson}
                    onDelete={handleDeletePerson}
                  />
                )}
              />
            </GroupedCard>
          )}
        </View>
      </View>

      <ParticipantEditorSheet
        visible={renamingPerson !== null}
        initial={renamingPerson ? { name: renamingPerson.name } : null}
        existingNames={otherPeopleNames}
        duplicateNameError={copy.savedPeople.duplicateNameError}
        onSave={handleSaveRename}
        onCancel={() => setRenamingPerson(null)}
      />

      <SavedGroupEditorSheet
        visible={editingGroup !== null}
        initial={
          editingGroup !== null && editingGroup !== 'new'
            ? { name: editingGroup.group.name, memberIds: editingGroup.memberIds }
            : null
        }
        savedPeople={people}
        existingGroupNames={otherGroupNames}
        onSave={handleSaveGroup}
        onCancel={() => setEditingGroup(null)}
      />

      <ConfirmationDialog
        visible={deletingPerson !== null}
        heading={copy.savedPeople.deletePersonHeading.replace(
          '{name}',
          () => deletingPerson?.name ?? '',
        )}
        body={copy.savedPeople.deletePersonBody}
        confirmLabel={copy.savedPeople.deleteAction}
        cancelLabel={copy.global.cancelAction}
        destructive
        onConfirm={handleConfirmDeletePerson}
        onCancel={() => setDeletingPerson(null)}
      />

      <ConfirmationDialog
        visible={deletingGroup !== null}
        heading={copy.savedPeople.deleteGroupHeading.replace(
          '{name}',
          () => deletingGroup?.group.name ?? '',
        )}
        body={copy.savedPeople.deleteGroupBody}
        confirmLabel={copy.savedPeople.deleteAction}
        cancelLabel={copy.global.cancelAction}
        destructive
        onConfirm={handleConfirmDeleteGroup}
        onCancel={() => setDeletingGroup(null)}
      />
    </Screen>
  );
}

type PersonRowProps = {
  person: SavedPerson;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
};

const PersonRow = memo(function PersonRow({ person, onRename, onDelete }: PersonRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onRename(person.id)}
        accessibilityRole="button"
        accessibilityLabel={copy.savedPeople.renamePersonAccessibilityLabel.replace(
          '{name}',
          () => person.name,
        )}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
      >
        <AppText numberOfLines={1}>{person.name}</AppText>
      </Pressable>
      <IconButton
        accessibilityLabel={copy.savedPeople.deleteAccessibilityLabel.replace(
          '{name}',
          () => person.name,
        )}
        onPress={() => onDelete(person.id)}
        icon={<Feather name="trash" size={20} color={colors.danger} />}
      />
    </View>
  );
});

type GroupRowProps = {
  entry: SavedGroupWithMembers;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
};

const GroupRow = memo(function GroupRow({ entry, onEdit, onDelete }: GroupRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const count = entry.memberIds.length;
  const caption =
    count === 0
      ? copy.savedPeople.groupNoMembers
      : count === 1
        ? copy.savedPeople.groupMemberCountSingular
        : copy.savedPeople.groupMemberCount.replace('{count}', String(count));
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onEdit(entry.group.id)}
        accessibilityRole="button"
        accessibilityLabel={`${copy.savedPeople.editGroupAccessibilityLabel.replace(
          '{name}',
          () => entry.group.name,
        )}, ${caption}`}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
      >
        <AppText numberOfLines={1}>{entry.group.name}</AppText>
        <AppText variant="caption" color="textSecondary">
          {caption}
        </AppText>
      </Pressable>
      <IconButton
        accessibilityLabel={copy.savedPeople.deleteAccessibilityLabel.replace(
          '{name}',
          () => entry.group.name,
        )}
        onPress={() => onDelete(entry.group.id)}
        icon={<Feather name="trash" size={20} color={colors.danger} />}
      />
    </View>
  );
});

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    body: {
      gap: spacing.lg,
      // Clears the persistent tab bar floating over this screen (same as
      // settings.tsx).
      paddingBottom: TAB_BAR_CONTENT_CLEARANCE,
    },
    section: {
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.xs,
      paddingLeft: spacing.md,
      paddingRight: spacing.xs,
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
