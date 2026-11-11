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
          variant="cardTitle"
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
  // Wraps instead of squeezing: the title/caption keep at least ~200dp, and
  // an action too wide to fit beside them (e.g. "Assign all unassigned" on a
  // phone) drops onto its own line rather than forcing the title into a
  // narrow multi-line column. Narrow actions ("Add item") stay alongside.
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.sm,
    rowGap: spacing.xs,
  },
  headerText: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 200,
    gap: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});

function createCardStyles(colors: ColorTokens) {
  return StyleSheet.create({
    card: {
      borderRadius: radius.card,
      borderCurve: 'continuous',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
  });
}
