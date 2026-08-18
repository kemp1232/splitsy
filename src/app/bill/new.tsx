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
};

function SourceOption({ title, description, onPress }: SourceOptionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
    >
      <AppText variant="subheading">{title}</AppText>
      <AppText variant="body" color="textSecondary">
        {description}
      </AppText>
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
        />
        <SourceOption
          title={copy.newBill.galleryTitle}
          description={copy.newBill.galleryDescription}
          onPress={pickFromGallery}
        />
        <SourceOption
          title={copy.newBill.manualTitle}
          description={copy.newBill.manualDescription}
          onPress={startManual}
        />
        <SourceOption
          title={copy.newBill.quickSplitTitle}
          description={copy.newBill.quickSplitDescription}
          onPress={() => router.push('/bill/quick-split')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  options: {
    gap: spacing.sm,
  },
});

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    option: {
      padding: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 2,
    },
    optionPressed: {
      backgroundColor: colors.surfaceMuted,
    },
  });
}
