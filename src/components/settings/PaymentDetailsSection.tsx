import Feather from '@expo/vector-icons/Feather';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { AppTextInput } from '@/components/ui/AppTextInput';
import { GroupedCard, GroupedSeparator } from '@/components/ui/GroupedSection';
import { InlineError } from '@/components/ui/InlineError';
import { ReceiptImage } from '@/components/ui/ReceiptImage';
import { copy } from '@/constants/copy';
import { pickGalleryImageUri } from '@/features/bills/galleryBill';
import {
  getPaymentDetails,
  removeQrImage,
  saveQrImage,
  savePaymentNumbers,
  type PaymentDetails,
  type PaymentNumberField,
} from '@/features/payment-details/paymentDetails.service';
import { formatPhMobileNumber } from '@/features/payment-details/phMobileNumber';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

const QR_THUMBNAIL_SIZE = 96;

// Settings' "Payment details" card (spec Amendment 2026-11-12): the user's
// own GCash/Maya number and payment QR image, saved on this device only and
// added to a shared bill summary when the user is owed money.
export function PaymentDetailsSection() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [gcashInput, setGcashInput] = useState('');
  const [mayaInput, setMayaInput] = useState('');
  const [invalidFields, setInvalidFields] = useState<PaymentNumberField[]>([]);
  const [qrImageUri, setQrImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applySaved = useCallback((saved: PaymentDetails) => {
    setGcashInput(saved.gcashNumber ? formatPhMobileNumber(saved.gcashNumber) : '');
    setMayaInput(saved.mayaNumber ? formatPhMobileNumber(saved.mayaNumber) : '');
    setQrImageUri(saved.qrImageUri);
    setInvalidFields([]);
    setError(null);
  }, []);

  // Loaded once on mount (and again after a save): only this section edits
  // these values, and re-reading on every focus would overwrite numbers the
  // user has typed but not saved yet. Same cancelled-flag shape as
  // ReceiptImage's own load effect.
  useEffect(() => {
    let cancelled = false;
    getPaymentDetails()
      .then((saved) => {
        if (!cancelled) applySaved(saved);
      })
      .catch(() => {
        if (!cancelled) setError(copy.global.genericErrorBody);
      });
    return () => {
      cancelled = true;
    };
  }, [applySaved]);

  function handleGcashChange(value: string) {
    setGcashInput(value);
    setSavedMessage(null);
    setInvalidFields((fields) => fields.filter((field) => field !== 'gcash'));
  }

  function handleMayaChange(value: string) {
    setMayaInput(value);
    setSavedMessage(null);
    setInvalidFields((fields) => fields.filter((field) => field !== 'maya'));
  }

  async function handleSaveNumbers() {
    setError(null);
    setSavedMessage(null);
    setSaving(true);
    try {
      const result = await savePaymentNumbers({ gcash: gcashInput, maya: mayaInput });
      if (!result.ok) {
        setInvalidFields(result.invalid);
        return;
      }
      applySaved(await getPaymentDetails());
      setSavedMessage(copy.paymentDetails.savedToast);
    } catch {
      setError(copy.global.genericErrorBody);
    } finally {
      setSaving(false);
    }
  }

  async function handlePickQr() {
    setError(null);
    // Raises its own permission/unsupported-image alerts; null means there
    // is nothing to save.
    const pickedUri = await pickGalleryImageUri();
    if (!pickedUri) return;
    setQrBusy(true);
    try {
      setQrImageUri(await saveQrImage(pickedUri));
    } catch {
      setError(copy.global.imageCopyFailure);
    } finally {
      setQrBusy(false);
    }
  }

  async function handleRemoveQr() {
    setError(null);
    setQrBusy(true);
    try {
      await removeQrImage();
      setQrImageUri(null);
    } catch {
      setError(copy.global.genericErrorBody);
    } finally {
      setQrBusy(false);
    }
  }

  return (
    <>
      <GroupedCard>
        <View style={styles.padded}>
          <AppTextInput
            label={copy.paymentDetails.gcashLabel}
            value={gcashInput}
            onChangeText={handleGcashChange}
            placeholder={copy.paymentDetails.numberPlaceholder}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={20}
            error={invalidFields.includes('gcash') ? copy.paymentDetails.invalidNumber : undefined}
          />
          <AppTextInput
            label={copy.paymentDetails.mayaLabel}
            value={mayaInput}
            onChangeText={handleMayaChange}
            placeholder={copy.paymentDetails.numberPlaceholder}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={20}
            error={invalidFields.includes('maya') ? copy.paymentDetails.invalidNumber : undefined}
          />
          <AppButton
            variant="secondary"
            label={copy.paymentDetails.saveAction}
            onPress={handleSaveNumbers}
            loading={saving}
            disabled={saving}
            icon={(color) => <Feather name="save" size={18} color={color} />}
          />
          {savedMessage !== null ? (
            <AppText variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
              {savedMessage}
            </AppText>
          ) : null}
        </View>
        <GroupedSeparator />
        <View style={styles.padded}>
          <AppText>{copy.paymentDetails.qrLabel}</AppText>
          {qrImageUri !== null ? (
            <View style={styles.qrRow}>
              <ReceiptImage
                uri={qrImageUri}
                style={styles.qrThumbnail}
                contentFit="contain"
                accessibilityLabel={copy.paymentDetails.qrImageAccessibilityLabel}
              />
              <View style={styles.qrActions}>
                <AppButton
                  variant="secondary"
                  label={copy.paymentDetails.qrReplaceAction}
                  onPress={handlePickQr}
                  disabled={qrBusy}
                  icon={(color) => <Feather name="refresh-cw" size={18} color={color} />}
                />
                <AppButton
                  variant="destructive"
                  label={copy.paymentDetails.qrRemoveAction}
                  onPress={handleRemoveQr}
                  disabled={qrBusy}
                  icon={(color) => <Feather name="trash-2" size={18} color={color} />}
                />
              </View>
            </View>
          ) : (
            <>
              <AppText variant="caption" color="textSecondary">
                {copy.paymentDetails.qrEmpty}
              </AppText>
              <AppButton
                variant="secondary"
                label={copy.paymentDetails.qrPickAction}
                onPress={handlePickQr}
                loading={qrBusy}
                disabled={qrBusy}
                icon={(color) => <Feather name="image" size={18} color={color} />}
              />
            </>
          )}
        </View>
      </GroupedCard>
      {error !== null ? <InlineError message={error} /> : null}
    </>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    padded: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    qrRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    qrThumbnail: {
      width: QR_THUMBNAIL_SIZE,
      height: QR_THUMBNAIL_SIZE,
      borderRadius: radius.button,
      borderCurve: 'continuous',
      backgroundColor: colors.surfaceMuted,
    },
    qrActions: {
      flex: 1,
      gap: spacing.sm,
    },
  });
}
