import { Image } from 'expo-image';
import type { Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { ReceiptImage } from '@/components/ui/ReceiptImage';
import { copy } from '@/constants/copy';
import type { ShareImageModel } from '@/features/splitting/shareImageModel';
import { lightColors, radius, spacing } from '@/theme/tokens';

type Props = {
  model: ShareImageModel;
  // The user's saved payment QR (stored uri), or null for none. The caller
  // passes it only when Me is owed money, the same gate as "Share my QR".
  qrImageUri: string | null;
  // The view captured as the PNG (useShareSummaryImage's cardRef).
  ref?: Ref<View>;
};

// The bill summary as a static card, captured to a PNG and shared ("Share as
// image" on the summary and saved bill screens). Purely presentational, with
// no Pressables: it only renders rows buildShareImageModel already formatted.
// Top to bottom: Splitsy branding, the bill, settle-up, the payment QR, then
// the GCash/Maya numbers as the lowest section.
// Fixed light colors on an opaque background rather than the current theme:
// the image is viewed outside the app, in any chat app's light or dark
// theme, so it must read the same everywhere and never depend on the
// sharer's own theme setting (the app defaults to dark).
// The captured view is the rectangular, opaque `frame` around the rounded card,
// so the PNG has no transparent corners for a chat's background to show
// through.
export function SummaryShareCard({ model, qrImageUri, ref }: Props) {
  return (
    <View ref={ref} collapsable={false} style={styles.frame}>
      <View style={styles.card}>
        <View style={styles.brandRow}>
          <Image
            source={require('../../../assets/images/logo.png')}
            style={styles.logo}
            contentFit="contain"
          />
          <AppText variant="subheading" style={styles.primaryText}>
            {copy.appName}
          </AppText>
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <AppText variant="subheading" style={styles.primaryText}>
            {model.title}
          </AppText>
          <View style={styles.row}>
            <AppText style={styles.secondaryText}>{copy.summary.totalLabel}</AppText>
            <AppText variant="subheading" style={styles.amountText}>
              {model.totalText}
            </AppText>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          {model.people.map((person) => (
            <View key={person.participantId} style={styles.person}>
              <View style={styles.row}>
                <AppText style={[styles.primaryText, styles.flexText]}>{person.name}</AppText>
                <AppText style={styles.amountText}>{person.totalText}</AppText>
              </View>
              {person.paidText !== null ? (
                <AppText variant="caption" style={styles.secondaryText}>
                  {person.paidText}
                </AppText>
              ) : null}
            </View>
          ))}
        </View>

        {model.settleLines.length > 0 ? (
          <>
            <View style={styles.divider} />
            <View style={styles.section}>
              <AppText variant="cardTitle" style={styles.primaryText}>
                {copy.settlement.heading}
              </AppText>
              {model.settleLines.map((line) => (
                <View key={line.key} style={styles.row}>
                  <AppText style={[styles.primaryText, styles.flexText]}>{line.label}</AppText>
                  <AppText style={styles.amountText}>{line.amountText}</AppText>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {qrImageUri !== null ? (
          <View style={styles.qrSection}>
            <AppText variant="cardTitle" style={styles.primaryText}>
              {copy.paymentDetails.qrLabel}
            </AppText>
            <ReceiptImage
              uri={qrImageUri}
              style={styles.qrImage}
              contentFit="contain"
              accessibilityLabel={copy.paymentDetails.qrImageAccessibilityLabel}
            />
          </View>
        ) : null}

        {model.payment !== null ? (
          <View style={styles.paymentBox}>
            <AppText variant="cardTitle" style={styles.primaryText}>
              {model.payment.heading}
            </AppText>
            {model.payment.lines.map((line) => (
              <AppText key={line} style={styles.primaryText}>
                {line}
              </AppText>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 376,
    padding: spacing.sm,
    backgroundColor: lightColors.background,
  },
  card: {
    padding: spacing.xl20,
    gap: spacing.lg,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logo: {
    width: 40,
    height: 40,
  },
  section: {
    gap: spacing.sm,
  },
  person: {
    gap: spacing.xs / 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  flexText: {
    flexShrink: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: lightColors.border,
  },
  qrSection: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  qrImage: {
    width: 220,
    height: 220,
  },
  paymentBox: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: lightColors.surfaceMuted,
  },
  primaryText: {
    color: lightColors.textPrimary,
  },
  secondaryText: {
    color: lightColors.textSecondary,
  },
  amountText: {
    color: lightColors.textPrimary,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
