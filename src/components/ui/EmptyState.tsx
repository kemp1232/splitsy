import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme/tokens';

import { AppButton } from './AppButton';
import { AppText } from './AppText';

type Props = {
  heading: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ heading, body, actionLabel, onAction }: Props) {
  return (
    <View style={styles.container}>
      <AppText variant="subheading" style={styles.center}>
        {heading}
      </AppText>
      <AppText variant="body" color="textSecondary" style={styles.center}>
        {body}
      </AppText>
      {actionLabel && onAction ? <AppButton label={actionLabel} onPress={onAction} /> : null}
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
