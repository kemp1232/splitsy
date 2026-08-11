import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { Divider } from '@/components/ui/Divider';
import { InlineError } from '@/components/ui/InlineError';
import { Screen } from '@/components/ui/Screen';
import { SectionCard } from '@/components/ui/SectionCard';
import { copy } from '@/constants/copy';
import { resetAllLocalData } from '@/features/bills/bill.service';
import { spacing } from '@/theme/tokens';

// Constants.expoConfig?.version is populated from app.config.ts's `version`
// field (currently '1.0.0') at build time. The type is optional (it's
// theoretically undefined in a bare/non-Expo-managed environment), so a
// fallback keeps this screen from ever rendering an empty version row even
// though that shouldn't happen in practice for this project.
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function SettingsScreen() {
  const router = useRouter();
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);

  function handleConfirmDeleteAll() {
    setShowDeleteAllConfirm(false);
    try {
      resetAllLocalData();
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

        <SectionCard title={copy.settings.privacySection}>
          <AppText color="textSecondary">{copy.settings.privacyBody}</AppText>
        </SectionCard>

        <SectionCard title={copy.settings.dataSection}>
          <AppButton
            variant="destructive"
            label={copy.settings.deleteAllAction}
            onPress={() => setShowDeleteAllConfirm(true)}
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

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
