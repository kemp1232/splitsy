import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { ensureBillEditable } from './billEditSession';

// Used by every bill-wizard screen (receipt-review, participants,
// assignments, adjustments, payments, summary): each time one gains focus, a
// bill that went back to COMPLETED underneath it (see ensureBillEditable) is
// put back into edit mode. Focus only — never after summary's own "Finish
// and save", which sets COMPLETED and then navigates away without this
// screen regaining focus. Best-effort: a failure leaves the bill as it is.
export function useEnsureBillEditable(billId: string): void {
  useFocusEffect(
    useCallback(() => {
      if (!billId) return;
      ensureBillEditable(billId).catch(() => undefined);
    }, [billId]),
  );
}
