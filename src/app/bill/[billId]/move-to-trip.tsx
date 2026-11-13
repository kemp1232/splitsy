import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { TripMemberChoiceSheet } from '@/components/trip/TripMemberChoiceSheet';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { InlineError } from '@/components/ui/InlineError';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { copy } from '@/constants/copy';
import { billsRepository } from '@/db/repositories/bills.repository';
import { debtPaymentsRepository } from '@/db/repositories/debtPayments.repository';
import {
  participantsRepository,
  type Participant,
} from '@/db/repositories/participants.repository';
import {
  tripParticipantsRepository,
  type TripParticipant,
} from '@/db/repositories/tripParticipants.repository';
import {
  tripsRepository,
  type Trip,
  type TripWithBillCount,
} from '@/db/repositories/trips.repository';
import {
  MoveBillToTripError,
  mergeBillToTripMapping,
  validateBillToTripMapping,
  type BillToTripChoice,
  type BillToTripMapping,
} from '@/features/trips/buildBillToTripMapping';
import { formatTripBillCount } from '@/features/trips/formatTripBillCount';
import { moveBillToTrip } from '@/features/trips/trip.service';
import { goBackOrHome } from '@/lib/navigation';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

// Moves a standalone bill into a trip, in two pushed steps of this one route:
// without `tripId` it lists the trips to pick from; with `tripId` it asks who
// each of the bill's people is on that trip, then calls moveBillToTrip (which
// re-checks every guard inside its transaction — this screen's checks are
// only there to explain the situation up front).
type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  // The bill has bill-scoped paid marks — moving is blocked (not converted).
  | { kind: 'blocked' }
  // The bill is gone, already in a trip, or the trip is gone.
  | { kind: 'unavailable'; message: string }
  | { kind: 'pick'; trips: TripWithBillCount[] }
  | { kind: 'map'; trip: Trip; roster: TripParticipant[]; participants: Participant[] };

async function loadMoveState(billId: string, tripId: string | undefined): Promise<LoadState> {
  const [bill, paidMarks, participants] = await Promise.all([
    billsRepository.getById(billId),
    debtPaymentsRepository.listByBillId(billId),
    participantsRepository.listByBillId(billId),
  ]);
  if (!bill) return { kind: 'unavailable', message: copy.moveToTrip.staleState };
  if (bill.tripId !== null) return { kind: 'unavailable', message: copy.moveToTrip.alreadyInTrip };
  if (paidMarks.length > 0) return { kind: 'blocked' };

  if (!tripId) {
    return { kind: 'pick', trips: await tripsRepository.listAllWithBillCounts() };
  }

  const [trip, roster] = await Promise.all([
    tripsRepository.getById(tripId),
    tripParticipantsRepository.listByTripId(tripId),
  ]);
  if (!trip) return { kind: 'unavailable', message: copy.moveToTrip.staleState };
  return { kind: 'map', trip, roster, participants };
}

type TripChoiceRowProps = {
  entry: TripWithBillCount;
  onPress: (trip: Trip) => void;
  styles: ReturnType<typeof createStyles>;
  iconColor: string;
};

const TripChoiceRow = memo(function TripChoiceRow({
  entry,
  onPress,
  styles,
  iconColor,
}: TripChoiceRowProps) {
  const { trip, billCount } = entry;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(trip)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowText}>
        <AppText variant="cardTitle">{trip.name ?? copy.trip.unknownTripTitle}</AppText>
        <AppText variant="caption" color="textSecondary">
          {trip.status === 'SETTLED'
            ? `${formatTripBillCount(billCount)} · ${copy.trip.settledBadge}`
            : formatTripBillCount(billCount)}
        </AppText>
      </View>
      <Feather name="chevron-right" size={20} color={iconColor} />
    </Pressable>
  );
});

export default function MoveBillToTripScreen() {
  const router = useRouter();
  const { billId, tripId } = useLocalSearchParams<{ billId: string; tripId?: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [mapping, setMapping] = useState<BillToTripMapping>({});
  const [choosingFor, setChoosingFor] = useState<Participant | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const next = await loadMoveState(billId, tripId);
        if (!active) return;
        if (next.kind === 'map') {
          // First load: plain suggestions (merging into {}). A reload after a
          // failed move keeps the user's still-valid choices.
          setMapping((current) => mergeBillToTripMapping(current, next.participants, next.roster));
        }
        setState(next);
      } catch {
        if (active) setState({ kind: 'error' });
      }
    })();
    return () => {
      active = false;
    };
  }, [billId, tripId, reloadKey]);

  const handleTripPress = useCallback(
    (trip: Trip) => router.push(`/bill/${billId}/move-to-trip?tripId=${trip.id}`),
    [router, billId],
  );

  const renderTrip = useCallback(
    ({ item }: { item: TripWithBillCount }) => (
      <TripChoiceRow
        entry={item}
        onPress={handleTripPress}
        styles={styles}
        iconColor={colors.textSecondary}
      />
    ),
    [handleTripPress, styles, colors.textSecondary],
  );

  const goBack = useCallback(() => goBackOrHome(router), [router]);

  if (state.kind === 'loading') {
    return (
      <Screen tabBarHidden>
        <LoadingState />
      </Screen>
    );
  }

  if (state.kind === 'error') {
    return (
      <Screen tabBarHidden>
        <ErrorState
          heading={copy.global.genericErrorHeading}
          body={copy.global.genericErrorBody}
          retryLabel={copy.global.retryAction}
          onRetry={() => {
            setState({ kind: 'loading' });
            setReloadKey((key) => key + 1);
          }}
        />
      </Screen>
    );
  }

  if (state.kind === 'unavailable') {
    return (
      <Screen tabBarHidden>
        <ErrorState
          heading={copy.global.genericErrorHeading}
          body={state.message}
          retryLabel={copy.moveToTrip.backAction}
          onRetry={() => router.dismissTo('/')}
        />
      </Screen>
    );
  }

  if (state.kind === 'blocked') {
    return (
      <Screen tabBarHidden>
        <EmptyState
          heading={copy.moveToTrip.paidMarksBlockedHeading}
          body={copy.moveToTrip.paidMarksBlockedBody}
          actionLabel={copy.moveToTrip.backAction}
          onAction={goBack}
        />
      </Screen>
    );
  }

  if (state.kind === 'pick') {
    return (
      <Screen tabBarHidden padded={false}>
        <FlatList
          data={state.trips}
          keyExtractor={tripKeyExtractor}
          renderItem={renderTrip}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={ListGap}
          ListHeaderComponent={
            <ScreenHeader
              icon="briefcase"
              heading={copy.moveToTrip.pickTripHeading}
              body={copy.moveToTrip.pickTripBody}
            />
          }
          ListEmptyComponent={
            <EmptyState
              heading={copy.moveToTrip.noTripsHeading}
              body={copy.moveToTrip.noTripsBody}
              actionLabel={copy.moveToTrip.backAction}
              onAction={goBack}
            />
          }
        />
      </Screen>
    );
  }

  const { trip, roster, participants } = state;
  const rosterNameById = new Map(roster.map((member) => [member.id, member.name]));
  const tripTitle = trip.name ?? copy.trip.unknownTripTitle;

  function choiceLabel(choice: BillToTripChoice | undefined): string {
    if (choice?.kind === 'existing') {
      return copy.moveToTrip.mappedTo.replace(
        '{name}',
        () => rosterNameById.get(choice.tripParticipantId) ?? '',
      );
    }
    return copy.moveToTrip.addNewOption;
  }

  // Members matched to someone other than the participant being edited.
  const takenMemberIds = new Set<string>();
  for (const participant of participants) {
    const choice = mapping[participant.id];
    if (participant.id !== choosingFor?.id && choice?.kind === 'existing') {
      takenMemberIds.add(choice.tripParticipantId);
    }
  }

  function handleSelect(choice: BillToTripChoice) {
    const participant = choosingFor;
    setChoosingFor(null);
    if (!participant) return;
    setSubmitError(null);
    setMapping((current) => ({ ...current, [participant.id]: choice }));
  }

  async function handleConfirm() {
    if (submitInFlight.current) return;
    const validation = validateBillToTripMapping(participants, roster, mapping);
    if (!validation.valid) {
      const name =
        participants.find((participant) => participant.id === validation.participantId)?.name ?? '';
      // Function replacer, so a `$` in a typed name is never read as a
      // replacement pattern.
      if (validation.reason === 'invalidNewName') {
        setSubmitError(copy.moveToTrip.newNameOnTrip.replace('{name}', () => name));
      } else if (validation.reason === 'memberUsedTwice') {
        setSubmitError(copy.moveToTrip.memberUsedTwice.replace('{name}', () => name));
      } else {
        setSubmitError(copy.moveToTrip.invalidMapping);
      }
      return;
    }
    submitInFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await moveBillToTrip(billId, trip.id, mapping);
      // Back to Home first, so Back from the hub doesn't land on this
      // (now stale) move flow.
      router.dismissTo('/');
      router.push(`/trip/${trip.id}`);
    } catch (error) {
      if (error instanceof MoveBillToTripError) {
        if (error.reason === 'hasPaidMarks') {
          setState({ kind: 'blocked' });
        } else if (error.reason === 'alreadyInTrip') {
          setState({ kind: 'unavailable', message: copy.moveToTrip.alreadyInTrip });
        } else {
          // The bill's people or the trip's roster changed since this
          // screen loaded: reload, keeping every choice that's still valid
          // (mergeBillToTripMapping), and ask the user to review.
          setSubmitError(copy.moveToTrip.changedReview);
          setReloadKey((key) => key + 1);
        }
      } else {
        setSubmitError(copy.global.storageFailure);
      }
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Screen tabBarHidden scroll padded={false}>
      <View style={styles.body}>
        <ScreenHeader
          icon="users"
          heading={copy.moveToTrip.mapHeading}
          body={copy.moveToTrip.mapBody.replace('{trip}', () => tripTitle)}
        />

        <View style={styles.mapList}>
          {participants.map((participant) => (
            <Pressable
              key={participant.id}
              accessibilityRole="button"
              onPress={() => setChoosingFor(participant)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.rowText}>
                <AppText variant="cardTitle">{participant.name}</AppText>
                <AppText variant="caption" color="textSecondary">
                  {choiceLabel(mapping[participant.id])}
                </AppText>
              </View>
              <Feather name="chevron-down" size={20} color={colors.textSecondary} />
            </Pressable>
          ))}
        </View>

        {submitError !== null ? <InlineError message={submitError} /> : null}

        <AppButton
          label={copy.moveToTrip.confirmAction}
          onPress={handleConfirm}
          loading={submitting}
          disabled={submitting}
        />
      </View>

      <TripMemberChoiceSheet
        visible={choosingFor !== null}
        participantName={choosingFor?.name ?? ''}
        roster={roster}
        takenMemberIds={takenMemberIds}
        selected={choosingFor ? (mapping[choosingFor.id] ?? null) : null}
        onSelect={handleSelect}
        onCancel={() => setChoosingFor(null)}
      />
    </Screen>
  );
}

function tripKeyExtractor(entry: TripWithBillCount): string {
  return entry.trip.id;
}

function ListGap() {
  return <View style={gapStyles.gap} />;
}

const gapStyles = StyleSheet.create({
  gap: { height: spacing.sm },
});

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    body: {
      padding: spacing.xl20,
      gap: spacing.lg,
    },
    listContent: {
      padding: spacing.xl20,
    },
    mapList: {
      gap: spacing.sm,
    },
    row: {
      minHeight: touchTarget.preferred,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    pressed: {
      opacity: 0.7,
    },
  });
}
