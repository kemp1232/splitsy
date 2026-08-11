// Centavos are the source of truth everywhere money is stored or computed
// (spec section 10.1). Text-input parsing lives at the UI boundary
// (AmountInput.tsx's textToCentavos); allocation/splitting math lives in
// src/features/splitting/. This module owns display formatting and the
// shared "is this a valid money value" guard used by both.

// Spec section 10.1's suggested maximum bill amount, ₱9,999,999.99, as
// integer centavos. Exported so allocation tests and form validation share
// one definition of "large but still safe" instead of each guessing a limit.
export const MAX_SAFE_CENTAVOS = 999_999_999;

// True for a value that is safe to treat as money anywhere in the app: a
// finite integer within the configured safe range. Never NaN, never
// Infinity, never a fractional centavo, never larger than the configured
// maximum bill amount (spec section 10.1: "Reject NaN, infinity, and values
// outside configured safe limits").
export function isSafeCentavos(centavos: number): boolean {
  return Number.isInteger(centavos) && Math.abs(centavos) <= MAX_SAFE_CENTAVOS;
}

export function formatCentavos(centavos: number): string {
  const sign = centavos < 0 ? '-' : '';
  const pesos = Math.abs(centavos) / 100;
  const formatted = pesos.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}₱${formatted}`;
}

// A spoken-form counterpart to formatCentavos, for the handful of headline
// totals a screen reader should announce more naturally than "₱520.25" would
// read aloud character-by-character (spec section 17: "Currency labels should
// be understandable to screen readers, for example `520 pesos and 25
// centavos` where practical"). Deliberately not used everywhere formatCentavos
// is — small per-line amounts are left visual-only; only a screen's own
// headline total gets this as a distinct accessibilityLabel alongside its
// visible, formatCentavos-formatted text.
//
// Singular/plural is handled for both pesos and centavos (spec's own example
// pluralizes both), and a whole-peso amount omits the "and 0 centavos" tail
// entirely rather than reading out a redundant zero.
export function formatCentavosForSpeech(centavos: number): string {
  const sign = centavos < 0 ? 'negative ' : '';
  const magnitude = Math.abs(centavos);
  const pesos = Math.floor(magnitude / 100);
  const centavosPart = magnitude % 100;

  const pesosPhrase = `${pesos} ${pesos === 1 ? 'peso' : 'pesos'}`;
  if (centavosPart === 0) {
    return `${sign}${pesosPhrase}`;
  }

  const centavosPhrase = `${centavosPart} ${centavosPart === 1 ? 'centavo' : 'centavos'}`;
  return `${sign}${pesosPhrase} and ${centavosPhrase}`;
}
