import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';
import { IconButton } from './IconButton';

type Props = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  // Lets a caller stretch the stepper (e.g. space-between inside a bordered
  // box); omitted by default so the compact layout is unchanged.
  style?: StyleProp<ViewStyle>;
};

// Quantity is 1-99 and descriptive only in the MVP (spec section 10.6 / F-011).
export function NumberStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  label = 'Quantity',
  style,
}: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, style]}>
      <IconButton
        accessibilityLabel={`Decrease ${label}`}
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
        icon={
          <AppText variant="subheading" style={{ color: colors.primary }}>
            −
          </AppText>
        }
      />
      <AppText variant="subheading" style={styles.value}>
        {value}
      </AppText>
      <IconButton
        accessibilityLabel={`Increase ${label}`}
        disabled={value >= max}
        onPress={() => onChange(Math.min(max, value + 1))}
        icon={
          <AppText variant="subheading" style={{ color: colors.primary }}>
            +
          </AppText>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  value: { minWidth: 24, textAlign: 'center' },
});
