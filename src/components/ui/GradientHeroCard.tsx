import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

type Props = {
  // Small label above the amount, e.g. "Bill total" / "Trip total".
  label: string;
  // Raw centavos — formatted here, at the UI boundary, never passed back
  // into calculation logic (spec section 7).
  amountCentavos: number;
  // Merchant/bill/trip name shown under the amount.
  subtitle?: string;
  // Small trailing detail, e.g. a formatted date.
  meta?: string;
};

// The reference UI's large rounded gradient "hero" panel (screenshots 1 and
// 2), reused for the one number on each of these screens that's genuinely a
// single running total (bill total, trip total) — never fabricated for a
// screen that's just a list (see the home screen's own header note on why it
// doesn't get one of these). Deliberately flush with the top/sides of the
// screen with only its bottom corners rounded, matching the reference's own
// "hero panel" shape, since every screen that uses this renders it as the
// first thing on an otherwise unpadded (`padded={false}`) Screen.
export function GradientHeroCard({ label, amountCentavos, subtitle, meta }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <AppText variant="body" color="onPrimary" style={styles.label}>
        {label}
      </AppText>
      <AppText
        variant="amount"
        color="onPrimary"
        accessibilityLabel={formatCentavosForSpeech(amountCentavos)}
      >
        {formatCentavos(amountCentavos)}
      </AppText>
      {subtitle || meta ? (
        <View style={styles.footerRow}>
          {subtitle ? (
            <AppText
              variant="subheading"
              color="onPrimary"
              numberOfLines={1}
              style={styles.subtitle}
            >
              {subtitle}
            </AppText>
          ) : null}
          {meta ? (
            <AppText variant="caption" color="onPrimary">
              {meta}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </LinearGradient>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    card: {
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.xl,
      gap: spacing.xs,
      // Shadow is theme-neutral (always a dark shadow) since the card itself
      // is always dark-ish (light theme's own deep-indigo gradient) or
      // bright (dark theme's periwinkle gradient) — either way a soft dark
      // shadow reads correctly sitting on top of `colors.background` behind it.
      shadowColor: colors.textPrimary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 4,
    },
    label: {
      opacity: 0.85,
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.xs,
      gap: spacing.sm,
    },
    subtitle: {
      flex: 1,
    },
  });
}
