import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { TAB_BAR_CONTENT_CLEARANCE } from '@/components/ui/BottomTabBar';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { Divider } from '@/components/ui/Divider';
import { InlineError } from '@/components/ui/InlineError';
import { Screen } from '@/components/ui/Screen';
import { SectionCard } from '@/components/ui/SectionCard';
import { copy } from '@/constants/copy';
import { resetAllLocalData } from '@/features/bills/bill.service';
import { authClient } from '@/lib/authClient';
import type { ColorTokens } from '@/theme/tokens';
import { radius, spacing, touchTarget } from '@/theme/tokens';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';

// Constants.expoConfig?.version is populated from app.config.ts's `version`
// field (currently '1.0.0') at build time. The type is optional (it's
// theoretically undefined in a bare/non-Expo-managed environment), so a
// fallback keeps this screen from ever rendering an empty version row even
// though that shouldn't happen in practice for this project.
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

const APPEARANCE_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: copy.settings.appearanceSystem },
  { value: 'light', label: copy.settings.appearanceLight },
  { value: 'dark', label: copy.settings.appearanceDark },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logOutError, setLogOutError] = useState<string | null>(null);

  async function handleLogOut() {
    setLogOutError(null);
    setLoggingOut(true);
    try {
      const { error } = await authClient.signOut();
      if (error) {
        setLogOutError(copy.auth.logOutFailure);
        setLoggingOut(false);
        return;
      }
      // No manual navigation: the root layout's SessionGate
      // (src/app/_layout.tsx) reacts to the session clearing on its own and
      // swaps the visible route tree back to (auth), same as sign-in.tsx/
      // register.tsx never navigating themselves on success.
    } catch {
      setLogOutError(copy.auth.logOutFailure);
      setLoggingOut(false);
    }
  }

  async function handleConfirmDeleteAll() {
    setShowDeleteAllConfirm(false);
    try {
      await resetAllLocalData();
    } catch {
      // No exact spec 14 copy for "delete all local data" specifically
      // ("Delete failure" is worded around a single bill, "Storage failure"
      // around saving changes) — reused verbatim rather than picking whichever
      // reads slightly off. It's also literally accurate here:
      // resetAllLocalData's own DB step is one transaction, so a failure this
      // catches means nothing was actually deleted yet.
      setDeleteAllError(copy.global.genericErrorBody);
      return;
    }
    setDeleteAllError(null);
    // Replace rather than push: once every bill is gone, there's nothing left
    // for "back" to usefully return to on this screen, and the home screen's
    // own load effect naturally renders its empty state (spec F-020/F-002).
    router.replace('/');
  }

  return (
    <Screen scroll>
      <View style={styles.body}>
        <AppText variant="heading">{copy.settings.heading}</AppText>

        <SectionCard title={copy.settings.appearanceSection}>
          <View style={styles.appearanceRow} accessibilityRole="radiogroup">
            {APPEARANCE_OPTIONS.map((option) => {
              const selected = preference === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setPreference(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.appearanceOption,
                    selected && styles.appearanceOptionSelected,
                    pressed && styles.appearanceOptionPressed,
                  ]}
                >
                  {/* Selection is conveyed by the check icon, not only the
                      option's background color (spec section 17) — was a
                      literal "✓ " text prefix before the icon pass. */}
                  <View style={styles.appearanceOptionContent}>
                    {selected ? (
                      <Feather name="check" size={16} color={colors.onPrimary} />
                    ) : null}
                    <AppText variant="body" color={selected ? 'onPrimary' : 'textPrimary'}>
                      {option.label}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </SectionCard>

        <SectionCard title={copy.auth.accountSection}>
          <AppButton
            variant="secondary"
            label={copy.auth.logOutAction}
            onPress={handleLogOut}
            loading={loggingOut}
            icon={(color) => <Feather name="log-out" size={18} color={color} />}
          />
          {logOutError ? <InlineError message={logOutError} /> : null}
        </SectionCard>

        <SectionCard title={copy.settings.privacySection}>
          <AppText color="textSecondary">{copy.settings.privacyBody}</AppText>
        </SectionCard>

        <SectionCard title={copy.settings.dataSection}>
          <AppButton
            variant="destructive"
            label={copy.settings.deleteAllAction}
            onPress={() => setShowDeleteAllConfirm(true)}
            icon={(color) => <Feather name="trash" size={18} color={color} />}
          />
          {deleteAllError ? <InlineError message={deleteAllError} /> : null}
        </SectionCard>

        <SectionCard title={copy.settings.aboutSection}>
          <AppText color="textSecondary">{copy.settings.aboutBody}</AppText>
          <Divider />
          <View style={styles.row}>
            <AppText color="textSecondary">{copy.settings.versionLabel}</AppText>
            <AppText>{APP_VERSION}</AppText>
          </View>
        </SectionCard>
      </View>

      <ConfirmationDialog
        visible={showDeleteAllConfirm}
        heading={copy.settings.deleteAllHeading}
        body={copy.settings.deleteAllBody}
        confirmLabel={copy.settings.deleteAllConfirm}
        cancelLabel={copy.settings.deleteAllCancel}
        destructive
        onConfirm={handleConfirmDeleteAll}
        onCancel={() => setShowDeleteAllConfirm(false)}
      />
    </Screen>
  );
}

function createStyles(colors: ColorTokens) {
  return StyleSheet.create({
    body: {
      // Section-to-section rhythm (heading, then each SectionCard) — spacing
      // within a card is SectionCard's own spacing.sm.
      gap: spacing.xl,
      // So the last card isn't hidden underneath the persistent tab bar
      // that now floats over this screen.
      paddingBottom: TAB_BAR_CONTENT_CLEARANCE,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    appearanceRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    appearanceOption: {
      minHeight: touchTarget.min,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    appearanceOptionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    appearanceOptionSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    appearanceOptionPressed: {
      opacity: 0.85,
    },
  });
}
