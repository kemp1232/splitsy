import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';

import { AmountInput } from '@/components/ui/AmountInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { NumberStepper } from '@/components/ui/NumberStepper';
import { copy } from '@/constants/copy';
import { colors, radius, spacing } from '@/theme/tokens';

export type LineItemDraft = {
  name: string;
  quantity: number;
  lineTotalCentavos: number;
};

type Props = {
  visible: boolean;
  initial: LineItemDraft | null; // null = adding a new item
  onSave: (draft: LineItemDraft) => void;
  onDelete?: () => void;
  onCancel: () => void;
};

const MAX_NAME_LENGTH = 80;

export function LineItemEditorSheet({ visible, initial, onSave, onDelete, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [lineTotalCentavos, setLineTotalCentavos] = useState(initial?.lineTotalCentavos ?? 0);
  const [nameError, setNameError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

  // Re-seeds local state every time the sheet opens (via onShow below), so
  // switching from editing one item straight to another always starts clean.
  function reset(next: LineItemDraft | null) {
    setName(next?.name ?? '');
    setQuantity(next?.quantity ?? 1);
    setLineTotalCentavos(next?.lineTotalCentavos ?? 0);
    setNameError(null);
    setAmountError(null);
  }

  function handleShow() {
    reset(initial);
  }

  function handleSave() {
    const trimmedName = name.trim();
    let hasError = false;
    if (!trimmedName) {
      setNameError(copy.itemEditor.requiredNameError);
      hasError = true;
    } else {
      setNameError(null);
    }
    if (!Number.isFinite(lineTotalCentavos) || lineTotalCentavos < 0) {
      setAmountError(copy.itemEditor.invalidAmountError);
      hasError = true;
    } else {
      setAmountError(null);
    }
    if (hasError) return;

    onSave({ name: trimmedName.slice(0, MAX_NAME_LENGTH), quantity, lineTotalCentavos });
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
        {/* Same reasoning as ParticipantEditorSheet's own KeyboardAvoidingView:
            a Modal's content isn't a descendant of Screen.tsx's, so the name
            and amount fields above this sheet's Save/Delete/Cancel buttons
            need their own instance to keep those buttons reachable above the
            keyboard (spec section 17). */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.avoidingView}
        >
          <View style={styles.sheet}>
            <AppText variant="subheading">
              {initial ? copy.itemEditor.editHeading : copy.itemEditor.addHeading}
            </AppText>

            <AppTextInput
              label={copy.itemEditor.nameLabel}
              placeholder={copy.itemEditor.namePlaceholder}
              value={name}
              onChangeText={setName}
              maxLength={MAX_NAME_LENGTH}
              error={nameError ?? undefined}
            />

            <View style={styles.row}>
              <AppText variant="caption" color="textSecondary">
                {copy.itemEditor.quantityLabel}
              </AppText>
              <NumberStepper value={quantity} onChange={setQuantity} />
            </View>

            <AmountInput
              label={copy.itemEditor.amountLabel}
              placeholder={copy.itemEditor.amountPlaceholder}
              valueCentavos={lineTotalCentavos}
              onChangeCentavos={setLineTotalCentavos}
              error={amountError ?? undefined}
            />

            <View style={styles.actions}>
              {onDelete ? (
                <AppButton
                  variant="destructive"
                  label={copy.itemEditor.deleteAction}
                  onPress={onDelete}
                />
              ) : null}
              <AppButton
                variant="secondary"
                label={copy.itemEditor.cancelAction}
                onPress={onCancel}
              />
              <AppButton label={copy.itemEditor.saveAction} onPress={handleSave} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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
  // keyboard.
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
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    gap: spacing.sm,
  },
});
