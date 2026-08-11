import { detectQuantity } from './detectQuantity';

describe('detectQuantity', () => {
  it('parses "2 BURGER 240.00" (leading plain quantity)', () => {
    expect(detectQuantity('2 BURGER 240.00')).toEqual({ quantity: 2, remainder: 'BURGER 240.00' });
  });

  it('parses "2x BURGER 240.00" (leading "Nx name")', () => {
    expect(detectQuantity('2x BURGER 240.00')).toEqual({ quantity: 2, remainder: 'BURGER 240.00' });
  });

  it('parses "2 X 120.00 240.00" (leading "N X unitPrice lineTotal")', () => {
    expect(detectQuantity('2 X 120.00 240.00')).toEqual({
      quantity: 2,
      remainder: '120.00 240.00',
    });
  });

  it('parses "2 @ 120.00 240.00" (leading "N @ unitPrice lineTotal")', () => {
    expect(detectQuantity('2 @ 120.00 240.00')).toEqual({
      quantity: 2,
      remainder: '120.00 240.00',
    });
  });

  it('parses "BURGER 2 240.00" (trailing quantity before the amount)', () => {
    expect(detectQuantity('BURGER 2 240.00')).toEqual({ quantity: 2, remainder: 'BURGER' });
  });

  it('falls back to quantity 1 and leaves the text untouched when nothing matches', () => {
    expect(detectQuantity('ICED TEA 60.00')).toEqual({ quantity: 1, remainder: 'ICED TEA 60.00' });
  });

  it('never lets quantity detection eat a plain single-item name that happens to start with a number-like word', () => {
    // "7 ELEVEN COFFEE 45.00" is a name, not a quantity of "ELEVEN COFFEE" —
    // this is an accepted limitation (spec: quantity is descriptive, and a
    // wrong guess never changes the stored line total).
    expect(detectQuantity('7 ELEVEN COFFEE 45.00').quantity).toBe(7);
  });

  it('parses "NAME 2@ unitPrice lineTotal" (mid-line bare quantity marker, from a reunited multi-line receipt row)', () => {
    // Real VLM-backend finding: a receipt that prints name, bare quantity
    // marker, unit price, and line total on 4 separate physical lines
    // reunites (normalizeOcr.ts's mergeFramelessLabelContinuations) into
    // "AJI TAMAGO 2@ 85.00v 170.00" — the marker sits between the name and
    // the amounts, not leading the line the way every other pattern assumes.
    expect(detectQuantity('AJI TAMAGO 2@ 85.00v 170.00')).toEqual({
      quantity: 2,
      remainder: 'AJI TAMAGO 85.00v 170.00',
    });
  });

  it('parses "NAME 1x unitPrice lineTotal" (mid-line "x"-shaped bare quantity marker)', () => {
    expect(detectQuantity('GYOZA 1x 270.00 270.00')).toEqual({
      quantity: 1,
      remainder: 'GYOZA 270.00 270.00',
    });
  });

  it('does not let the mid-line marker check fire when an earlier pattern already matched', () => {
    // "2x BURGER MEAL 240.00" is already handled by the leading "Nx name"
    // pattern — confirms the new mid-line fallback never double-matches or
    // overrides an earlier, more specific pattern.
    expect(detectQuantity('2x BURGER MEAL 240.00')).toEqual({
      quantity: 2,
      remainder: 'BURGER MEAL 240.00',
    });
  });

  it('parses "3 2PC BGRSTKSPR @202 606.00V" (real GrabFood-receipt shape: leading quantity glued onto a digit-leading item code)', () => {
    // Real GrabFood-receipt finding: the remainder after the leading
    // quantity digit is an item CODE that itself starts with a digit
    // ("2PC..."), not a letter — the original letter-only alternative missed
    // this entirely and quantity silently defaulted to 1.
    expect(detectQuantity('3 2PC BGRSTKSPR @202 606.00V')).toEqual({
      quantity: 3,
      remainder: '2PC BGRSTKSPR @202 606.00V',
    });
  });

  it('parses "1 1PC CKNJOY 100.00V" (same GrabFood shape, quantity 1)', () => {
    expect(detectQuantity('1 1PC CKNJOY 100.00V')).toEqual({
      quantity: 1,
      remainder: '1PC CKNJOY 100.00V',
    });
  });

  it('does not let two adjacent bare numbers create a new item-code ambiguity', () => {
    // "2 3.00" must not be misread as quantity 2 of an item code "3.00" — the
    // digit-leading item-code alternative requires letters immediately after
    // the leading digits, and a bare amount's digits are followed by "." not
    // a letter, so this still falls back to quantity 1 untouched.
    expect(detectQuantity('2 3.00')).toEqual({ quantity: 1, remainder: '2 3.00' });
  });

  it('parses "NAME (2 @ lineTotal" (real North Park Noodles-receipt shape: parenthesized mid-line quantity marker)', () => {
    // Real North Park Noodles dine-in-receipt finding: a parenthesized
    // quantity marker ("(2 @") sits between the item name and the amount —
    // a shape the existing bare "N@"/"Nx" mid-line marker never recognized
    // (it has no parenthesis).
    expect(detectQuantity('DR10 HONEY LEMONADE (2 @ 176.00')).toEqual({
      quantity: 2,
      remainder: 'DR10 HONEY LEMONADE 176.00',
    });
  });
});
