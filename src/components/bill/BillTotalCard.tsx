import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { SectionCard } from '@/components/ui/SectionCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { copy } from '@/constants/copy';
import { formatCentavos, formatCentavosForSpeech } from '@/lib/money';
import { spacing } from '@/theme/tokens';

type Props = {
  // The bill's computed total (splitResult.computedTotalCentavos at every
  // call site). This card only displays it, so no money math happens here.
  totalCentavos: number;
  // null when no total was detected on the receipt, so there is nothing to
  // reconcile against and the badge is skipped entirely.
  matchStatus: 'matches' | 'mismatch' | null;
  // Optional context line (e.g. "Title · date") for screens whose header
  // doesn't already show which bill this is.
  caption?: string;
};

// Shared by the summary and saved-bill-detail screens, so "Everyone's share"
// shows the total and receipt-match badge exactly as the finished bill does.
export function BillTotalCard({ totalCentavos, matchStatus, caption }: Props) {
  return (
    <SectionCard>
      {caption ? (
        <AppText variant="caption" color="textSecondary">
          {caption}
        </AppText>
      ) : null}
      <View style={styles.totalRow}>
        <AppText variant="subheading">{copy.summary.totalLabel}</AppText>
        {/* accessibilityLabel is the spoken form (spec section 17's "520
            pesos and 25 centavos" example), distinct from the visible
            formatCentavos text. */}
        <AppText
          variant="amount"
          accessibilityLabel={formatCentavosForSpeech(totalCentavos)}
          style={styles.totalAmount}
        >
          {formatCentavos(totalCentavos)}
        </AppText>
      </View>
      {matchStatus ? (
        <StatusBadge
          label={
            matchStatus === 'matches' ? copy.summary.matchSuccess : copy.summary.mismatchStatus
          }
          tone={matchStatus === 'matches' ? 'success' : 'warning'}
        />
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  // Same size as receipt-review.tsx's own current-total amount.
  totalAmount: {
    fontSize: 20,
    lineHeight: 26,
  },
});
