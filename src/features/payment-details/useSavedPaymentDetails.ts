import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getPaymentDetails, type PaymentDetails } from './paymentDetails.service';

// The user's saved payment details, re-read every time the screen gains
// focus so edits made in Settings show up on return. Null until loaded (or
// if loading failed) — callers treat that the same as "nothing saved".
export function useSavedPaymentDetails(): PaymentDetails | null {
  const [details, setDetails] = useState<PaymentDetails | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getPaymentDetails()
        .then((loaded) => {
          if (!cancelled) setDetails(loaded);
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return details;
}
