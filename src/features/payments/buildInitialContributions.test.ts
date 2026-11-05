import { buildInitialContributions } from './buildInitialContributions';

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
});
