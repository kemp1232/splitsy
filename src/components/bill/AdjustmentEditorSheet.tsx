import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { AmountInput } from '@/components/ui/AmountInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { InlineError } from '@/components/ui/InlineError';
import { copy } from '@/constants/copy';
import type { AdjustmentAllocation } from '@/db/repositories/adjustmentAllocations.repository';
import type { Participant } from '@/db/repositories/participants.repository';
import {
  defaultAllocationMethodForType,
  type AdjustmentType,
  type AllocationMethod,
} from '@/features/adjustments/defaultAllocationMethod';
import { isValidAdjustmentAmount } from '@/features/adjustments/validateAdjustmentAmount';
import { validateCustomAllocation } from '@/features/splitting/allocation';
import { formatCentavos } from '@/lib/money';
import { colors, radius, spacing, touchTarget } from '@/theme/tokens';

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
  const [type, setType] = useState<AdjustmentType>(initial?.type ?? 'TAX');
  const [label, setLabel] = useState(initial?.label ?? '');
  // The field always holds a non-negative magnitude — DISCOUNT's negative
  // sign (spec 10.2) is applied on save, not while typing. This keeps
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
  }

  function handleTypeChange(nextType: AdjustmentType) {
    setType(nextType);
    if (!allocationMethodTouched) {
      setAllocationMethod(defaultAllocationMethodForType(nextType));
    }
  }

  function handleAllocationMethodChange(next: AllocationMethod) {
    setAllocationMethod(next);
    setAllocationMethodTouched(true);
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

    const signedAmountCentavos =
      type === 'DISCOUNT' ? -amountMagnitudeCentavos : amountMagnitudeCentavos;
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
      animationType="slide"
      onShow={handleShow}
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
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
          <View style={styles.sheet}>
            <AppText variant="subheading">
              {initial ? copy.adjustmentEditor.editHeading : copy.adjustmentEditor.addHeading}
            </AppText>

            <ScrollView style={styles.scroll}>
              <View style={styles.scrollContent}>
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

                <View style={styles.field}>
                  <AppText variant="caption" color="textSecondary">
                    {copy.adjustmentEditor.allocationField}
                  </AppText>
                  <View accessibilityRole="radiogroup" style={styles.allocationList}>
                    {ALLOCATION_OPTIONS.map((option) => (
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
          </View>
        </KeyboardAvoidingView>
      </View>
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
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
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

type AllocationOptionRowProps = {
  label: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
};

function AllocationOptionRow({ label, detail, selected, onPress }: AllocationOptionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  // See ParticipantEditorSheet's identical style for why flex: 1 +
  // justifyContent: 'flex-end' belongs here and not on `backdrop`: it's what
  // makes Android's "height" behavior shrink this view from the bottom (where
  // the keyboard appears) rather than leave it bottom-anchored behind the
  // keyboard. It also keeps `sheet`'s maxHeight: '85%' below resolving against
  // this view's full (screen-height) size, the same as it always resolved
  // against `backdrop`'s size before this view existed.
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
    maxHeight: '85%',
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
    borderRadius: radius.md,
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
