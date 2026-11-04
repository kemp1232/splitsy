import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { copy } from '@/constants/copy';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  icon: ComponentProps<typeof Feather>['name'];
  heading: string;
  body?: string;
  // Defaults to copy.global.backAccessibilityLabel.
  backAccessibilityLabel?: string;
  // Defaults to the mid-wizard back behaviour below; pass one only when a
  // screen needs different handling (e.g. the saved bill's dismissTo('/')).
  onBack?: () => void;
  // Extra header content (an InlineError, a secondary note) rendered under
  // the body caption.
  children?: ReactNode;
};

// The redesigned bill-screen header: back arrow, primary icon, heading and a
// body caption. Geometry copied from receipt-review.tsx's own header block,
// which stays inline there so that screen renders exactly as before.
export function ScreenHeader({
  icon,
  heading,
  body,
  backAccessibilityLabel = copy.global.backAccessibilityLabel,
  onBack,
  children,
}: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  // Same behaviour as participants.tsx's own handleBack: the previous wizard
  // step when there is one in the stack, otherwise Home (e.g. a draft resumed
  // straight onto this step from a cold start).
  function defaultBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }

  return (
    <View style={styles.headerBlock}>
      <View style={styles.headingRow}>
        <IconButton
          accessibilityLabel={backAccessibilityLabel}
          onPress={onBack ?? defaultBack}
          icon={<Feather name="arrow-left" size={22} color={colors.textPrimary} />}
        />
        {/* Decorative — the heading beside it carries the meaning. */}
        <Feather
          name={icon}
          size={24}
          color={colors.primary}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <AppText variant="heading" style={styles.headingText} accessibilityRole="header">
          {heading}
        </AppText>
      </View>
      {body ? (
        <AppText variant="body" color="textSecondary" style={styles.uniformText}>
          {body}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

// Theme-independent (colors are applied inline to the icons above).
const styles = StyleSheet.create({
  uniformText: {
    fontSize: 14,
    lineHeight: 19,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // Pulls the back button's own touch-target padding flush with the
    // content edge so the arrow lines up with the cards below.
    marginLeft: -spacing.md,
  },
  headingText: {
    flexShrink: 1,
  },
});
