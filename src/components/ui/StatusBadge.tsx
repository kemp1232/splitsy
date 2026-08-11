import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

type Props = {
  label: string;
  tone?: Tone;
};

// Status is always conveyed by the label text itself, never by background
// color alone (spec section 17).
export function StatusBadge({ label, tone = 'neutral' }: Props) {
  return (
    <View style={[styles.badge, toneStyles[tone]]}>
      <AppText variant="caption" color="textPrimary">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});

const toneStyles = StyleSheet.create({
  neutral: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  success: { backgroundColor: '#E3F1E8', borderColor: colors.success },
  warning: { backgroundColor: '#FBEFDC', borderColor: colors.warning },
  danger: { backgroundColor: '#F8E2E0', borderColor: colors.danger },
});
