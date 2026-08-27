import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

import { AppButton } from './AppButton';
import { AppText } from './AppText';

type Props = {
  heading: string;
  body: string;
  retryLabel?: string;
  onRetry?: () => void;
};

export function ErrorState({ heading, body, retryLabel, onRetry }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.container} accessibilityLiveRegion="assertive">
      <Feather name="alert-circle" size={28} color={colors.danger} />
      <AppText variant="subheading" style={styles.center}>
        {heading}
      </AppText>
      <AppText variant="body" color="textSecondary" style={styles.center}>
        {body}
      </AppText>
      {retryLabel && onRetry ? (
        <AppButton
          label={retryLabel}
          onPress={onRetry}
          icon={(color) => <Feather name="refresh-cw" size={18} color={color} />}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  center: {
    textAlign: 'center',
  },
});
