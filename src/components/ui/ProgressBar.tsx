import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

type Tone = 'primary' | 'success' | 'warning';

type Props = {
  // Already computed by the caller — this component only ever renders it,
  // never derives it from raw money (spec 10.1: formatting/derivation stays
  // out of the UI layer). Clamped defensively in case an over-collected or
  // not-yet-loaded value slips through as slightly outside [0, 1].
  fraction: number;
  // Status is always conveyed by this label text (and, for paid-in-full, the
  // tone), never by the fill color alone (spec section 17).
  label: string;
  tone?: Tone;
};

// The reference's per-participant colored progress/paid-vs-owed bar — the one
// piece of that visual language that's genuinely true to what Splitsy tracks
// (a person's paid-vs-owed status), used on PersonTotalCard and
// SettlementCard only where payment/contribution data actually exists.
export function ProgressBar({ fraction, label, tone = 'primary' }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const clamped = Math.max(0, Math.min(1, fraction));
  const fillColor =
    tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.primary;

  return (
    <View style={styles.container}>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
      <View
        style={styles.track}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={[styles.fill, { width: `${clamped * 100}%`, backgroundColor: fillColor }]} />
      </View>
    </View>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    container: {
      gap: spacing.xs / 2,
    },
    track: {
      height: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceMuted,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      borderRadius: radius.pill,
    },
  });
}
