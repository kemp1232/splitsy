import Feather from '@expo/vector-icons/Feather';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { DeleteAccountDialog } from '@/components/settings/DeleteAccountDialog';
import { PrivacyDetailsModal } from '@/components/settings/PrivacyDetailsModal';
import { AppText } from '@/components/ui/AppText';
import { TAB_BAR_CONTENT_CLEARANCE } from '@/components/ui/BottomTabBar';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { GroupedCard, GroupedSeparator, SectionHeader } from '@/components/ui/GroupedSection';
import { InlineError } from '@/components/ui/InlineError';
import { Screen } from '@/components/ui/Screen';
import { ACCOUNT_DELETION_URL, PRIVACY_POLICY_URL } from '@/constants/config';
import { copy } from '@/constants/copy';
import { deleteAccount, type DeleteAccountFailure } from '@/features/auth/deleteAccount';
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

const APPEARANCE_OPTIONS: { value: ThemePreference; label: string; icon: FeatherName }[] = [
  { value: 'system', label: copy.settings.appearanceSystem, icon: 'smartphone' },
  { value: 'light', label: copy.settings.appearanceLight, icon: 'sun' },
  { value: 'dark', label: copy.settings.appearanceDark, icon: 'moon' },
];

const PRIVACY_SUMMARY = [
  { title: copy.settings.privacyLocalTitle, body: copy.settings.privacyLocalBody },
  { title: copy.settings.privacyOcrTitle, body: copy.settings.privacyOcrBody },
  { title: copy.settings.privacyServerTitle, body: copy.settings.privacyServerBody },
];

type FeatherName = ComponentProps<typeof Feather>['name'];

// Section title row with a leading icon — GroupedSection's SectionHeader has
// no icon slot, so it's composed here rather than widening that shared API
// for one screen.
function SettingsSectionHeader({
  icon,
  title,
  caption,
}: {
  icon: FeatherName;
  title: string;
  caption?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={staticStyles.sectionHeader}>
      <Feather
        name={icon}
        size={20}
        color={colors.textSecondary}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View style={staticStyles.flex}>
        <SectionHeader title={title} caption={caption} />
      </View>
    </View>
  );
}

type SettingsRowProps = {
  icon: FeatherName;
  title: string;
  caption?: string;
  onPress: () => void;
  destructive?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
};

// One full-width tappable row inside a GroupedCard: icon, title (+ optional
// caption), and a trailing chevron — ActionRow.tsx's shape without its own
// border, since the GroupedCard supplies that. `loading` swaps the chevron for
// a spinner and disables the row.
function SettingsRow({
  icon,
  title,
  caption,
  onPress,
  destructive,
  loading,
  accessibilityHint,
}: SettingsRowProps) {
  const { colors } = useTheme();
  const pressedStyle = useMemo(() => createRowPressedStyle(colors), [colors]);
  const tone = destructive ? colors.danger : colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={caption ? `${title}, ${caption}` : title}
      accessibilityHint={accessibilityHint}
      aria-disabled={!!loading}
      aria-busy={!!loading}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        staticStyles.row,
        staticStyles.pressableRow,
        pressed && pressedStyle.pressed,
        loading && staticStyles.rowDisabled,
      ]}
    >
      <Feather
        name={icon}
        size={20}
        color={tone}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View style={staticStyles.rowText}>
        <AppText color={destructive ? 'danger' : 'textPrimary'}>{title}</AppText>
        {caption ? (
          <AppText variant="caption" color="textSecondary">
            {caption}
          </AppText>
        ) : null}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : (
        <Feather
          name="chevron-right"
          size={20}
          color={colors.textSecondary}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      )}
    </Pressable>
  );
}

const DELETE_ACCOUNT_ERRORS: Record<DeleteAccountFailure, string> = {
  wrong_password: copy.auth.deleteAccountWrongPassword,
  network: copy.auth.deleteAccountNetworkError,
  failed: copy.auth.deleteAccountFailure,
  local_reset_failed: copy.auth.deleteAccountLocalResetFailure,
};

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logOutError, setLogOutError] = useState<string | null>(null);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Returns the inline error for DeleteAccountDialog, or null on success —
  // after which the root SessionGate swaps to the (auth) screens on its own
  // (see deleteAccount.ts), same as log out never navigating itself.
  async function handleConfirmDeleteAccount(password: string): Promise<string | null> {
    const result = await deleteAccount(password);
    if (result.ok) {
      setShowDeleteAccount(false);
      return null;
    }
    return DELETE_ACCOUNT_ERRORS[result.reason];
  }

  async function openExternal(url: string) {
    setLinkError(null);
    try {
      // expo-linking's web openURL assigns window.location, which would
      // replace the app in this tab — open a new tab instead.
      if (Platform.OS === 'web') {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      await Linking.openURL(url);
    } catch {
      setLinkError(copy.settings.linkOpenFailure);
    }
  }

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
        <AppText variant="title" accessibilityRole="header">
          {copy.settings.heading}
        </AppText>

        <View style={styles.section}>
          <SettingsSectionHeader
            icon="sliders"
            title={copy.settings.appearanceSection}
            caption={copy.settings.appearanceCaption}
          />
          <View style={styles.segmentRow} accessibilityRole="radiogroup">
            {APPEARANCE_OPTIONS.map((option) => {
              const selected = preference === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setPreference(option.value)}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  aria-checked={selected}
                  style={({ pressed }) => [
                    styles.segment,
                    selected && styles.segmentSelected,
                    pressed && styles.segmentPressed,
                  ]}
                >
                  {/* Icon stacked above the label so "Match system" gets the
                      segment's full width. Selection isn't conveyed by color
                      alone (spec section 17): the selected label is also
                      bold. The label has no line limit, so at large font
                      sizes it wraps rather than clips; the row's default
                      stretch alignment keeps all three segments the same
                      height. */}
                  <Feather
                    name={option.icon}
                    size={18}
                    color={selected ? colors.onPrimary : colors.textSecondary}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  />
                  <AppText
                    variant="caption"
                    color={selected ? 'onPrimary' : 'textPrimary'}
                    style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}
                  >
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <SettingsSectionHeader icon="user" title={copy.auth.accountSection} />
          <GroupedCard>
            <SettingsRow
              icon="log-out"
              title={copy.auth.logOutAction}
              onPress={handleLogOut}
              loading={loggingOut}
            />
            <GroupedSeparator />
            <SettingsRow
              icon="user-x"
              title={copy.auth.deleteAccountAction}
              caption={copy.auth.deleteAccountCaption}
              destructive
              onPress={() => setShowDeleteAccount(true)}
            />
          </GroupedCard>
          {logOutError ? <InlineError message={logOutError} /> : null}
        </View>

        <View style={styles.section}>
          <SettingsSectionHeader icon="shield" title={copy.settings.privacySection} />
          <GroupedCard>
            {PRIVACY_SUMMARY.map((item) => (
              <View key={item.title}>
                <View
                  accessible
                  accessibilityLabel={`${item.title}, ${item.body}`}
                  style={[staticStyles.row, styles.summaryText]}
                >
                  <AppText>{item.title}</AppText>
                  <AppText variant="caption" color="textSecondary">
                    {item.body}
                  </AppText>
                </View>
                <GroupedSeparator />
              </View>
            ))}
            <SettingsRow
              icon="info"
              title={copy.settings.privacyLearnMore}
              accessibilityHint={copy.settings.privacyLearnMoreHint}
              onPress={() => setShowPrivacyDetails(true)}
            />
            {PRIVACY_POLICY_URL ? (
              <>
                <GroupedSeparator />
                <SettingsRow
                  icon="external-link"
                  title={copy.settings.privacyPolicyAction}
                  accessibilityHint={copy.settings.privacyPolicyHint}
                  onPress={() => openExternal(PRIVACY_POLICY_URL)}
                />
              </>
            ) : null}
            {ACCOUNT_DELETION_URL ? (
              <>
                <GroupedSeparator />
                <SettingsRow
                  icon="external-link"
                  title={copy.auth.deleteAccountWebAction}
                  onPress={() => openExternal(ACCOUNT_DELETION_URL)}
                />
              </>
            ) : null}
          </GroupedCard>
          {linkError ? <InlineError message={linkError} /> : null}
        </View>

        <View style={styles.section}>
          <SettingsSectionHeader icon="database" title={copy.settings.dataSection} />
          <GroupedCard>
            <SettingsRow
              icon="trash-2"
              title={copy.settings.deleteAllAction}
              caption={copy.settings.deleteAllCaption}
              destructive
              onPress={() => setShowDeleteAllConfirm(true)}
            />
          </GroupedCard>
          {deleteAllError ? <InlineError message={deleteAllError} /> : null}
        </View>

        <View style={styles.section}>
          <SettingsSectionHeader icon="smartphone" title={copy.settings.aboutSection} />
          <AppText color="textSecondary">{copy.settings.aboutBody}</AppText>
          <GroupedCard>
            <View style={[staticStyles.row, styles.versionRow]}>
              <AppText color="textSecondary">{copy.settings.versionLabel}</AppText>
              <AppText>{APP_VERSION}</AppText>
            </View>
          </GroupedCard>
        </View>
      </View>

      <PrivacyDetailsModal
        visible={showPrivacyDetails}
        onClose={() => setShowPrivacyDetails(false)}
      />

      <DeleteAccountDialog
        visible={showDeleteAccount}
        onConfirm={handleConfirmDeleteAccount}
        onCancel={() => setShowDeleteAccount(false)}
      />

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
      // Section-to-section rhythm (heading, then each section) — tighter
      // than the old spacing.xl for the compact grouped layout.
      gap: spacing.lg,
      // So the last card isn't hidden underneath the persistent tab bar
      // that now floats over this screen.
      paddingBottom: TAB_BAR_CONTENT_CLEARANCE,
    },
    section: {
      gap: spacing.sm,
    },
    summaryText: {
      gap: 2,
    },
    versionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    segmentRow: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    segment: {
      flex: 1,
      minHeight: touchTarget.min,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.sm,
      borderRadius: radius.button,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    segmentLabel: {
      textAlign: 'center',
    },
    segmentLabelSelected: {
      fontWeight: '600',
    },
    segmentSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    segmentPressed: {
      opacity: 0.85,
    },
  });
}

// SettingsRow's only themed style — kept separate so each row builds this one
// small sheet instead of the whole screen's createStyles.
function createRowPressedStyle(colors: ColorTokens) {
  return StyleSheet.create({
    pressed: {
      backgroundColor: colors.surfaceMuted,
    },
  });
}

const staticStyles = StyleSheet.create({
  // Shared padding/height for every row inside a GroupedCard.
  row: {
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  pressableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  // Same dimmed treatment as AppButton's own disabled/loading state.
  rowDisabled: {
    opacity: 0.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
