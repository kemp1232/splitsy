import { useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountInput } from '@/components/ui/AmountInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { InlineError } from '@/components/ui/InlineError';
import { useSlideUpAnimation } from '@/components/ui/useSlideUpAnimation';
import { copy } from '@/constants/copy';
import type { AdjustmentAllocation } from '@/db/repositories/adjustmentAllocations.repository';
import type { Participant } from '@/db/repositories/participants.repository';
import {
  ADJUSTMENT_PRESETS,
  applyAdjustmentPreset,
  type AdjustmentPreset,
  type AdjustmentPresetId,
} from '@/features/adjustments/adjustmentPresets';
import { adjustmentAmountSign } from '@/features/adjustments/adjustmentSign';
import {
  defaultAllocationMethodForType,
  type AdjustmentType,
  type AllocationMethod,
} from '@/features/adjustments/defaultAllocationMethod';
import { isValidAdjustmentAmount } from '@/features/adjustments/validateAdjustmentAmount';
import { hasMinimumParticipants } from '@/features/participants/hasMinimumParticipants';
import { validateCustomAllocation } from '@/features/splitting/allocation';
import { formatCentavos } from '@/lib/money';
import type { ColorTokens } from '@/theme/tokens';
import { CONTENT_MAX_WIDTH, radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export type AdjustmentDraft = {
  type: AdjustmentType;
  label: string;
  // Already signed — negative for a discount (spec 10.2). This sheet is the
  // only place that decides the sign; every other consumer just stores/reads
  // it as-is.
  amountCentavos: number;
  allocationMethod: AllocationMethod;
  // Present only when allocationMethod is 'CUSTOM' (spec 9.6) — already
  // signed to match amountCentavos and already validated to balance exactly.
  customAllocations?: { participantId: string; amountCentavos: number }[];
};

export type AdjustmentEditorInitial = {
  type: AdjustmentType;
  label: string;
  amountCentavos: number;
  allocationMethod: AllocationMethod;
};

type Props = {
  visible: boolean;
  initial: AdjustmentEditorInitial | null; // null = adding a new adjustment
  // Existing CUSTOM allocations for this adjustment, if any — ignored unless
  // initial.allocationMethod is 'CUSTOM'. Always [] when adding a new one.
  initialCustomAllocations: AdjustmentAllocation[];
  // Every participant on the bill, in stable sortOrder — used to render one
  // custom-amount field per person.
  participants: Participant[];
  onSave: (draft: AdjustmentDraft) => void;
  onDelete?: () => void;
  onCancel: () => void;
};

const MAX_LABEL_LENGTH = 80;

const TYPE_OPTIONS: { value: AdjustmentType; label: string }[] = [
  { value: 'TAX', label: copy.adjustmentEditor.typeTax },
  { value: 'SERVICE_CHARGE', label: copy.adjustmentEditor.typeService },
  { value: 'TIP', label: copy.adjustmentEditor.typeTip },
  { value: 'DISCOUNT', label: copy.adjustmentEditor.typeDiscount },
  { value: 'OTHER', label: copy.adjustmentEditor.typeOther },
];

const TYPE_LABELS: Record<AdjustmentType, string> = {
  TAX: copy.adjustmentEditor.typeTax,
  SERVICE_CHARGE: copy.adjustmentEditor.typeService,
  TIP: copy.adjustmentEditor.typeTip,
  DISCOUNT: copy.adjustmentEditor.typeDiscount,
  OTHER: copy.adjustmentEditor.typeOther,
};

const ALLOCATION_OPTIONS: { value: AllocationMethod; label: string; detail: string }[] = [
  {
    value: 'PROPORTIONAL',
    label: copy.adjustments.allocationProportional,
    detail: copy.adjustments.allocationProportionalDetail,
  },
  {
    value: 'EQUAL',
    label: copy.adjustments.allocationEqual,
    detail: copy.adjustments.allocationEqualDetail,
  },
  {
    value: 'CUSTOM',
    label: copy.adjustments.allocationCustom,
    detail: copy.adjustments.allocationCustomDetail,
  },
];

export function AdjustmentEditorSheet({
  visible,
  initial,
  initialCustomAllocations,
  participants,
  onSave,
  onDelete,
  onCancel,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const translateY = useSlideUpAnimation(visible);
  const [type, setType] = useState<AdjustmentType>(initial?.type ?? 'TAX');
  const [label, setLabel] = useState(initial?.label ?? '');
  // The field always holds a non-negative magnitude — DISCOUNT's negative
  // sign (spec 10.2), and an existing negative adjustment's (adjustmentSign.ts),
  // is applied on save, not while typing. This keeps
  // AmountInput itself untouched (digits/decimal only) rather than teaching
  // it a minus-sign syntax that every other caller would also have to guard
  // against.
  const [amountMagnitudeCentavos, setAmountMagnitudeCentavos] = useState(
    Math.abs(initial?.amountCentavos ?? 0),
  );
  const [allocationMethod, setAllocationMethod] = useState<AllocationMethod>(
    initial?.allocationMethod ?? defaultAllocationMethodForType(type),
  );
  // Once true, changing `type` never touches `allocationMethod` again (spec
  // F-014: the per-type default only applies "unless changed"). Editing an
  // existing adjustment starts already-touched, since its allocation method
  // was already a deliberate choice (the user's, or a prior default they kept).
  const [allocationMethodTouched, setAllocationMethodTouched] = useState(initial !== null);
  const [customMagnitudesByParticipantId, setCustomMagnitudesByParticipantId] = useState<
    Record<string, number>
  >({});
  const [amountError, setAmountError] = useState<string | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);
  // Which quick-fill preset (new adjustments only) was last tapped — drives
  // its helper line. Never saved.
  const [appliedPresetId, setAppliedPresetId] = useState<AdjustmentPresetId | null>(null);
  // True while the allocation method is still the one the preset picked (not
  // one the user chose themselves) — so switching the type away from the
  // preset's can undo it.
  const [allocationSetByPreset, setAllocationSetByPreset] = useState(false);
  // -1 for DISCOUNT and for an existing negative adjustment whose type is
  // unchanged (adjustmentSign.ts).
  const amountSign = adjustmentAmountSign(type, initial);
  // Custom amounts need people to split between — on receipt-review.tsx (which
  // comes before the participants step) there may be none yet, so the option
  // is hidden there. An adjustment already saved as CUSTOM keeps it, so it
  // stays editable either way.
  const allocationOptions =
    hasMinimumParticipants(participants.length) || initial?.allocationMethod === 'CUSTOM'
      ? ALLOCATION_OPTIONS
      : ALLOCATION_OPTIONS.filter((option) => option.value !== 'CUSTOM');
  const customAllocationAvailable = allocationOptions.some((option) => option.value === 'CUSTOM');

  // Re-seeds local state every time the sheet opens (mirrors
  // LineItemEditorSheet / ParticipantEditorSheet), so reopening for a
  // different adjustment — or switching from editing to adding — always
  // starts clean.
  function handleShow() {
    const nextType = initial?.type ?? 'TAX';
    setType(nextType);
    setLabel(initial?.label ?? '');
    setAmountMagnitudeCentavos(Math.abs(initial?.amountCentavos ?? 0));
    setAllocationMethod(initial?.allocationMethod ?? defaultAllocationMethodForType(nextType));
    setAllocationMethodTouched(initial !== null);
    const magnitudes: Record<string, number> = {};
    for (const participant of participants) {
      const existing = initialCustomAllocations.find(
        (allocation) => allocation.participantId === participant.id,
      );
      magnitudes[participant.id] = Math.abs(existing?.amountCentavos ?? 0);
    }
    setCustomMagnitudesByParticipantId(magnitudes);
    setAmountError(null);
    setCustomError(null);
    setAppliedPresetId(null);
    setAllocationSetByPreset(false);
  }

  // Pre-fills type, label and split only — never the amount (the user types
  // the receipt's figure) and never saves.
  function handlePresetPress(preset: AdjustmentPreset) {
    const applied = applyAdjustmentPreset(preset, { customAllocationAvailable });
    setType(applied.type);
    setLabel(applied.label);
    setAllocationMethod(applied.allocationMethod);
    if (applied.allocationMethod === 'CUSTOM') {
      setAllocationMethodTouched(true);
    }
    setCustomError(null);
    setAppliedPresetId(preset.id);
    setAllocationSetByPreset(true);
  }

  function handleTypeChange(nextType: AdjustmentType) {
    let allocationTouched = allocationMethodTouched;
    // Switching away from the preset's type undoes what the preset filled in
    // (its label and split) — otherwise e.g. a Tax could be saved named
    // "Senior/PWD discount" with the preset's Custom split. A label or split
    // the user changed themselves is left alone.
    const appliedPreset =
      appliedPresetId === null
        ? undefined
        : ADJUSTMENT_PRESETS.find((preset) => preset.id === appliedPresetId);
    if (appliedPreset && nextType !== appliedPreset.type) {
      if (label.trim().toLowerCase() === appliedPreset.label.toLowerCase()) {
        setLabel('');
      }
      if (allocationSetByPreset) {
        allocationTouched = false;
        setAllocationMethodTouched(false);
      }
      setAllocationSetByPreset(false);
      setAppliedPresetId(null);
    }
    // A label that's just the previous type's default name (what handleSave
    // fills in for a blank label, or what OCR detected) would otherwise stick
    // after a type switch — e.g. a "Discount" that now adds to the bill.
    // Clearing it lets handleSave fall back to the new type's name.
    if (label.trim().toLowerCase() === TYPE_LABELS[type].toLowerCase()) {
      setLabel('');
    }
    setType(nextType);
    if (!allocationTouched) {
      setAllocationMethod(defaultAllocationMethodForType(nextType));
    }
  }

  function handleAllocationMethodChange(next: AllocationMethod) {
    setAllocationMethod(next);
    setAllocationMethodTouched(true);
    setAllocationSetByPreset(false);
    setCustomError(null);
  }

  function handleCustomMagnitudeChange(participantId: string, magnitude: number) {
    setCustomMagnitudesByParticipantId((previous) => ({ ...previous, [participantId]: magnitude }));
    setCustomError(null);
  }

  function handleSave() {
    // Covers both "non-zero" (spec 20.1's "Invalid adjustment" case) and,
    // via isSafeCentavos, spec 10.1's "reject NaN, infinity, and values
    // outside configured safe limits" — an explicit check at the validation
    // layer rather than relying only on AmountInput's own input pattern to
    // keep amounts in range.
    if (!isValidAdjustmentAmount(amountMagnitudeCentavos)) {
      setAmountError(copy.adjustmentEditor.invalidAmount);
      return;
    }
    setAmountError(null);

    const signedAmountCentavos = amountSign * amountMagnitudeCentavos;
    const trimmedLabel = label.trim().slice(0, MAX_LABEL_LENGTH) || TYPE_LABELS[type];

    if (allocationMethod !== 'CUSTOM') {
      setCustomError(null);
      onSave({
        type,
        label: trimmedLabel,
        amountCentavos: signedAmountCentavos,
        allocationMethod,
      });
      return;
    }

    const sign = signedAmountCentavos < 0 ? -1 : 1;
    const customAllocations = participants.map((participant) => ({
      participantId: participant.id,
      amountCentavos: (customMagnitudesByParticipantId[participant.id] ?? 0) * sign,
    }));

    const validation = validateCustomAllocation(
      signedAmountCentavos,
      customAllocations.map((allocation) => allocation.amountCentavos),
    );
    if (!validation.valid) {
      setCustomError(
        validation.reason === 'sumMismatch'
          ? copy.adjustmentEditor.customMismatch.replace(
              '{amount}',
              formatCentavos(signedAmountCentavos),
            )
          : copy.adjustmentEditor.customSignMismatchError,
      );
      return;
    }

    setCustomError(null);
    onSave({
      type,
      label: trimmedLabel,
      amountCentavos: signedAmountCentavos,
      allocationMethod,
      customAllocations,
    });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onShow={handleShow}
      onRequestClose={onCancel}
    >
      {/* Tapping the dimmed area outside the sheet dismisses it, same as
          Cancel — see BillOverflowSheet's identical treatment for why the
          inner Pressable needs its own no-op onPress and why the Modal's own
          animation is off in favor of useSlideUpAnimation. */}
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* The highest-risk of the three editor sheets for this: it has its
            own internal ScrollView (custom per-participant amounts) with
            Save/Cancel/Delete pinned outside it, so without this the keyboard
            can cover those actions entirely, not just push them slightly out
            of reach. Same reasoning as ParticipantEditorSheet/
            LineItemEditorSheet's own KeyboardAvoidingView otherwise — a
            Modal's content isn't a descendant of Screen.tsx's (spec section 17). */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.avoidingView}
        >
          {/* `sheetMaxHeight` (not on `sheet` below) — see
              ParticipantPickerSheet.tsx's identical note: a percentage
              maxHeight needs to resolve against this Animated.View's real
              parent size, not against `sheet`'s own content-based size. */}
          <Animated.View style={[styles.sheetMaxHeight, { transform: [{ translateY }] }]}>
            <Pressable
              style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}
              onPress={() => {}}
            >
              <AppText variant="subheading">
                {initial ? copy.adjustmentEditor.editHeading : copy.adjustmentEditor.addHeading}
              </AppText>

            <ScrollView style={styles.scroll}>
              <View style={styles.scrollContent}>
                {initial === null ? (
                  <View style={styles.field}>
                    <AppText variant="caption" color="textSecondary">
                      {copy.adjustmentEditor.presetsLabel}
                    </AppText>
                    <View style={styles.chipWrap}>
                      {ADJUSTMENT_PRESETS.map((preset) => (
                        <PresetChip
                          key={preset.id}
                          label={preset.chipLabel}
                          onPress={() => handlePresetPress(preset)}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={styles.field}>
                  <AppText variant="caption" color="textSecondary">
                    {copy.adjustmentEditor.typeLabel}
                  </AppText>
                  <View style={styles.chipWrap} accessibilityRole="radiogroup">
                    {TYPE_OPTIONS.map((option) => (
                      <TypeChip
                        key={option.value}
                        label={option.label}
                        selected={type === option.value}
                        onPress={() => handleTypeChange(option.value)}
                      />
                    ))}
                  </View>
                </View>

                <AppTextInput
                  label={copy.adjustmentEditor.labelField}
                  placeholder={copy.adjustmentEditor.labelPlaceholder}
                  value={label}
                  onChangeText={setLabel}
                  maxLength={MAX_LABEL_LENGTH}
                />

                <AmountInput
                  label={copy.adjustmentEditor.amountField}
                  valueCentavos={amountMagnitudeCentavos}
                  onChangeCentavos={setAmountMagnitudeCentavos}
                  error={amountError ?? undefined}
                />
                {type === 'DISCOUNT' ? (
                  <AppText variant="caption" color="textSecondary">
                    {copy.adjustmentEditor.discountHelper}
                  </AppText>
                ) : null}
                {appliedPresetId === 'SENIOR_PWD_DISCOUNT' &&
                type === 'DISCOUNT' &&
                allocationMethod === 'CUSTOM' ? (
                  <AppText variant="caption" color="textSecondary">
                    {copy.adjustmentEditor.presetSeniorPwdHelper}
                  </AppText>
                ) : null}
                {appliedPresetId === 'SENIOR_PWD_DISCOUNT' &&
                type === 'DISCOUNT' &&
                !customAllocationAvailable ? (
                  <AppText variant="caption" color="textSecondary">
                    {copy.adjustmentEditor.presetSeniorPwdNoParticipantsHelper}
                  </AppText>
                ) : null}
                {type !== 'DISCOUNT' && amountSign < 0 ? (
                  <AppText variant="caption" color="textSecondary">
                    {copy.adjustmentEditor.negativeAdjustmentHelper}
                  </AppText>
                ) : null}

                <View style={styles.field}>
                  <AppText variant="caption" color="textSecondary">
                    {copy.adjustmentEditor.allocationField}
                  </AppText>
                  <View accessibilityRole="radiogroup" style={styles.allocationList}>
                    {allocationOptions.map((option) => (
                      <AllocationOptionRow
                        key={option.value}
                        label={option.label}
                        detail={option.detail}
                        selected={allocationMethod === option.value}
                        onPress={() => handleAllocationMethodChange(option.value)}
                      />
                    ))}
                  </View>
                </View>

                {allocationMethod === 'CUSTOM' ? (
                  <View style={styles.field}>
                    {participants.map((participant) => (
                      <AmountInput
                        key={participant.id}
                        label={participant.name}
                        valueCentavos={customMagnitudesByParticipantId[participant.id] ?? 0}
                        onChangeCentavos={(value) =>
                          handleCustomMagnitudeChange(participant.id, value)
                        }
                      />
                    ))}
                    {customError ? <InlineError message={customError} /> : null}
                  </View>
                ) : null}
              </View>
            </ScrollView>

            <View style={styles.actions}>
              {onDelete ? (
                <AppButton
                  variant="destructive"
                  label={copy.adjustmentEditor.deleteAction}
                  onPress={onDelete}
                />
              ) : null}
              <AppButton variant="secondary" label={copy.global.cancelAction} onPress={onCancel} />
              <AppButton label={copy.adjustmentEditor.saveAction} onPress={handleSave} />
            </View>
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

type TypeChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

// A single-select chip for the five adjustment types — deliberately not
// ParticipantChip, which is a multi-select checkbox control; this is a
// mutually-exclusive radio choice, so it carries its own "radio"
// accessibilityRole instead of borrowing "checkbox" semantics that wouldn't
// describe it correctly.
function TypeChip({ label, selected, onPress }: TypeChipProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      aria-checked={selected}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.typeChip,
        selected && styles.typeChipSelected,
        pressed && styles.typeChipPressed,
      ]}
    >
      {/* Selection is conveyed by the check mark text, not only the chip's
          background color (spec section 17). */}
      <AppText variant="body" color={selected ? 'onPrimary' : 'textPrimary'}>
        {selected ? `✓ ${label}` : label}
      </AppText>
    </Pressable>
  );
}

type PresetChipProps = {
  label: string;
  onPress: () => void;
};

// A one-shot quick-fill action, not a selection — so a plain "button" role
// and no selected state, unlike TypeChip's radio semantics.
function PresetChip({ label, onPress }: PresetChipProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.typeChip, pressed && styles.typeChipPressed]}
    >
      <AppText variant="body">{label}</AppText>
    </Pressable>
  );
}

type AllocationOptionRowProps = {
  label: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
};

function AllocationOptionRow({ label, detail, selected, onPress }: AllocationOptionRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      aria-checked={selected}
      style={({ pressed }) => [
        styles.allocationRow,
        selected && styles.allocationRowSelected,
        pressed && styles.allocationRowPressed,
      ]}
    >
      <AppText variant="body">{selected ? `✓ ${label}` : label}</AppText>
      <AppText variant="caption" color="textSecondary">
        {detail}
      </AppText>
    </Pressable>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.scrim,
    },
    // See ParticipantEditorSheet's identical style for why flex: 1 +
    // justifyContent: 'flex-end' belongs here and not on `backdrop`: it's
    // what makes Android's "height" behavior shrink this view from the
    // bottom (where the keyboard appears) rather than leave it
    // bottom-anchored behind the keyboard. It also keeps `sheetMaxHeight`
    // below resolving against this view's full (screen-height) size, the
    // same as it always resolved against `backdrop`'s size before this view
    // existed.
    avoidingView: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    // On the Animated.View wrapper, not `sheet` below — see this file's own
    // render-side comment on why a percentage height has to resolve there.
    sheetMaxHeight: {
      maxHeight: '85%',
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
      // Lets the sheet shrink to `sheetMaxHeight`'s cap so the ScrollView
      // scrolls and the pinned actions stay visible.
      flexShrink: 1,
      // Web desktop widening (theme/tokens.ts's own CONTENT_MAX_WIDTH
      // comment) — `alignSelf` centers this against `sheetMaxHeight`'s own
      // default 'stretch' cross-axis.
      width: '100%',
      maxWidth: Platform.OS === 'web' ? CONTENT_MAX_WIDTH : undefined,
      alignSelf: 'center',
    },
    scroll: {
      flexGrow: 0,
    },
    scrollContent: {
      gap: spacing.md,
      paddingBottom: spacing.sm,
    },
    field: {
      gap: spacing.xs,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    typeChip: {
      minHeight: touchTarget.min,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    typeChipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    typeChipPressed: {
      opacity: 0.85,
    },
    allocationList: {
      gap: spacing.sm,
    },
    allocationRow: {
      minHeight: touchTarget.min,
      justifyContent: 'center',
      gap: 2,
      padding: spacing.md,
      borderRadius: radius.button,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    allocationRowSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.surface,
    },
    allocationRowPressed: {
      opacity: 0.85,
    },
    actions: {
      gap: spacing.sm,
    },
  });
}
