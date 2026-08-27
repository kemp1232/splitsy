import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

type Props = {
  message: string;
};

// Led with an alert-circle icon rather than relying on the danger color
// alone (spec section 17) — was a literal "!" text prefix before the
// vercel-react-native-skills icon pass.
export function InlineError({ message }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <Feather name="alert-circle" size={16} color={colors.danger} />
      <AppText variant="caption" color="danger" style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  text: {
    flexShrink: 1,
  },
});
