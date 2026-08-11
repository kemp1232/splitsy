import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

type Props = PropsWithChildren<{
  title?: string;
}>;

export function SectionCard({ title, children }: Props) {
  return (
    <View style={styles.card}>
      {title ? (
        <AppText variant="subheading" style={styles.title}>
          {title}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    marginBottom: spacing.xs,
  },
});
