import { StyleSheet } from 'react-native';

import { AppText } from './AppText';

type Props = {
  message: string;
};

// Prefixed with "!" rather than relying on the danger color alone (spec section 17).
export function InlineError({ message }: Props) {
  return (
    <AppText variant="caption" color="danger" style={styles.text} accessibilityLiveRegion="polite">
      ! {message}
    </AppText>
  );
}

const styles = StyleSheet.create({
  text: {
    marginTop: 2,
  },
});
