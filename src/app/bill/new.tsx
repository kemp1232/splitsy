import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { copy } from '@/constants/copy';
import { useBillSourceActions } from '@/features/bills/useBillSourceActions';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type SourceOptionProps = {
  title: string;
  description: string;
  onPress: () => void;
  // Icon-mapping table glyph name for this row — a plain Feather name rather
  // than a pre-built element, since this row (unlike AppButton's `icon`
  // render-prop) always renders it the same size/color regardless of variant.
  iconName: keyof typeof Feather.glyphMap;
};

function SourceOption({ title, description, onPress, iconName }: SourceOptionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
    >
      {/* Decorative leading icon (row shape mirrors BillListItem's own
          circle-thumbnail) — the row's title text already names the action,
          so this glyph is hidden from screen readers rather than announced
          on its own. */}
      <View
        style={styles.iconBadge}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Feather name={iconName} size={20} color={colors.primary} />
      </View>
      <View style={styles.optionText}>
        <AppText variant="subheading">{title}</AppText>
        <AppText variant="body" color="textSecondary">
          {description}
        </AppText>
      </View>
    </Pressable>
  );
}

export default function NewBillScreen() {
  const router = useRouter();
  const { pickFromGallery, startManual } = useBillSourceActions();

  return (
    <Screen>
      <AppText variant="heading">{copy.newBill.heading}</AppText>
      <AppText variant="body" color="textSecondary" style={styles.body}>
        {copy.newBill.body}
      </AppText>

      <View style={styles.options}>
        <SourceOption
          title={copy.newBill.cameraTitle}
          description={copy.newBill.cameraDescription}
          onPress={() => router.push('/bill/capture')}
          iconName="camera"
        />
        <SourceOption
          title={copy.newBill.galleryTitle}
          description={copy.newBill.galleryDescription}
          onPress={pickFromGallery}
          iconName="image"
        />
        <SourceOption
          title={copy.newBill.manualTitle}
          description={copy.newBill.manualDescription}
          onPress={startManual}
          iconName="edit-2"
        />
        <SourceOption
          title={copy.newBill.quickSplitTitle}
          description={copy.newBill.quickSplitDescription}
          onPress={() => router.push('/bill/quick-split')}
          iconName="plus"
        />
        <SourceOption
          title={copy.newBill.tripTitle}
          description={copy.newBill.tripDescription}
          onPress={() => router.push('/trip/new')}
          iconName="map-pin"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    marginTop: spacing.xs,
    // Section-to-section gap between the intro text and the option list
    // below it.
    marginBottom: spacing.xl,
  },
  options: {
    gap: spacing.sm,
  },
});

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.lg,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: spacing.md,
    },
    optionPressed: {
      backgroundColor: colors.surfaceMuted,
    },
    iconBadge: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionText: {
      flex: 1,
      gap: 2,
    },
  });
}
