import { useState } from 'react';

import { AppTextInput } from './AppTextInput';

type Props = {
  label?: string;
  valueCentavos: number;
  onChangeCentavos: (centavos: number) => void;
  error?: string;
  placeholder?: string;
};

// Matches the spec's suggested max (₱9,999,999.99): up to 7 integer digits,
// optional 2 decimal digits.
const AMOUNT_PATTERN = /^\d{0,7}(\.\d{0,2})?$/;

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
}: Props) {
  const [text, setText] = useState(() => centavosToInputText(valueCentavos));

  function handleChange(next: string) {
    if (next !== '' && !AMOUNT_PATTERN.test(next)) return;
    setText(next);
    if (next === '' || next === '.') {
      onChangeCentavos(0);
      return;
    }
    onChangeCentavos(textToCentavos(next));
  }

  return (
    <AppTextInput
      label={label}
      error={error}
      value={text}
      onChangeText={handleChange}
      keyboardType="decimal-pad"
      placeholder={placeholder}
    />
  );
}
