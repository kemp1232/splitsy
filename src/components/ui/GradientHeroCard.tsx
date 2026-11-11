import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import { radius, shadows, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

type Props = {
  // Small label above the amount, e.g. "Bill total" / "Trip total".
  label: string;
  // Raw centavos — formatted here, at the UI boundary, never passed back
  // into calculation logic (spec section 7).
  amountCentavos: number;
  // Merchant/bill/trip name — shown above the label/amount now (see the
  // render function's own comment on the reordering).
  subtitle?: string;
  // Small trailing detail, e.g. a formatted date.
  meta?: string;
  // Optional icon shown beside `label` — a render prop (like AppButton's own
  // `icon`) so the caller's chosen color always matches `onPrimary`, this
  // card's one text color, without this component hardcoding a Feather glyph
  // for every possible caller.
  icon?: (color: string) => ReactNode;
  // Rounds the top corners to match the bottom ones, instead of this card's
  // default flush-with-the-screen-top shape. Every current caller (trip hub,
  // trip settlement) opts in since the 2026-11 redesign, where all cards are
  // inset with full rounded corners; the flush default is kept for
  // compatibility.
  roundTopCorners?: boolean;
  // Adds spacing.lg left/right margin — the same horizontal inset `body`'s
  // own padding gives the cards below it — instead of this card's default
  // flush-with-the-screen-sides shape. Opt-in, like `roundTopCorners`.
  sideInset?: boolean;
  // Optional status badge shown directly below the amount — e.g.
  // summary.tsx's own "matches the receipt"/mismatch badge, placed here so
  // it reads as directly describing the total above it rather than as a
  // separate block further down the screen.
  statusBadge?: ReactNode;
};

// The reference UI's large rounded gradient "hero" panel (screenshots 1 and
// 2), reused for the one number on each of these screens that's genuinely a
// single running total (bill total, trip total) — never fabricated for a
// screen that's just a list (see the home screen's own header note on why it
// doesn't get one of these). Deliberately flush with the top/sides of the
// screen with only its bottom corners rounded, matching the reference's own
// "hero panel" shape, since every screen that uses this renders it as the
// first thing on an otherwise unpadded (`padded={false}`) Screen.
export function GradientHeroCard({
  label,
  amountCentavos,
  subtitle,
  meta,
  icon,
  roundTopCorners,
  sideInset,
  statusBadge,
}: Props) {
  const { colors } = useTheme();

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.card,
        roundTopCorners && styles.cardRoundTop,
        sideInset && styles.cardSideInset,
      ]}
    >
      {/* Subtitle/meta (which bill/trip this is) now reads first, above the
          label+amount — telling the user what they're looking at before the
          number, rather than after it. */}
      {subtitle || meta ? (
        <View style={styles.contextRow}>
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
      <View style={styles.labelRow}>
        {icon ? icon(colors.onPrimary) : null}
        <AppText variant="body" color="onPrimary" style={styles.label}>
          {label}
        </AppText>
      </View>
      <AppText
        variant="amount"
        color="onPrimary"
        accessibilityLabel={formatCentavosForSpeech(amountCentavos)}
      >
        {formatCentavos(amountCentavos)}
      </AppText>
      {statusBadge ?? null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderBottomLeftRadius: radius.hero,
    borderBottomRightRadius: radius.hero,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.xl20,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
    // Always a soft dark shadow (theme-neutral) — reads on both the dark
    // ambient background and the light lavender one.
    boxShadow: shadows.card,
  },
  cardRoundTop: {
    borderTopLeftRadius: radius.hero,
    borderTopRightRadius: radius.hero,
  },
  cardSideInset: {
    marginHorizontal: spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    opacity: 0.85,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  subtitle: {
    flex: 1,
  },
});
