import { useMemo, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountInput } from '@/components/ui/AmountInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { IconButton } from '@/components/ui/IconButton';
import { InlineError } from '@/components/ui/InlineError';
import { NumberStepper } from '@/components/ui/NumberStepper';
import { useSlideUpAnimation } from '@/components/ui/useSlideUpAnimation';
import { copy } from '@/constants/copy';
import type { ColorTokens } from '@/theme/tokens';
import { CONTENT_MAX_WIDTH, radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export type LineItemDraft = {
  name: string;
  quantity: number;
  lineTotalCentavos: number;
};

type Props = {
  visible: boolean;
  initial: LineItemDraft | null; // null = adding a new item
  onSave: (draft: LineItemDraft) => void;
  onCancel: () => void;
};

const MAX_NAME_LENGTH = 80;
// Two-up rows (quantity/total, cancel/save) share this basis so they sit side
// by side on normal screens and stack once the width (scaled by the user's
// font size) can't fit both.
const MIN_COLUMN_WIDTH = 140;

export function LineItemEditorSheet({ visible, initial, onSave, onCancel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translateY = useSlideUpAnimation(visible);
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const columnBasis = MIN_COLUMN_WIDTH * fontScale;
  const [name, setName] = useState(initial?.name ?? '');
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [lineTotalCentavos, setLineTotalCentavos] = useState(initial?.lineTotalCentavos ?? 0);
  const [nameError, setNameError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  // Guards against a double tap firing onSave twice; the screen always closes
  // the sheet after onSave, and reset() re-arms it on the next open.
  const [submitted, setSubmitted] = useState(false);

  // Re-seeds local state every time the sheet opens (via onShow below), so
  // switching from editing one item straight to another always starts clean.
  function reset(next: LineItemDraft | null) {
    setName(next?.name ?? '');
    setQuantity(next?.quantity ?? 1);
    setLineTotalCentavos(next?.lineTotalCentavos ?? 0);
    setNameError(null);
    setAmountError(null);
    setSubmitted(false);
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

    setSubmitted(true);
    onSave({ name: trimmedName.slice(0, MAX_NAME_LENGTH), quantity, lineTotalCentavos });
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
        {/* Same reasoning as ParticipantEditorSheet's own KeyboardAvoidingView:
            a Modal's content isn't a descendant of Screen.tsx's, so the name
            and amount fields above this sheet's Save/Cancel buttons
            need their own instance to keep those buttons reachable above the
            keyboard (spec section 17). */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.avoidingView}
        >
          <Animated.View style={[styles.animated, { transform: [{ translateY }] }]}>
            <Pressable
              style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}
              onPress={() => {}}
            >
              <View accessible={false} importantForAccessibility="no" style={styles.dragHandle} />
              <ScrollView
                keyboardShouldPersistTaps="handled"
                bounces={false}
                showsVerticalScrollIndicator={false}
                style={styles.scroll}
                contentContainerStyle={styles.content}
              >
                <View style={styles.header}>
                  <AppText variant="subheading" style={styles.title}>
                    {initial ? copy.itemEditor.editHeading : copy.itemEditor.addHeading}
                  </AppText>
                  <IconButton
                    accessibilityLabel={copy.itemEditor.closeAccessibilityLabel}
                    onPress={onCancel}
                    icon={<Feather name="x" size={20} color={colors.textSecondary} />}
                  />
                </View>

                <AppTextInput
                  label={copy.itemEditor.nameLabel}
                  placeholder={copy.itemEditor.namePlaceholder}
                  value={name}
                  onChangeText={setName}
                  maxLength={MAX_NAME_LENGTH}
                  error={nameError ?? undefined}
                />

                <View style={styles.pair}>
                  <View style={[styles.column, { flexBasis: columnBasis }]}>
                    <AppText variant="caption" color="textSecondary">
                      {copy.itemEditor.quantityLabel}
                    </AppText>
                    <View style={styles.quantityBox}>
                      <NumberStepper
                        value={quantity}
                        onChange={setQuantity}
                        style={styles.stepper}
                      />
                    </View>
                  </View>
                  <View style={[styles.column, { flexBasis: columnBasis }]}>
                    <AmountInput
                      label={copy.itemEditor.amountLabel}
                      placeholder={copy.itemEditor.amountPlaceholder}
                      valueCentavos={lineTotalCentavos}
                      onChangeCentavos={setLineTotalCentavos}
                      error={amountError ?? undefined}
                      hideErrorMessage
                      style={styles.amountInput}
                      leadingIcon={(color) => (
                        <AppText variant="body" style={{ color }}>
                          ₱
                        </AppText>
                      )}
                    />
                  </View>
                </View>
                {amountError ? <InlineError message={amountError} /> : null}

                <View style={styles.pair}>
                  <View style={[styles.column, { flexBasis: columnBasis }]}>
                    <AppButton
                      variant="secondary"
                      label={copy.itemEditor.cancelAction}
                      onPress={onCancel}
                    />
                  </View>
                  <View style={[styles.column, { flexBasis: columnBasis }]}>
                    <AppButton
                      label={
                        initial ? copy.itemEditor.saveChangesAction : copy.itemEditor.saveAction
                      }
                      onPress={handleSave}
                      disabled={submitted}
                    />
                  </View>
                </View>
              </ScrollView>
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    // See ParticipantEditorSheet's identical style for why flex: 1 +
    // justifyContent: 'flex-end' belongs here and not on `backdrop`: it's what
    // makes Android's "height" behavior shrink this view from the bottom
    // (where the keyboard appears) rather than leave it bottom-anchored
    // behind the keyboard.
    avoidingView: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    // Caps the sheet so the ScrollView inside can scroll on small screens or
    // with the keyboard open, while still sizing to its content otherwise.
    animated: {
      maxHeight: '90%',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      borderCurve: 'continuous',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      gap: spacing.md,
      flexShrink: 1,
      // Web desktop widening (theme/tokens.ts's own CONTENT_MAX_WIDTH
      // comment) — `alignSelf` centers this against its parent's default
      // 'stretch' cross-axis, regardless of which of the wrapping
      // Animated.View/KeyboardAvoidingView layers is its immediate parent.
      width: '100%',
      maxWidth: Platform.OS === 'web' ? CONTENT_MAX_WIDTH : undefined,
      alignSelf: 'center',
    },
    // Decorative only (no drag gesture); hidden from screen readers.
    dragHandle: {
      width: 36,
      height: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.border,
      alignSelf: 'center',
    },
    scroll: {
      flexGrow: 0,
    },
    content: {
      gap: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    title: {
      flex: 1,
      fontWeight: '700',
    },
    pair: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
    },
    column: {
      flexGrow: 1,
      gap: spacing.xs,
    },
    quantityBox: {
      minHeight: touchTarget.preferred,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      justifyContent: 'center',
      paddingHorizontal: spacing.xs,
    },
    // Both fields are touchTarget.preferred tall so the fixed-size IconButton
    // fits without overflowing: its pressed highlight is a circle as tall as
    // the button, so any overflow would paint past the box border. The -1
    // margin absorbs the 1px border, making the button span the box's outer
    // height exactly.
    stepper: {
      justifyContent: 'space-between',
      marginVertical: -1,
    },
    // Matches quantityBox's height so the two fields line up.
    amountInput: {
      minHeight: touchTarget.preferred,
    },
  });
}
