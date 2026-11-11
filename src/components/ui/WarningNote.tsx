import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

type Props = {
  message: string;
};

// A non-blocking warning line: alert-triangle icon + text (not color alone,
// spec section 17). The warning counterpart to InlineError — e.g. the
// negative-total warning (getNegativeTotalWarning) on the fees, payments,
// summary and saved-bill screens.
export function WarningNote({ message }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <Feather name="alert-triangle" size={18} color={colors.warning} />
      <AppText variant="caption" style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: {
    flex: 1,
  },
});
