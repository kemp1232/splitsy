import type { ComponentProps, ReactNode } from 'react';
import { useState } from 'react';

import { copy } from '@/constants/copy';

import { AppTextInput } from './AppTextInput';

type Props = {
  label?: string;
  valueCentavos: number;
  onChangeCentavos: (centavos: number) => void;
  error?: string;
  placeholder?: string;
  // Forwarded to AppTextInput's leadingIcon (e.g. a fixed currency sign that
  // sits outside the editable text). Omitted by every other call site.
  leadingIcon?: (color: string) => ReactNode;
  // Forwarded to AppTextInput (see its hideErrorMessage); off by default.
  hideErrorMessage?: boolean;
  // Forwarded to AppTextInput's text input, e.g. to match a neighbouring
  // field's height.
  style?: ComponentProps<typeof AppTextInput>['style'];
};

// Matches the spec's suggested max (₱9,999,999.99): up to 7 integer digits,
// optional 2 decimal digits.
const AMOUNT_PATTERN = /^\d{0,7}(\.\d{0,2})?$/;

// Integer part written with thousands separators: 1-3 leading digits, then
// one or more ",ddd" groups ("1,234", "12,345", "1,234,567").
const THOUSANDS_GROUPED_PATTERN = /^\d{1,3}(,\d{3})+$/;

// Pasted/typed amounts often carry formatting the field itself never needs:
// a peso sign or "PHP", thousands commas, surrounding or inner spaces
// ("₱1,234.56", " 170 "). Strips those, then checks the result against
// AMOUNT_PATTERN. A comma is only accepted as a thousands separator — any
// other comma ("12,50", "1,2") makes the text invalid rather than silently
// turning it into a 100x bigger amount. null means the text still isn't an
// amount (letters, a second dot, more than 7 integer digits) — the field
// shows an error for it instead of silently dropping the input.
export function normalizeAmountText(raw: string): string | null {
  let compact = raw.replace(/₱|php/gi, '').replace(/\s/g, '');
  if (compact.includes(',')) {
    const dotIndex = compact.indexOf('.');
    const integerPart = dotIndex === -1 ? compact : compact.slice(0, dotIndex);
    const rest = dotIndex === -1 ? '' : compact.slice(dotIndex);
    if (!THOUSANDS_GROUPED_PATTERN.test(integerPart) || rest.includes(',')) return null;
    compact = integerPart.replace(/,/g, '') + rest;
  }
  return AMOUNT_PATTERN.test(compact) ? compact : null;
}

function centavosToInputText(centavos: number): string {
  return centavos === 0 ? '' : (centavos / 100).toFixed(2);
}

// String-based, like detectAmounts.ts's toCentavos — parseFloat + Math.round
// happens to round-trip correctly for every 2-decimal value in the spec's
// valid range, but that's incidental, not guaranteed, and this codebase's own
// standard (spec section 10.1) is to never let money pass through a float.
export function textToCentavos(text: string): number {
  const [integerPart, decimalPart = ''] = text.split('.');
  const centavosPart = decimalPart.padEnd(2, '0').slice(0, 2);
  return Number(integerPart || '0') * 100 + Number(centavosPart);
}

// The displayed text is local, editable state — never derive it from
// valueCentavos on every render, or an in-progress "12." would get reformatted
// out from under the user mid-keystroke. Formatted currency stays a display
// concern only; onChangeCentavos is always the integer-centavo source of truth.
export function AmountInput({
  label,
  valueCentavos,
  onChangeCentavos,
  error,
  placeholder = '0.00',
  leadingIcon,
  hideErrorMessage,
  style,
}: Props) {
  const [text, setText] = useState(() => centavosToInputText(valueCentavos));
  // Input that still isn't an amount after normalizing is rejected visibly:
  // the field keeps showing its last valid text (so what's displayed always
  // matches the value the parent holds) with this error under it, until the
  // next valid change or a re-sync from the parent clears it.
  const [invalidText, setInvalidText] = useState(false);
  // Re-sync the text when the parent changes valueCentavos to something the
  // text no longer represents — e.g. an editor sheet re-seeding its state in
  // its Modal's onShow, which runs after this input has already mounted with
  // the previous item's value. A value that the current text already
  // represents (like 1200 for an in-progress "12.") leaves the text alone.
  const [syncedCentavos, setSyncedCentavos] = useState(valueCentavos);
  if (valueCentavos !== syncedCentavos) {
    setSyncedCentavos(valueCentavos);
    setInvalidText(false);
    if (textToCentavos(text) !== valueCentavos) {
      setText(centavosToInputText(valueCentavos));
    }
  }

  function handleChange(next: string) {
    const normalized = normalizeAmountText(next);
    if (normalized === null) {
      // Text is left as it was (the last valid amount, matching the parent's
      // value); only the error shows.
      setInvalidText(true);
      return;
    }
    setInvalidText(false);
    setText(normalized);
    if (normalized === '' || normalized === '.') {
      onChangeCentavos(0);
      return;
    }
    onChangeCentavos(textToCentavos(normalized));
  }

  return (
    <AppTextInput
      label={label}
      error={invalidText ? copy.global.invalidAmountError : error}
      value={text}
      onChangeText={handleChange}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      leadingIcon={leadingIcon}
      hideErrorMessage={hideErrorMessage}
      style={style}
    />
  );
}
