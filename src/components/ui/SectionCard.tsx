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
}>;

export function SectionCard({ title, torn, children }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View>
      <View style={[styles.card, torn && styles.cardTorn]}>
        {title ? (
          <AppText variant="subheading" style={styles.title}>
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
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
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
