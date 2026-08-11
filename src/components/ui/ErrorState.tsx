import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme/tokens';

import { AppButton } from './AppButton';
import { AppText } from './AppText';

type Props = {
  heading: string;
  body: string;
  retryLabel?: string;
  onRetry?: () => void;
};

export function ErrorState({ heading, body, retryLabel, onRetry }: Props) {
  return (
    <View style={styles.container} accessibilityLiveRegion="assertive">
      <AppText variant="subheading" style={styles.center}>
        {heading}
      </AppText>
      <AppText variant="body" color="textSecondary" style={styles.center}>
        {body}
      </AppText>
      {retryLabel && onRetry ? <AppButton label={retryLabel} onPress={onRetry} /> : null}
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
