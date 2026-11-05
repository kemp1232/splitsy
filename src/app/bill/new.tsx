import Feather from '@expo/vector-icons/Feather';
// A second icon family only for the "equals" glyph — Feather has none.
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import { useBillSourceActions } from '@/features/bills/useBillSourceActions';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { tint } from '@/theme/tint';
import { useTheme } from '@/theme/ThemeProvider';

type SourceOptionProps = {
  title: string;
  description: string;
  onPress: () => void;
  // Render-prop so each row picks its own icon family/glyph while the row
  // controls the size and color.
  icon: (color: string, size: number) => ReactNode;
  primary?: boolean;
  badge?: string;
  style?: StyleProp<ViewStyle>;
};

function SourceOption({
  title,
  description,
  onPress,
  icon,
  primary = false,
  badge,
  style,
}: SourceOptionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const label = badge ? `${title}, ${badge}, ${description}` : `${title}, ${description}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.option,
        primary ? styles.optionPrimary : null,
        pressed ? (primary ? styles.optionPrimaryPressed : styles.optionPressed) : null,
        style,
      ]}
    >
      {/* Decorative leading icon — the row's label already names the action,
          so it is hidden from screen readers. */}
      <View
        style={[styles.iconTile, primary ? styles.iconTilePrimary : null]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {icon(colors.primary, 18)}
      </View>
      <View style={styles.optionText}>
        {/* Wraps so the badge drops below the title on narrow screens or
            large font scales instead of overflowing. */}
        <View style={styles.titleRow}>
          <AppText variant="subheading" style={styles.uniformText}>
            {title}
          </AppText>
          {badge ? (
            <View style={styles.badge}>
              <AppText variant="caption" color="primary">
                {badge}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="caption" color="textSecondary">
          {description}
        </AppText>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Feather name="chevron-right" size={20} color={colors.textSecondary} />
      </View>
    </Pressable>
  );
}

export default function NewBillScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { pickFromGallery, startManual } = useBillSourceActions();
  // Double-tap guard: set on the first tap, released after async actions
  // settle or, for navigation pushes, when this screen regains focus.
  const busy = useRef(false);

  useFocusEffect(
    useCallback(() => {
      busy.current = false;
    }, []),
  );

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }

  function navigate(action: () => void) {
    if (busy.current) return;
    busy.current = true;
    action();
  }

  async function runAsync(action: () => Promise<unknown>) {
    if (busy.current) return;
    busy.current = true;
    try {
      await action();
    } finally {
      busy.current = false;
    }
  }

  return (
    <Screen tabBarHidden scroll padded={false}>
      <View style={styles.body}>
        <View style={styles.headerBlock}>
          <View style={styles.headingRow}>
            <IconButton
              accessibilityLabel={copy.newBill.backAccessibilityLabel}
              onPress={handleBack}
              icon={<Feather name="arrow-left" size={22} color={colors.textPrimary} />}
            />
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Feather name="file-text" size={24} color={colors.primary} />
            </View>
            <AppText variant="heading" style={styles.headingText} accessibilityRole="header">
              {copy.newBill.heading}
            </AppText>
          </View>
          <AppText variant="body" color="textSecondary" style={styles.uniformText}>
            {copy.newBill.body}
          </AppText>
        </View>

        <View style={styles.options}>
          <SourceOption
            primary
            title={copy.newBill.cameraTitle}
            description={copy.newBill.cameraDescription}
            badge={copy.newBill.cameraBadge}
            onPress={() => navigate(() => router.push('/bill/capture'))}
            icon={(color, size) => <Feather name="camera" size={size} color={color} />}
          />
          <SourceOption
            title={copy.newBill.galleryTitle}
            description={copy.newBill.galleryDescription}
            onPress={() => runAsync(pickFromGallery)}
            icon={(color, size) => <Feather name="image" size={size} color={color} />}
          />
          <SourceOption
            title={copy.newBill.manualTitle}
            description={copy.newBill.manualDescription}
            onPress={() => runAsync(startManual)}
            icon={(color, size) => <Feather name="edit-2" size={size} color={color} />}
          />
          <SourceOption
            title={copy.newBill.quickSplitTitle}
            description={copy.newBill.quickSplitDescription}
            onPress={() => navigate(() => router.push('/bill/quick-split'))}
            icon={(color, size) => <MaterialCommunityIcons name="equal" size={size} color={color} />}
          />
          <SourceOption
            title={copy.newBill.tripTitle}
            description={copy.newBill.tripDescription}
            onPress={() => navigate(() => router.push('/trip/new'))}
            icon={(color, size) => <Feather name="map-pin" size={size} color={color} />}
            style={styles.tripOption}
          />
        </View>
      </View>
    </Screen>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    uniformText: {
      fontSize: 14,
      lineHeight: 19,
    },
    body: {
      padding: spacing.lg,
      gap: spacing.lg,
    },
    headerBlock: {
      gap: spacing.xs,
    },
    headingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      // Pulls the back button's own touch-target padding flush with the
      // content edge.
      marginLeft: -spacing.md,
    },
    headingText: {
      flexShrink: 1,
    },
    options: {
      gap: spacing.sm,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: touchTarget.preferred,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    optionPressed: {
      backgroundColor: colors.surfaceMuted,
    },
    optionPrimary: {
      backgroundColor: tint(colors.primary),
      borderColor: colors.primary,
    },
    optionPrimaryPressed: {
      // Stronger low-alpha wash, same hex-suffix convention as tint().
      backgroundColor: `${colors.primary}40`,
    },
    tripOption: {
      // Extra separation on top of the list gap.
      marginTop: spacing.sm,
    },
    iconTile: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      borderCurve: 'continuous',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tint(colors.primary),
    },
    iconTilePrimary: {
      backgroundColor: `${colors.primary}33`,
    },
    optionText: {
      flex: 1,
      gap: 2,
    },
    titleRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: spacing.sm,
      rowGap: 2,
    },
    badge: {
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.primary,
      paddingHorizontal: spacing.sm,
      paddingVertical: 1,
    },
  });
}
