import Feather from '@expo/vector-icons/Feather';
import { Modal, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import { spacing } from '@/theme/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const SECTIONS = [
  { title: copy.settings.privacyLocalTitle, body: copy.settings.privacyDetailsLocalBody },
  { title: copy.settings.privacyOcrTitle, body: copy.settings.privacyDetailsOcrBody },
  { title: copy.settings.privacyServerTitle, body: copy.settings.privacyDetailsServerBody },
];

// Full privacy explanation behind Settings' compact "Learn more" row. Same
// full-screen slide Modal + <Screen tabBarHidden scroll> pattern as
// bill/[billId]/index.tsx's receipt/raw-text viewers: Screen supplies the
// safe-area insets (all edges, since no tab bar shows inside a Modal) and the
// scroll container, and the explicit Close button pairs with
// onRequestClose (Android back).
export function PrivacyDetailsModal({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen tabBarHidden scroll>
        <View style={styles.body}>
          <View style={styles.closeRow}>
            <AppButton
              variant="text"
              label={copy.global.closeAccessibilityLabel}
              onPress={onClose}
              icon={(color) => <Feather name="x" size={18} color={color} />}
            />
          </View>
          <AppText variant="title" accessibilityRole="header">
            {copy.settings.privacyDetailsHeading}
          </AppText>
          {SECTIONS.map((section) => (
            <View key={section.title} style={styles.section}>
              <AppText variant="subheading" accessibilityRole="header">
                {section.title}
              </AppText>
              <AppText color="textSecondary">{section.body}</AppText>
            </View>
          ))}
        </View>
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  closeRow: {
    alignItems: 'flex-start',
  },
  section: {
    gap: spacing.xs,
  },
});
