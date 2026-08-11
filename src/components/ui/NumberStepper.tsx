import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { IconButton } from './IconButton';

type Props = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
};

// Quantity is 1-99 and descriptive only in the MVP (spec section 10.6 / F-011).
export function NumberStepper({ value, onChange, min = 1, max = 99, label = 'Quantity' }: Props) {
  return (
    <View style={styles.row}>
      <IconButton
        accessibilityLabel={`Decrease ${label}`}
        onPress={() => onChange(Math.max(min, value - 1))}
        icon={<AppText variant="subheading">−</AppText>}
      />
      <AppText variant="subheading" style={styles.value}>
        {value}
      </AppText>
      <IconButton
        accessibilityLabel={`Increase ${label}`}
        onPress={() => onChange(Math.min(max, value + 1))}
        icon={<AppText variant="subheading">+</AppText>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  value: { minWidth: 24, textAlign: 'center' },
});
