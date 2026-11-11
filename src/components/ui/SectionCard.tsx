import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';
import { ReceiptTornEdge } from './ReceiptTornEdge';

type Props = PropsWithChildren<{
  title?: string;
  // Opts this specific card into the torn-receipt-edge signature treatment
  // (see ReceiptTornEdge) — left off by default so the motif stays confined
  // to the receipt/settlement surfaces that call for it (spec-adjacent theme
  // direction: "used sparingly, not scattered everywhere"), not applied to
  // every SectionCard in the app.
  torn?: boolean;
  // 2026-11 redesign: a mint border for a card whose state the app has
  // actually verified (e.g. BillTotalCard only when the total matches the
  // receipt). Omitted = neutral border. Not meant to be combined with
  // `torn` (the torn edge keeps the neutral border color).
  highlight?: 'success';
}>;

export function SectionCard({ title, torn, highlight, children }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <View
        style={[
          styles.card,
          highlight === 'success' && styles.highlightSuccess,
          torn && styles.cardTorn,
        ]}
      >
        {title ? (
          <AppText variant="cardTitle" style={styles.title}>
            {title}
          </AppText>
        ) : null}
        {children}
      </View>
      {torn ? <ReceiptTornEdge color={colors.surface} borderColor={colors.border} /> : null}
    </View>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl20,
      gap: spacing.sm,
    },
    highlightSuccess: {
      borderColor: colors.success,
      borderWidth: 1.5,
    },
    cardTorn: {
      borderBottomWidth: 0,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
    title: {
      marginBottom: spacing.xs,
    },
  });
}
