import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type SectionHeaderProps = {
  // Usually a "{label} ({count})" string, e.g. copy.payments.sectionWithCount.
  title: string;
  caption?: string;
  // Spoken form of `title` when the visible "(N)" reads badly aloud.
  accessibilityLabel?: string;
  // Trailing control (e.g. an "Add" button), right-aligned next to the title.
  action?: ReactNode;
};

// Section title + caption above a grouped list — same shape as
// receipt-review.tsx's own "Items (N)" header row.
export function SectionHeader({ title, caption, accessibilityLabel, action }: SectionHeaderProps) {
  return (
    <View style={staticStyles.headerRow}>
      <View style={staticStyles.headerText}>
        <AppText
          variant="subheading"
          accessibilityRole="header"
          accessibilityLabel={accessibilityLabel}
        >
          {title}
        </AppText>
        {caption ? (
          <AppText variant="caption" color="textSecondary">
            {caption}
          </AppText>
        ) : null}
      </View>
      {action ?? null}
    </View>
  );
}

// One rounded, hairline-bordered card holding hairline-separated rows — the
// same grouped treatment as participants.tsx's own People card. Rows inside
// supply their own padding; GroupedSeparator goes between them.
export function GroupedCard({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createCardStyles(colors), [colors]);
  return <View style={styles.card}>{children}</View>;
}

// Stable component reference so it can be passed straight to a FlatList's
// ItemSeparatorComponent without an inline arrow per render. Rendered once per
// row gap, so it only builds its one themed color style (memoized on the
// token), not a whole StyleSheet.
export function GroupedSeparator() {
  const { colors } = useTheme();
  const style = useMemo(
    () => [staticStyles.separator, { backgroundColor: colors.border }],
    [colors.border],
  );
  return <View style={style} />;
}

const staticStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});

function createCardStyles(colors: ColorTokens) {
  return StyleSheet.create({
    card: {
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
  });
}
