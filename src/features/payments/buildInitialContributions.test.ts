import { buildInitialContributions, followWholeBillPayer } from './buildInitialContributions';

const unpaid = [
  { id: 'a', name: 'Kemp Sayson', contributedCentavos: 0 },
  { id: 'b', name: 'Alex', contributedCentavos: 0 },
];

describe('buildInitialContributions', () => {
  it('pre-fills the signed-in user with the full total when nothing is saved yet', () => {
    expect(buildInitialContributions(unpaid, 52025, 'Kemp Sayson')).toEqual({ a: 52025, b: 0 });
  });

  it('matches the signed-in user case-insensitively and ignoring surrounding spaces', () => {
    expect(buildInitialContributions(unpaid, 52025, '  kemp sayson ')).toEqual({ a: 52025, b: 0 });
  });

  it('falls back to a legacy "Me" participant', () => {
    const participants = [
      { id: 'a', name: 'Me', contributedCentavos: 0 },
      { id: 'b', name: 'Alex', contributedCentavos: 0 },
    ];
    expect(buildInitialContributions(participants, 10000, 'Kemp Sayson')).toEqual({
      a: 10000,
      b: 0,
    });
  });

  it('does not pre-fill when no participant matches the signed-in user', () => {
    expect(buildInitialContributions(unpaid, 52025, 'Jordan')).toEqual({ a: 0, b: 0 });
  });

  it('keeps saved contributions as loaded once any are nonzero', () => {
    const participants = [
      { id: 'a', name: 'Kemp Sayson', contributedCentavos: 0 },
      { id: 'b', name: 'Alex', contributedCentavos: 30000 },
    ];
    expect(buildInitialContributions(participants, 52025, 'Kemp Sayson')).toEqual({
      a: 0,
      b: 30000,
    });
  });

  it('updates a single whole-bill payer to the new total when the saved amount is stale', () => {
    const participants = [
      { id: 'a', name: 'Kemp Sayson', contributedCentavos: 52025 },
      { id: 'b', name: 'Alex', contributedCentavos: 0 },
    ];
    expect(buildInitialContributions(participants, 61000, 'Kemp Sayson')).toEqual({
      a: 61000,
      b: 0,
    });
  });

  it('keeps split contributions when the signed-in user is not the only payer', () => {
    const participants = [
      { id: 'a', name: 'Kemp Sayson', contributedCentavos: 20000 },
      { id: 'b', name: 'Alex', contributedCentavos: 30000 },
    ];
    expect(buildInitialContributions(participants, 61000, 'Kemp Sayson')).toEqual({
      a: 20000,
      b: 30000,
    });
  });
});

describe('followWholeBillPayer', () => {
  it('moves a single whole-bill payer to the new total', () => {
    expect(followWholeBillPayer({ a: 52025, b: 0 }, 52025, 61000)).toEqual({ a: 61000, b: 0 });
  });

  it('keeps split contributions', () => {
    const contributions = { a: 20000, b: 32025 };
    expect(followWholeBillPayer(contributions, 52025, 61000)).toBe(contributions);
  });

  it('keeps a single partial payment that is not the previous total', () => {
    const contributions = { a: 30000, b: 0 };
    expect(followWholeBillPayer(contributions, 52025, 61000)).toBe(contributions);
  });

  it('returns the same contributions when the total did not change', () => {
    const contributions = { a: 52025, b: 0 };
    expect(followWholeBillPayer(contributions, 52025, 52025)).toBe(contributions);
  });

  it('leaves contributions untouched when nobody has paid', () => {
    const contributions = { a: 0, b: 0 };
    expect(followWholeBillPayer(contributions, 52025, 61000)).toBe(contributions);
  });
});
